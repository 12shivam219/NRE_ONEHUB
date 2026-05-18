-- Add soft delete support for documents and folders
-- Support recovery via trash system

BEGIN;

-- Add soft delete columns to documents table
ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;

-- Add soft delete columns to folders table
ALTER TABLE public.folders
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;

-- Create trash table to track soft deletes
CREATE TABLE IF NOT EXISTS public.trash (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('document', 'folder')),
  resource_id UUID NOT NULL,
  resource_name TEXT NOT NULL,
  original_path_json JSONB DEFAULT '{}',
  deleted_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW() + INTERVAL '30 days') NOT NULL,
  size_bytes BIGINT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create indexes for trash
CREATE INDEX IF NOT EXISTS idx_trash_user_id ON public.trash (user_id);
CREATE INDEX IF NOT EXISTS idx_trash_expires_at ON public.trash (expires_at);
CREATE INDEX IF NOT EXISTS idx_trash_user_expires ON public.trash (user_id, expires_at);

-- Enable RLS on trash table
ALTER TABLE public.trash ENABLE ROW LEVEL SECURITY;

-- RLS Policies for trash table
CREATE POLICY "Users can view their own trash"
  ON public.trash
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert to their own trash"
  ON public.trash
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own trash"
  ON public.trash
  FOR DELETE
  USING (user_id = auth.uid());

-- Update documents RLS to exclude soft-deleted items
DROP POLICY IF EXISTS "Users can view documents" ON public.documents;
CREATE POLICY "Users can view documents"
  ON public.documents
  FOR SELECT
  USING (user_id = auth.uid() AND is_deleted = FALSE);

DROP POLICY IF EXISTS "Users can insert documents" ON public.documents;
CREATE POLICY "Users can insert documents"
  ON public.documents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid()::uuid)
    AND is_deleted = FALSE
    AND (
      folder_id IS NULL
      OR folder_id IN (SELECT id FROM public.folders WHERE user_id = (SELECT auth.uid()::uuid) AND is_deleted = FALSE)
    )
  );

DROP POLICY IF EXISTS "Users can update own documents" ON public.documents;
CREATE POLICY "Users can update own documents"
  ON public.documents
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()::uuid) AND is_deleted = FALSE)
  WITH CHECK (
    user_id = (SELECT auth.uid()::uuid)
    AND is_deleted = FALSE
    AND (
      folder_id IS NULL
      OR folder_id IN (SELECT id FROM public.folders WHERE user_id = (SELECT auth.uid()::uuid) AND is_deleted = FALSE)
    )
  );

DROP POLICY IF EXISTS "Users can delete their own documents" ON public.documents;
CREATE POLICY "Users can delete their own documents"
  ON public.documents
  FOR DELETE
  USING (user_id = (SELECT auth.uid()::uuid));

-- Update folders RLS to exclude soft-deleted items
DROP POLICY IF EXISTS "Users can view their own folders" ON public.folders;
CREATE POLICY "Users can view their own folders"
  ON public.folders
  FOR SELECT
  USING (user_id = auth.uid() AND is_deleted = FALSE);

DROP POLICY IF EXISTS "Users can create folders" ON public.folders;
CREATE POLICY "Users can create folders"
  ON public.folders
  FOR INSERT
  WITH CHECK (user_id = auth.uid() AND is_deleted = FALSE);

DROP POLICY IF EXISTS "Users can update their own folders" ON public.folders;
CREATE POLICY "Users can update their own folders"
  ON public.folders
  FOR UPDATE
  USING (user_id = auth.uid() AND is_deleted = FALSE)
  WITH CHECK (user_id = auth.uid() AND is_deleted = FALSE);

DROP POLICY IF EXISTS "Users can delete their own folders" ON public.folders;
CREATE POLICY "Users can delete their own folders"
  ON public.folders
  FOR DELETE
  USING (user_id = auth.uid());

COMMIT;
