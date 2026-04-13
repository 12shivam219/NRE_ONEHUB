-- Full-Text Search and Performance Indexes for 10K+ Records Support
-- Run this migration in Supabase SQL editor to enable trigram and full-text search

-- =========================================================================
-- 1. ENABLE EXTENSIONS (run once per database)
-- =========================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- =========================================================================
-- 2. TRIGRAM INDEXES FOR ILIKE SEARCHES (fast substring matching)
-- =========================================================================

-- Requirements table - search-optimized columns
CREATE INDEX IF NOT EXISTS idx_requirements_title_trgm 
  ON requirements USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_requirements_company_trgm 
  ON requirements USING gin (company gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_requirements_tech_trgm 
  ON requirements USING gin (primary_tech_stack gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_requirements_vendor_company_trgm 
  ON requirements USING gin (vendor_company gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_requirements_vendor_email_trgm 
  ON requirements USING gin (vendor_email gin_trgm_ops);

-- Consultants table - search-optimized columns
CREATE INDEX IF NOT EXISTS idx_consultants_name_trgm 
  ON consultants USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_consultants_email_trgm 
  ON consultants USING gin (email gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_consultants_primary_skills_trgm 
  ON consultants USING gin (primary_skills gin_trgm_ops);

-- Users table - for admin search
CREATE INDEX IF NOT EXISTS idx_users_email_trgm 
  ON users USING gin (email gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_users_full_name_trgm 
  ON users USING gin (full_name gin_trgm_ops);

-- =========================================================================
-- 3. COMPOSITE INDEXES FOR PAGINATION & FILTERING
-- =========================================================================

-- Requirements: user_id + status for filtered pagination
CREATE INDEX IF NOT EXISTS idx_requirements_user_status 
  ON requirements (user_id, status, created_at DESC);

-- Requirements: user_id + created_at for sorting
CREATE INDEX IF NOT EXISTS idx_requirements_user_created 
  ON requirements (user_id, created_at DESC);

-- Consultants: user_id + status
CREATE INDEX IF NOT EXISTS idx_consultants_user_status 
  ON consultants (user_id, status, updated_at DESC);

-- =========================================================================
-- 4. FULL-TEXT SEARCH SUPPORT (Advanced - optional)
-- =========================================================================

-- Add tsvector column to requirements for full-text search
ALTER TABLE requirements 
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Create GIN index on search_vector for fast full-text search
CREATE INDEX IF NOT EXISTS idx_requirements_search 
  ON requirements USING GIN (search_vector);

-- Create trigger function to update search vector automatically
CREATE OR REPLACE FUNCTION requirements_search_update()
RETURNS TRIGGER AS $$
BEGIN
  new.search_vector := 
    setweight(to_tsvector('english', coalesce(new.title,'')), 'A') ||
    setweight(to_tsvector('english', coalesce(new.company,'')), 'B') ||
    setweight(to_tsvector('english', coalesce(new.description,'')), 'C') ||
    setweight(to_tsvector('english', coalesce(new.primary_tech_stack,'')), 'B');
  RETURN new;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on requirements insert/update
DROP TRIGGER IF EXISTS requirements_search_update_trigger ON requirements;
CREATE TRIGGER requirements_search_update_trigger
  BEFORE INSERT OR UPDATE ON requirements
  FOR EACH ROW
  EXECUTE FUNCTION requirements_search_update();

-- Initialize search_vector for existing records
UPDATE requirements 
SET search_vector = 
  setweight(to_tsvector('english', coalesce(title,'')), 'A') ||
  setweight(to_tsvector('english', coalesce(company,'')), 'B') ||
  setweight(to_tsvector('english', coalesce(description,'')), 'C') ||
  setweight(to_tsvector('english', coalesce(primary_tech_stack,'')), 'B')
WHERE search_vector IS NULL;

-- =========================================================================
-- 5. PERFORMANCE MONITORING INDEXES (only if tables exist)
-- =========================================================================

-- Login history for security monitoring (only if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'login_history') THEN
    CREATE INDEX IF NOT EXISTS idx_login_history_user_date 
      ON login_history (user_id, created_at DESC);
    
    CREATE INDEX IF NOT EXISTS idx_login_history_suspicious 
      ON login_history (suspicious, created_at DESC) 
      WHERE suspicious = true;
  END IF;
END$$;

-- Error logs for debugging (only if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'error_logs') THEN
    CREATE INDEX IF NOT EXISTS idx_error_logs_user_date 
      ON error_logs (user_id, created_at DESC);
    
    CREATE INDEX IF NOT EXISTS idx_error_logs_status 
      ON error_logs (status, created_at DESC);
  END IF;
END$$;

-- Activity logs (only if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'activity_logs') THEN
    CREATE INDEX IF NOT EXISTS idx_activity_logs_user_date 
      ON activity_logs (user_id, created_at DESC);
    
    CREATE INDEX IF NOT EXISTS idx_activity_logs_resource 
      ON activity_logs (resource_type, resource_id);
  END IF;
END$$;

-- =========================================================================
-- 6. OPTIONAL: STATISTICS FOR QUERY PLANNING
-- =========================================================================

-- Analyze tables to improve query planning (run periodically)
-- ANALYZE requirements;
-- ANALYZE consultants;
-- ANALYZE users;

-- =========================================================================
-- NOTES FOR IMPLEMENTATION:
-- =========================================================================
-- 1. Trigram indexes (gin_trgm_ops) enable fast ILIKE '%term%' searches
-- 2. Full-text search provides better relevance ranking for complex queries
-- 3. Composite indexes improve pagination performance on large datasets
-- 4. All indexes include DESC on date columns for chronological queries
-- 5. Monitor index size with: SELECT * FROM pg_indexes WHERE tablename = 'requirements';
-- 6. For 10K+ records, expect 2-3x query performance improvement
-- 7. Consider running VACUUM ANALYZE monthly for optimal performance
