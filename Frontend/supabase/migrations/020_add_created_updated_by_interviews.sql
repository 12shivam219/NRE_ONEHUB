-- Add created_by and updated_by columns to interviews table
-- This fixes the schema cache issue when creating/updating interviews

ALTER TABLE interviews ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_interviews_created_by ON interviews(created_by);
CREATE INDEX IF NOT EXISTS idx_interviews_updated_by ON interviews(updated_by);

-- Set created_by for existing records (use user_id since created_by was never set)
UPDATE interviews 
SET created_by = user_id 
WHERE created_by IS NULL;

-- Set updated_by for existing records
UPDATE interviews 
SET updated_by = user_id 
WHERE updated_by IS NULL;
