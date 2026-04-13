-- Migration: 021_add_search_indexes_and_performance.sql
-- Purpose: Add comprehensive search indexes for common search columns
-- This migration optimizes queries on description, location, and other text fields
-- Status: REQUIRED for performance optimization

BEGIN;

-- ============================================
-- 1. ADD ADDITIONAL TEXT INDEXES FOR SEARCH
-- ============================================

-- Trigram index for description searches (commonly used for filtering)
CREATE INDEX IF NOT EXISTS idx_requirements_description_trgm 
ON requirements USING GIN(description gin_trgm_ops);

-- Trigram index for location searches
CREATE INDEX IF NOT EXISTS idx_requirements_location_trgm 
ON requirements USING GIN(location gin_trgm_ops);

-- Trigram index for vendor/client website searches
CREATE INDEX IF NOT EXISTS idx_requirements_client_website_trgm 
ON requirements USING GIN(client_website gin_trgm_ops);

-- Trigram index for vendor person name searches
CREATE INDEX IF NOT EXISTS idx_requirements_vendor_person_name_trgm 
ON requirements USING GIN(vendor_person_name gin_trgm_ops);

-- Trigram index for vendor email searches
CREATE INDEX IF NOT EXISTS idx_requirements_vendor_email_trgm 
ON requirements USING GIN(vendor_email gin_trgm_ops);

-- ============================================
-- 2. OPTIMIZE COMPOSITE INDEXES FOR FILTERING
-- ============================================

-- Index for rate range filtering combined with status
CREATE INDEX IF NOT EXISTS idx_requirements_rate_status 
ON requirements(rate, status) 
INCLUDE (title, company);

-- Index for remote filter combined with status
CREATE INDEX IF NOT EXISTS idx_requirements_remote_status 
ON requirements(remote, status) 
INCLUDE (title, company);

-- ============================================
-- 3. ANALYZE TABLE TO UPDATE PLANNER STATISTICS
-- ============================================

ANALYZE requirements;

COMMIT;
