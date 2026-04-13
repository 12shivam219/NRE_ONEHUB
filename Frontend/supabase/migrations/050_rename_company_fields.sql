-- Migration: 050_rename_company_fields.sql
-- Purpose: Rename company fields to implementation_partner and end_client to client for clarity

BEGIN;

-- Rename company column to implementation_partner
ALTER TABLE IF EXISTS public.requirements
  RENAME COLUMN company TO implementation_partner;

-- Rename end_client column to client
ALTER TABLE IF EXISTS public.requirements
  RENAME COLUMN end_client TO client;

-- Update search vector to use new column names
ALTER TABLE IF EXISTS public.requirements
  DROP COLUMN IF EXISTS search_vector;

ALTER TABLE IF EXISTS public.requirements
  ADD COLUMN IF NOT EXISTS search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(implementation_partner, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(primary_tech_stack, '')), 'C')
  ) STORED;

-- Recreate GIN index on the updated search_vector
DROP INDEX IF EXISTS idx_requirements_search_vector;
CREATE INDEX IF NOT EXISTS idx_requirements_search_vector ON requirements USING GIN(search_vector);

-- Update comments for documentation
COMMENT ON COLUMN public.requirements.implementation_partner IS 'Implementation partner or recruiting company that sourced the job';
COMMENT ON COLUMN public.requirements.client IS 'End client where the job placement will be';

-- Analyze table to update query planner
ANALYZE requirements;

COMMIT;
