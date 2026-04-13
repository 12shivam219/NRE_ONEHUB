-- Migration: 012_fix_requirement_number_unique_constraint.sql
-- Purpose: Fix requirement_number constraint to be per-user instead of global
-- This resolves the "Duplicate key value violates requirements_requirement_number_key" error

BEGIN;

-- First, populate any NULL requirement_number values with sequential numbers per user
WITH numbered_reqs AS (
  SELECT 
    id,
    user_id,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at ASC) as seq_num
  FROM requirements
  WHERE requirement_number IS NULL
)
UPDATE requirements r
SET requirement_number = (
  SELECT COALESCE(MAX(requirement_number), 0) + nr.seq_num
  FROM requirements r2
  WHERE r2.user_id = r.user_id AND r2.requirement_number IS NOT NULL
)
FROM numbered_reqs nr
WHERE r.id = nr.id;

-- For any remaining NULLs (if user has no non-null requirements), set to 1
UPDATE requirements
SET requirement_number = 1
WHERE requirement_number IS NULL;

-- Now drop the existing global unique constraint on requirement_number
ALTER TABLE IF EXISTS requirements DROP CONSTRAINT IF EXISTS requirements_requirement_number_key;

-- Add a new unique constraint that is scoped to user_id
ALTER TABLE IF EXISTS requirements 
ADD CONSTRAINT requirements_user_id_requirement_number_unique UNIQUE (user_id, requirement_number);

-- Create index for efficient querying by user_id and requirement_number
CREATE INDEX IF NOT EXISTS idx_requirements_user_requirement_number 
ON requirements (user_id, requirement_number DESC);

-- Create a function to generate the next requirement number for a user
CREATE OR REPLACE FUNCTION get_next_requirement_number(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(requirement_number), 0) + 1
  INTO next_num
  FROM requirements
  WHERE user_id = p_user_id;
  
  RETURN next_num;
END;
$$ LANGUAGE plpgsql STABLE;

-- Create trigger to auto-populate requirement_number for new inserts
CREATE OR REPLACE FUNCTION trigger_set_requirement_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.requirement_number IS NULL THEN
    NEW.requirement_number := get_next_requirement_number(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_requirement_number_trigger ON requirements;
CREATE TRIGGER set_requirement_number_trigger
BEFORE INSERT ON requirements
FOR EACH ROW
EXECUTE FUNCTION trigger_set_requirement_number();

COMMIT;

