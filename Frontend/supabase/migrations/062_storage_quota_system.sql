-- Add storage quota management system

BEGIN;

-- Add storage columns to profiles/users
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS storage_plan TEXT DEFAULT 'starter' CHECK (storage_plan IN ('starter', 'pro', 'enterprise')),
ADD COLUMN IF NOT EXISTS storage_quota_bytes BIGINT DEFAULT 5368709120; -- 5GB default

-- Create storage usage tracking table
CREATE TABLE IF NOT EXISTS public.user_storage_usage (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  total_bytes BIGINT DEFAULT 0,
  document_count INT DEFAULT 0,
  folder_count INT DEFAULT 0,
  last_calculated TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_storage_usage_user_id ON public.user_storage_usage (user_id);

-- Enable RLS on storage usage table
ALTER TABLE public.user_storage_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own storage usage"
  ON public.user_storage_usage
  FOR SELECT
  USING (user_id = auth.uid());

-- Function to calculate user storage usage
CREATE OR REPLACE FUNCTION public.calculate_user_storage_usage(user_id_param UUID)
RETURNS TABLE (
  total_bytes BIGINT,
  document_count INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(d.file_size), 0)::BIGINT as total_bytes,
    COUNT(d.id)::INT as document_count
  FROM public.documents d
  WHERE d.user_id = user_id_param AND d.is_deleted = FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update storage usage triggers
CREATE OR REPLACE FUNCTION public.update_user_storage_usage()
RETURNS TRIGGER AS $$
DECLARE
  v_storage_row RECORD;
BEGIN
  -- For INSERT
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.user_storage_usage (user_id, total_bytes, document_count, last_calculated)
    VALUES (NEW.user_id, NEW.file_size, 1, NOW())
    ON CONFLICT (user_id) DO UPDATE
    SET total_bytes = user_storage_usage.total_bytes + NEW.file_size,
        document_count = user_storage_usage.document_count + 1,
        last_calculated = NOW();
    RETURN NEW;
  
  -- For DELETE of soft-deleted documents
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.user_storage_usage
    SET total_bytes = GREATEST(0, total_bytes - OLD.file_size),
        document_count = GREATEST(0, document_count - 1),
        last_calculated = NOW()
    WHERE user_id = OLD.user_id;
    RETURN OLD;
  
  -- For UPDATE (if file_size changes)
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.file_size != NEW.file_size THEN
      UPDATE public.user_storage_usage
      SET total_bytes = GREATEST(0, total_bytes - OLD.file_size + NEW.file_size),
          last_calculated = NOW()
      WHERE user_id = NEW.user_id;
    END IF;
    RETURN NEW;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for storage usage updates (only for non-deleted documents)
DROP TRIGGER IF EXISTS trigger_update_storage_on_document_insert ON public.documents;
CREATE TRIGGER trigger_update_storage_on_document_insert
AFTER INSERT ON public.documents
FOR EACH ROW
WHEN (NEW.is_deleted = FALSE)
EXECUTE FUNCTION public.update_user_storage_usage();

DROP TRIGGER IF EXISTS trigger_update_storage_on_document_delete ON public.documents;
CREATE TRIGGER trigger_update_storage_on_document_delete
AFTER DELETE ON public.documents
FOR EACH ROW
WHEN (OLD.is_deleted = FALSE)
EXECUTE FUNCTION public.update_user_storage_usage();

DROP TRIGGER IF EXISTS trigger_update_storage_on_document_update ON public.documents;
CREATE TRIGGER trigger_update_storage_on_document_update
AFTER UPDATE ON public.documents
FOR EACH ROW
WHEN (OLD.is_deleted = FALSE AND NEW.is_deleted = FALSE)
EXECUTE FUNCTION public.update_user_storage_usage();

-- Storage plan tier configuration
CREATE TABLE IF NOT EXISTS public.storage_plans (
  plan_name TEXT PRIMARY KEY,
  quota_bytes BIGINT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

INSERT INTO public.storage_plans (plan_name, quota_bytes, description) VALUES
  ('starter', 5368709120, '5 GB - Free plan'),
  ('pro', 53687091200, '50 GB - Professional'),
  ('enterprise', 536870912000, '500 GB - Enterprise')
ON CONFLICT (plan_name) DO NOTHING;

COMMIT;
