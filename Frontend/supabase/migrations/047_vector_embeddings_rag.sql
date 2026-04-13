-- Migration: 047_vector_embeddings_rag.sql
-- Phase 2: Vector search and RAG implementation

BEGIN;

-- Table for storing embedding metadata
CREATE TABLE IF NOT EXISTS requirement_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_id UUID NOT NULL UNIQUE REFERENCES requirements(id) ON DELETE CASCADE,
  embedding_model TEXT NOT NULL DEFAULT 'text-embedding-3-small',
  embedding_version INT DEFAULT 1,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_requirement_embeddings_requirement_id ON requirement_embeddings(requirement_id);
CREATE INDEX IF NOT EXISTS idx_requirement_embeddings_model ON requirement_embeddings(embedding_model);

-- Enable RLS on embeddings metadata
ALTER TABLE requirement_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view embeddings for their requirements"
  ON requirement_embeddings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM requirements
      WHERE requirements.id = requirement_embeddings.requirement_id
      AND requirements.user_id = auth.uid()
    )
  );

-- Create similar requirements search function
CREATE OR REPLACE FUNCTION search_similar_requirements(
  p_user_id UUID,
  p_embedding vector(1536),
  p_limit INT DEFAULT 5,
  p_similarity_threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  company TEXT,
  description TEXT,
  rate TEXT,
  status TEXT,
  similarity_score FLOAT,
  distance FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id,
    r.title,
    r.company,
    r.description,
    r.rate,
    r.status::TEXT,
    (1 - (r.description_embedding <=> p_embedding))::FLOAT as similarity_score,
    (r.description_embedding <=> p_embedding)::FLOAT as distance
  FROM requirements r
  WHERE r.user_id = p_user_id
    AND r.description_embedding IS NOT NULL
    AND r.id != (SELECT requirement_id FROM requirement_embeddings WHERE embedding_model = 'text-embedding-3-small' LIMIT 1)
  ORDER BY r.description_embedding <=> p_embedding
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to find duplicate requirements by similarity
CREATE OR REPLACE FUNCTION find_similar_duplicates(
  p_user_id UUID,
  p_requirement_id UUID,
  p_similarity_threshold FLOAT DEFAULT 0.85
)
RETURNS TABLE (
  duplicate_id UUID,
  title TEXT,
  company TEXT,
  similarity_score FLOAT
) AS $$
BEGIN
  RETURN QUERY
  WITH current_req AS (
    SELECT description_embedding FROM requirements
    WHERE id = p_requirement_id AND user_id = p_user_id
  )
  SELECT
    r.id,
    r.title,
    r.company,
    (1 - (r.description_embedding <=> cr.description_embedding))::FLOAT as similarity_score
  FROM requirements r, current_req cr
  WHERE r.user_id = p_user_id
    AND r.id != p_requirement_id
    AND r.description_embedding IS NOT NULL
    AND cr.description_embedding IS NOT NULL
    AND (1 - (r.description_embedding <=> cr.description_embedding)) > p_similarity_threshold
  ORDER BY (r.description_embedding <=> cr.description_embedding)
  LIMIT 5;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to extract skills from description using AI output
CREATE OR REPLACE FUNCTION extract_skills_from_requirement(
  p_requirement_id UUID
)
RETURNS TABLE (
  skill TEXT,
  frequency INT,
  relevance FLOAT
) AS $$
BEGIN
  RETURN QUERY
  WITH skill_text AS (
    SELECT 
      COALESCE(primary_tech_stack, '') || ' ' || COALESCE(description, '') as full_text
    FROM requirements
    WHERE id = p_requirement_id
  ),
  skills AS (
    SELECT 
      TRIM(skill)::TEXT as skill
    FROM skill_text,
    LATERAL regexp_split_to_table(full_text, ',|;|\s+') as skill
    WHERE TRIM(skill) != '' AND LENGTH(TRIM(skill)) > 2
  )
  SELECT
    skill,
    COUNT(*)::INT as frequency,
    (COUNT(*)::FLOAT / (SELECT COUNT(*) FROM skills))::FLOAT as relevance
  FROM skills
  GROUP BY skill
  ORDER BY frequency DESC
  LIMIT 20;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function for vector-based skill matching
CREATE OR REPLACE FUNCTION find_requirements_with_skills(
  p_user_id UUID,
  p_skills TEXT[],
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  company TEXT,
  matched_skills TEXT[],
  match_score FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id,
    r.title,
    r.company,
    ARRAY_AGG(DISTINCT skill) FILTER (WHERE skill IS NOT NULL) as matched_skills,
    (ARRAY_LENGTH(ARRAY_AGG(DISTINCT skill) FILTER (WHERE skill IS NOT NULL), 1)::FLOAT / ARRAY_LENGTH(p_skills, 1))::FLOAT as match_score
  FROM requirements r,
  LATERAL unnest(string_to_array(COALESCE(r.primary_tech_stack, ''), ',')) as skill
  WHERE r.user_id = p_user_id
    AND LOWER(TRIM(skill)) = ANY(ARRAY_AGG(LOWER(TRIM(s))) OVER() FROM UNNEST(p_skills) s)
  GROUP BY r.id, r.title, r.company
  ORDER BY match_score DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- Analyze requirements for quality metrics
CREATE OR REPLACE FUNCTION get_requirement_quality_metrics(
  p_user_id UUID
)
RETURNS TABLE (
  total_requirements INT,
  remote_100_count INT,
  avg_confidence NUMERIC,
  duplicates_prevented INT,
  auto_created_count INT,
  requirements_with_embeddings INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::INT,
    COUNT(*) FILTER (WHERE is_remote_100 = TRUE)::INT,
    AVG(extracted_confidence)::NUMERIC,
    COUNT(DISTINCT(SELECT duplicate_requirement_id FROM job_extraction_logs WHERE duplicate_detected = TRUE))::INT,
    COUNT(*) FILTER (WHERE extraction_source = 'gmail')::INT,
    COUNT(*) FILTER (WHERE description_embedding IS NOT NULL)::INT
  FROM requirements
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- Analysis table for job market insights
CREATE TABLE IF NOT EXISTS job_market_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  analysis_date DATE DEFAULT CURRENT_DATE,
  top_skills TEXT[],
  avg_rate NUMERIC,
  remote_job_percentage NUMERIC,
  most_active_vendors TEXT[],
  trending_companies TEXT[],
  data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, analysis_date)
);

CREATE INDEX IF NOT EXISTS idx_job_market_analytics_user_date ON job_market_analytics(user_id, analysis_date DESC);

ALTER TABLE job_market_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own analytics"
  ON job_market_analytics FOR SELECT
  USING (auth.uid() = user_id);

-- Updated updated_at trigger for embeddings
CREATE OR REPLACE FUNCTION update_requirement_embeddings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_requirement_embeddings_updated_at
  BEFORE UPDATE ON requirement_embeddings
  FOR EACH ROW
  EXECUTE FUNCTION update_requirement_embeddings_updated_at();

-- Function to batch update analytics
CREATE OR REPLACE FUNCTION update_job_market_analytics(p_user_id UUID)
RETURNS void AS $$
BEGIN
  INSERT INTO job_market_analytics (user_id, top_skills, avg_rate, remote_job_percentage, most_active_vendors, trending_companies, data)
  SELECT
    p_user_id,
    ARRAY(
      SELECT TRIM(skill) FROM (
        SELECT TRIM(UNNEST(string_to_array(COALESCE(primary_tech_stack, ''), ','))) as skill
        FROM requirements WHERE user_id = p_user_id AND primary_tech_stack IS NOT NULL
      ) t
      WHERE skill != ''
      GROUP BY skill
      ORDER BY COUNT(*) DESC
      LIMIT 10
    ),
    AVG((rate::NUMERIC)) FILTER (WHERE rate IS NOT NULL),
    (COUNT(*) FILTER (WHERE is_remote_100 = TRUE)::FLOAT / NULLIF(COUNT(*), 0) * 100)::NUMERIC,
    ARRAY(
      SELECT vendor_company FROM requirements WHERE user_id = p_user_id AND vendor_company IS NOT NULL
      GROUP BY vendor_company ORDER BY COUNT(*) DESC LIMIT 5
    ),
    ARRAY(
      SELECT company FROM requirements WHERE user_id = p_user_id AND company IS NOT NULL
      GROUP BY company ORDER BY COUNT(*) DESC LIMIT 5
    ),
    jsonb_build_object(
      'total_requirements', COUNT(*),
      'remote_count', COUNT(*) FILTER (WHERE is_remote_100 = TRUE),
      'avg_confidence', AVG(extracted_confidence),
      'by_status', (SELECT jsonb_object_agg(status, count) FROM (
        SELECT status, COUNT(*) as count FROM requirements WHERE user_id = p_user_id GROUP BY status
      ) t)
    )
  FROM requirements
  WHERE user_id = p_user_id
  ON CONFLICT (user_id, analysis_date) DO UPDATE
  SET data = EXCLUDED.data, top_skills = EXCLUDED.top_skills, avg_rate = EXCLUDED.avg_rate;
END;
$$ LANGUAGE plpgsql;

ANALYZE requirements;
ANALYZE requirement_embeddings;

COMMIT;
