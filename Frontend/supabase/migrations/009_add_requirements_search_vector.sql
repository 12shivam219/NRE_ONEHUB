-- Migration: 009_add_requirements_search_vector.sql
-- Purpose: Add a generated tsvector `search_vector` column and GIN index
-- This enables ranked full-text search across title, company, and primary_tech_stack.

BEGIN;

-- Add tsvector column (stored generated column)
ALTER TABLE IF EXISTS requirements
  ADD COLUMN IF NOT EXISTS search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(company, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(primary_tech_stack, '')), 'C')
  ) STORED;

-- Create GIN index on the generated column
CREATE INDEX IF NOT EXISTS idx_requirements_search_vector ON requirements USING GIN(search_vector);

-- Optionally analyze table to update planner statistics
ANALYZE requirements;

COMMIT;
