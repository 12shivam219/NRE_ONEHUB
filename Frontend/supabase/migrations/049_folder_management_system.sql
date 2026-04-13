-- Create folders table for hierarchical document organization
CREATE TABLE IF NOT EXISTS public.folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  parent_folder_id UUID REFERENCES public.folders (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  CONSTRAINT folder_name_unique_per_parent UNIQUE (user_id, parent_folder_id, name),
  CONSTRAINT folder_name_not_empty CHECK (name != ''),
  CONSTRAINT no_circular_reference CHECK (parent_folder_id IS NULL OR parent_folder_id != id)
);

-- Add folder_id to documents table
ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES public.folders (id) ON DELETE SET NULL;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_folders_user_id ON public.folders (user_id);
CREATE INDEX IF NOT EXISTS idx_folders_parent_folder_id ON public.folders (parent_folder_id);
CREATE INDEX IF NOT EXISTS idx_folders_user_parent ON public.folders (user_id, parent_folder_id);
CREATE INDEX IF NOT EXISTS idx_documents_folder_id ON public.documents (folder_id);
CREATE INDEX IF NOT EXISTS idx_documents_user_folder ON public.documents (user_id, folder_id);

-- Enable RLS on folders table
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;

-- RLS Policies for folders table
-- Users can only see their own folders
CREATE POLICY "Users can view their own folders"
  ON public.folders
  FOR SELECT
  USING (user_id = auth.uid());

-- Users can create folders
CREATE POLICY "Users can create folders"
  ON public.folders
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Users can update their own folders
CREATE POLICY "Users can update their own folders"
  ON public.folders
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Users can delete their own folders
CREATE POLICY "Users can delete their own folders"
  ON public.folders
  FOR DELETE
  USING (user_id = auth.uid());

-- Add RLS policy for documents.folder_id to ensure consistency
CREATE POLICY "Users can only reference their own folders"
  ON public.documents
  FOR ALL
  USING (
    folder_id IS NULL 
    OR folder_id IN (SELECT id FROM public.folders WHERE user_id = auth.uid())
  );

-- Create function to get folder contents (files and subfolders)
CREATE OR REPLACE FUNCTION get_folder_contents(folder_id_param UUID, user_id_param UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  type TEXT,
  file_size BIGINT,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  -- Verify folder belongs to user
  IF folder_id_param IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.folders WHERE id = folder_id_param AND user_id = user_id_param) THEN
      RAISE EXCEPTION 'Folder not found or access denied';
    END IF;
  END IF;

  RETURN QUERY
  -- Get subfolders
  SELECT f.id, f.name, 'folder'::TEXT, NULL::BIGINT, f.created_at, f.updated_at
  FROM public.folders f
  WHERE f.user_id = user_id_param
    AND f.parent_folder_id IS NOT DISTINCT FROM folder_id_param
  UNION ALL
  -- Get files
  SELECT d.id, d.original_filename, 'file'::TEXT, d.file_size, d.created_at, d.updated_at
  FROM public.documents d
  WHERE d.user_id = user_id_param
    AND d.folder_id IS NOT DISTINCT FROM folder_id_param;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create table for folder sharing (future feature)
CREATE TABLE IF NOT EXISTS public.folder_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id UUID NOT NULL REFERENCES public.folders (id) ON DELETE CASCADE,
  shared_with_user_id UUID REFERENCES auth.users (id) ON DELETE CASCADE,
  permission TEXT DEFAULT 'view' CHECK (permission IN ('view', 'edit')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  CONSTRAINT unique_folder_share UNIQUE (folder_id, shared_with_user_id)
);

-- Create indexes for folder_shares
CREATE INDEX IF NOT EXISTS idx_folder_shares_folder_id ON public.folder_shares (folder_id);
CREATE INDEX IF NOT EXISTS idx_folder_shares_shared_with ON public.folder_shares (shared_with_user_id);

-- Enable RLS on folder_shares
ALTER TABLE public.folder_shares ENABLE ROW LEVEL SECURITY;

-- RLS Policies for folder_shares
CREATE POLICY "Folder owner can manage shares"
  ON public.folder_shares
  FOR ALL
  USING (
    folder_id IN (SELECT id FROM public.folders WHERE user_id = auth.uid())
  );

CREATE POLICY "Shared users can view shared folders"
  ON public.folder_shares
  FOR SELECT
  USING (shared_with_user_id = auth.uid());
