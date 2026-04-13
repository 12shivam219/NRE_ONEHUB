-- Add interview_number column to interviews table
-- This tracks per-requirement interview numbering: INT-01, INT-02, etc.

ALTER TABLE interviews 
ADD COLUMN IF NOT EXISTS interview_number INTEGER;

-- First, clear any existing interview_number values to start fresh
UPDATE interviews
SET interview_number = NULL
WHERE interview_number IS NOT NULL;

-- Backfill existing interviews with interview_number based on creation order per requirement
-- Group by requirement_id and assign incremental numbers based on created_at order
WITH ranked_interviews AS (
  SELECT 
    id,
    requirement_id,
    ROW_NUMBER() OVER (
      PARTITION BY requirement_id 
      ORDER BY created_at ASC, id ASC
    ) as new_number
  FROM interviews
)
UPDATE interviews
SET interview_number = ranked_interviews.new_number
FROM ranked_interviews
WHERE interviews.id = ranked_interviews.id;

-- Create a function to get the next interview number for a requirement
CREATE OR REPLACE FUNCTION get_next_interview_number(p_requirement_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_max_number INTEGER;
BEGIN
  SELECT COALESCE(MAX(interview_number), 0) INTO v_max_number
  FROM interviews
  WHERE requirement_id = p_requirement_id;
  
  RETURN v_max_number + 1;
END;
$$;

-- Create a unique constraint on (requirement_id, interview_number) to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_interviews_requirement_interview_number 
ON interviews(requirement_id, interview_number) 
WHERE interview_number IS NOT NULL;

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_interviews_requirement_number 
ON interviews(requirement_id, interview_number);
