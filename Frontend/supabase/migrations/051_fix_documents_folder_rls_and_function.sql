-- Fix critical RLS issue: permissive policy "Users can only reference their own folders"
-- allowed any authenticated user to read rows where folder_id IS NULL (including other users' documents).
-- Replace with explicit WITH CHECK constraints merged into insert/update policies.

BEGIN;

DROP POLICY IF EXISTS "Users can only reference their own folders" ON public.documents;

DROP POLICY IF EXISTS "Users can insert documents" ON public.documents;
CREATE POLICY "Users can insert documents"
  ON public.documents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid()::uuid)
    AND (
      folder_id IS NULL
      OR folder_id IN (SELECT id FROM public.folders WHERE user_id = (SELECT auth.uid()::uuid))
    )
  );

DROP POLICY IF EXISTS "Users can update own documents" ON public.documents;
CREATE POLICY "Users can update own documents"
  ON public.documents
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()::uuid))
  WITH CHECK (
    user_id = (SELECT auth.uid()::uuid)
    AND (
      folder_id IS NULL
      OR folder_id IN (SELECT id FROM public.folders WHERE user_id = (SELECT auth.uid()::uuid))
    )
  );

-- Harden SECURITY DEFINER helper used by the app
CREATE OR REPLACE FUNCTION public.get_folder_contents(folder_id_param UUID, user_id_param UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  type TEXT,
  file_size BIGINT,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  IF folder_id_param IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.folders WHERE id = folder_id_param AND user_id = user_id_param) THEN
      RAISE EXCEPTION 'Folder not found or access denied';
    END IF;
  END IF;

  RETURN QUERY
  SELECT f.id, f.name, 'folder'::TEXT, NULL::BIGINT, f.created_at, f.updated_at
  FROM public.folders f
  WHERE f.user_id = user_id_param
    AND f.parent_folder_id IS NOT DISTINCT FROM folder_id_param
  UNION ALL
  SELECT d.id, d.original_filename, 'file'::TEXT, d.file_size, d.created_at, d.updated_at
  FROM public.documents d
  WHERE d.user_id = user_id_param
    AND d.folder_id IS NOT DISTINCT FROM folder_id_param;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public;

COMMIT;
