-- Drop unused requirement fields
-- Removes: imp_name, applied_for, client_website, imp_website, location
-- These fields are no longer used in the application

-- Drop indexes on these columns if they exist
DROP INDEX IF EXISTS idx_requirements_client_website_trgm;

-- Drop the columns from the requirements table
ALTER TABLE requirements
DROP COLUMN IF EXISTS imp_name,
DROP COLUMN IF EXISTS applied_for,
DROP COLUMN IF EXISTS client_website,
DROP COLUMN IF EXISTS imp_website,
DROP COLUMN IF EXISTS location;
