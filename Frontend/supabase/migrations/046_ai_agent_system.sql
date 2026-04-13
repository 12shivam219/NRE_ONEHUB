-- Migration: 046_ai_agent_system.sql
-- Purpose: Add AI Agent system fields, vector support, and duplicate detection
-- Features: Remote filtering, deduplication, RAG-ready embeddings

BEGIN;

-- 1. Enable pgvector extension for vector embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Add new fields to requirements table for AI Agent system
ALTER TABLE IF EXISTS public.requirements
  ADD COLUMN IF NOT EXISTS job_link TEXT,
  ADD COLUMN IF NOT EXISTS job_link_hash TEXT,
  ADD COLUMN IF NOT EXISTS email_hash TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS is_remote_100 BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS extracted_confidence INTEGER DEFAULT 0 CHECK (extracted_confidence >= 0 AND extracted_confidence <= 100),
  ADD COLUMN IF NOT EXISTS extraction_source TEXT DEFAULT 'gmail',
  ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'completed' CHECK (sync_status IN ('pending', 'processing', 'completed', 'failed')),
  ADD COLUMN IF NOT EXISTS sync_error TEXT;

-- 3. Add vector column for RAG embeddings (1536 dimensions for modern embeddings models)
ALTER TABLE IF EXISTS public.requirements
  ADD COLUMN IF NOT EXISTS description_embedding vector(1536);

-- 4. Create indexes for new fields
CREATE INDEX IF NOT EXISTS idx_requirements_job_link_hash ON requirements(job_link_hash) 
  WHERE job_link_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_requirements_email_hash ON requirements(email_hash) 
  WHERE email_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_requirements_is_remote_100 ON requirements(is_remote_100) 
  WHERE is_remote_100 = TRUE;

CREATE INDEX IF NOT EXISTS idx_requirements_extracted_confidence ON requirements(extracted_confidence DESC) 
  WHERE extracted_confidence >= 75;

CREATE INDEX IF NOT EXISTS idx_requirements_extraction_source ON requirements(extraction_source);

CREATE INDEX IF NOT EXISTS idx_requirements_sync_status ON requirements(sync_status);

-- 5. Add IVFFLAT index for vector similarity search (for RAG)
-- Using IVFFLAT for better performance on large datasets
-- Rebuild this index after bulk inserts for optimal performance
CREATE INDEX IF NOT EXISTS idx_requirements_description_embedding ON requirements 
  USING ivfflat(description_embedding vector_cosine_ops)
  WITH (lists = 100) 
  WHERE description_embedding IS NOT NULL;

-- 6. Create job_extraction_logs table for audit trail
CREATE TABLE IF NOT EXISTS job_extraction_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requirement_id UUID REFERENCES requirements(id) ON DELETE SET NULL,
  email_id TEXT,
  email_subject TEXT,
  email_from TEXT,
  extraction_status TEXT NOT NULL CHECK (extraction_status IN ('attempted', 'success', 'failed', 'skipped')),
  failure_reason TEXT,
  raw_extraction_response TEXT,
  extracted_confidence INTEGER CHECK (extracted_confidence >= 0 AND extracted_confidence <= 100),
  is_remote_detected BOOLEAN,
  duplicate_detected BOOLEAN DEFAULT FALSE,
  duplicate_requirement_id UUID REFERENCES requirements(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_job_extraction_logs_user_id ON job_extraction_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_job_extraction_logs_requirement_id ON job_extraction_logs(requirement_id);
CREATE INDEX IF NOT EXISTS idx_job_extraction_logs_created_at ON job_extraction_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_extraction_logs_status ON job_extraction_logs(extraction_status);

-- 7. Create embeddings metadata table (for tracking embedding versions)
CREATE TABLE IF NOT EXISTS requirement_embeddings_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_id UUID NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
  embedding_model TEXT NOT NULL,
  embedding_dimension INT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(requirement_id, embedding_model)
);

CREATE INDEX IF NOT EXISTS idx_embeddings_metadata_requirement_id ON requirement_embeddings_metadata(requirement_id);
CREATE INDEX IF NOT EXISTS idx_embeddings_metadata_model ON requirement_embeddings_metadata(embedding_model);

-- 8. Enable RLS for job_extraction_logs
ALTER TABLE job_extraction_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own extraction logs"
  ON job_extraction_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own extraction logs"
  ON job_extraction_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 9. Enable RLS for embeddings_metadata
ALTER TABLE requirement_embeddings_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view embeddings metadata for their requirements"
  ON requirement_embeddings_metadata FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM requirements
      WHERE requirements.id = requirement_embeddings_metadata.requirement_id
      AND requirements.user_id = auth.uid()
    )
  );

-- 10. Create function to check for duplicate requirements
CREATE OR REPLACE FUNCTION check_requirement_duplicate(
  p_user_id UUID,
  p_job_link_hash TEXT DEFAULT NULL,
  p_email_hash TEXT DEFAULT NULL
)
RETURNS TABLE (
  duplicate_id UUID,
  title TEXT,
  company TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  duplicate_type TEXT
) AS $$
BEGIN
  -- Check by job_link_hash first (most reliable)
  IF p_job_link_hash IS NOT NULL THEN
    RETURN QUERY
    SELECT 
      r.id, r.title, r.company, r.created_at,
      'job_link'::TEXT
    FROM requirements r
    WHERE r.user_id = p_user_id
      AND r.job_link_hash = p_job_link_hash
      AND r.status != 'CLOSED'
    LIMIT 1;
    
    IF FOUND THEN RETURN; END IF;
  END IF;

  -- Check by email_hash if no job_link match
  IF p_email_hash IS NOT NULL THEN
    RETURN QUERY
    SELECT 
      r.id, r.title, r.company, r.created_at,
      'email_hash'::TEXT
    FROM requirements r
    WHERE r.user_id = p_user_id
      AND r.email_hash = p_email_hash
      AND r.status != 'CLOSED'
    LIMIT 1;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- 11. Create function for vector similarity search (RAG)
CREATE OR REPLACE FUNCTION search_requirements_by_vector(
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
  similarity_score FLOAT
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
    (1 - (r.description_embedding <=> p_embedding))::FLOAT as similarity_score
  FROM requirements r
  WHERE r.user_id = p_user_id
    AND r.description_embedding IS NOT NULL
    AND (1 - (r.description_embedding <=> p_embedding)) > p_similarity_threshold
  ORDER BY r.description_embedding <=> p_embedding
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- 12. Create updated_at trigger for job_extraction_logs
CREATE OR REPLACE FUNCTION update_job_extraction_logs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_job_extraction_logs_updated_at
  BEFORE UPDATE ON job_extraction_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_job_extraction_logs_updated_at();

-- 13. Add comment for documentation
COMMENT ON COLUMN requirements.is_remote_100 IS 'Flag indicating 100% remote job (not hybrid, not on-site)';
COMMENT ON COLUMN requirements.extracted_confidence IS 'AI confidence score 0-100 for this being a valid job posting';
COMMENT ON COLUMN requirements.description_embedding IS '1536-dim vector embedding for RAG and semantic search';
COMMENT ON COLUMN requirements.job_link_hash IS 'MD5 hash of job URL for duplicate detection';
COMMENT ON COLUMN requirements.email_hash IS 'SHA256 hash of source email for duplicate detection';

-- 14. Analyze table to update query planner
ANALYZE requirements;

COMMIT;
