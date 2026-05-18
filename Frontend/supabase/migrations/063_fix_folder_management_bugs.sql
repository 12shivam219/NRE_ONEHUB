-- Fix folder management bugs #1 and #5
-- BUG #1: RLS policies must verify parent folder is not soft-deleted
-- BUG #5: Allow folder name reuse after soft delete via partial unique index

BEGIN;

-- BUG #5: Replace UNIQUE constraint with partial unique index
-- This allows name reuse after soft delete
-- First, drop the old constraint
ALTER TABLE public.folders DROP CONSTRAINT IF EXISTS folder_name_unique_per_parent;

-- Create partial unique index that only applies to active folders
CREATE UNIQUE INDEX IF NOT EXISTS idx_folders_unique_active_per_parent 
ON public.folders (user_id, parent_folder_id, name) 
WHERE is_deleted = FALSE;

-- BUG #1: Fix RLS policies to check parent folder is not soft-deleted
-- Update the INSERT policy to verify parent folder is not deleted
DROP POLICY IF EXISTS "Users can create folders" ON public.folders;
CREATE POLICY "Users can create folders"
  ON public.folders
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid() 
    AND (
      parent_folder_id IS NULL 
      OR parent_folder_id IN (
        SELECT id FROM public.folders 
        WHERE user_id = auth.uid() AND is_deleted = FALSE
      )
    )
  );

-- Update the UPDATE policy to verify parent folder is not deleted
DROP POLICY IF EXISTS "Users can update their own folders" ON public.folders;
CREATE POLICY "Users can update their own folders"
  ON public.folders
  FOR UPDATE
  USING (user_id = auth.uid() AND is_deleted = FALSE)
  WITH CHECK (
    user_id = auth.uid() 
    AND is_deleted = FALSE
    AND (
      parent_folder_id IS NULL 
      OR parent_folder_id IN (
        SELECT id FROM public.folders 
        WHERE user_id = auth.uid() AND is_deleted = FALSE
      )
    )
  );

-- Fix the documents policy to verify referenced folder is not soft-deleted
DROP POLICY IF EXISTS "Users can only reference their own folders" ON public.documents;
CREATE POLICY "Users can only reference their own folders"
  ON public.documents
  FOR ALL
  USING (
    folder_id IS NULL 
    OR folder_id IN (
      SELECT id FROM public.folders 
      WHERE user_id = auth.uid() AND is_deleted = FALSE
    )
  )
  WITH CHECK (
    folder_id IS NULL 
    OR folder_id IN (
      SELECT id FROM public.folders 
      WHERE user_id = auth.uid() AND is_deleted = FALSE
    )
  );

COMMIT;
