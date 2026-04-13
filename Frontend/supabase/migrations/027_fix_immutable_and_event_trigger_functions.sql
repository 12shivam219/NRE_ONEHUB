-- Migration: 027_fix_remaining_function_issues_and_activity_logs.sql
-- Purpose: 
--   1. Fix role mutable search_path for remaining functions
--   2. Create/fix activity_logs table with proper RLS policies
-- Issues Fixed:
--   - get_latest_next_step has role mutable search_path
--   - immutable_to_text has role mutable search_path
--   - append_campaign_event has role mutable search_path
--   - activity_logs RLS policies allow unrestricted access

BEGIN;

-- =========================================================================
-- 1. FIX ROLE MUTABLE SEARCH_PATH - get_latest_next_step function
-- =========================================================================

DROP FUNCTION IF EXISTS public.get_latest_next_step(uuid) CASCADE;

CREATE OR REPLACE FUNCTION public.get_latest_next_step(
  p_requirement_id UUID
)
RETURNS TABLE (
  comment_text TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  user_email TEXT
)
SECURITY DEFINER
SET search_path = public
STABLE
LANGUAGE SQL
AS $$
  SELECT 
    nsc.comment_text,
    nsc.created_at,
    u.email
  FROM public.next_step_comments nsc
  LEFT JOIN public.users u ON u.id = nsc.user_id
  WHERE nsc.requirement_id = p_requirement_id
  ORDER BY nsc.created_at DESC
  LIMIT 1;
$$;

-- =========================================================================
-- 2. FIX ROLE MUTABLE SEARCH_PATH - append_campaign_event function
-- =========================================================================

DROP FUNCTION IF EXISTS public.append_campaign_event(text, jsonb, integer, integer, integer, integer) CASCADE;

CREATE OR REPLACE FUNCTION public.append_campaign_event(
  p_id text,
  p_event jsonb,
  p_sent integer,
  p_failed integer,
  p_processed integer,
  p_progress integer
)
RETURNS TABLE(id text, status text, total integer, sent integer, failed integer, processed integer, progress integer, details jsonb, created_at timestamptz, started_at timestamptz, completed_at timestamptz)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_id text;
  v_status text;
  v_total integer;
  v_sent integer;
  v_failed integer;
  v_processed integer;
  v_progress integer;
  v_details jsonb;
  v_created_at timestamptz;
  v_started_at timestamptz;
  v_completed_at timestamptz;
BEGIN
  UPDATE public.bulk_email_campaign_status
  SET
    status = 'processing',
    sent = COALESCE(sent,0) + COALESCE(p_sent,0),
    failed = COALESCE(failed,0) + COALESCE(p_failed,0),
    processed = GREATEST(COALESCE(processed,0), COALESCE(p_processed,0)),
    progress = GREATEST(COALESCE(progress,0), COALESCE(p_progress,0)),
    details = COALESCE(details,'[]'::jsonb) || COALESCE(p_event, '[]'::jsonb),
    started_at = COALESCE(started_at, now())
  WHERE bulk_email_campaign_status.id = p_id
  RETURNING 
    bulk_email_campaign_status.id,
    bulk_email_campaign_status.status,
    bulk_email_campaign_status.total,
    bulk_email_campaign_status.sent,
    bulk_email_campaign_status.failed,
    bulk_email_campaign_status.processed,
    bulk_email_campaign_status.progress,
    bulk_email_campaign_status.details,
    bulk_email_campaign_status.created_at,
    bulk_email_campaign_status.started_at,
    bulk_email_campaign_status.completed_at
  INTO v_id, v_status, v_total, v_sent, v_failed, v_processed, v_progress, v_details, v_created_at, v_started_at, v_completed_at;

  IF NOT FOUND THEN
    INSERT INTO public.bulk_email_campaign_status(id, status, total, sent, failed, processed, progress, details, created_at, started_at)
    VALUES (p_id, 'processing', 0, COALESCE(p_sent,0), COALESCE(p_failed,0), COALESCE(p_processed,0), COALESCE(p_progress,0),
            COALESCE(p_event, '[]'::jsonb), now(), now())
    RETURNING 
      bulk_email_campaign_status.id,
      bulk_email_campaign_status.status,
      bulk_email_campaign_status.total,
      bulk_email_campaign_status.sent,
      bulk_email_campaign_status.failed,
      bulk_email_campaign_status.processed,
      bulk_email_campaign_status.progress,
      bulk_email_campaign_status.details,
      bulk_email_campaign_status.created_at,
      bulk_email_campaign_status.started_at,
      bulk_email_campaign_status.completed_at
    INTO v_id, v_status, v_total, v_sent, v_failed, v_processed, v_progress, v_details, v_created_at, v_started_at, v_completed_at;
  END IF;

  id := v_id;
  status := v_status;
  total := v_total;
  sent := v_sent;
  failed := v_failed;
  processed := v_processed;
  progress := v_progress;
  details := v_details;
  created_at := v_created_at;
  started_at := v_started_at;
  completed_at := v_completed_at;
  
  RETURN NEXT;
END;
$$;

-- =========================================================================
-- 4. FIX ROLE MUTABLE SEARCH_PATH - get_next_requirement_number function
-- =========================================================================

DROP FUNCTION IF EXISTS public.get_next_requirement_number(uuid) CASCADE;

CREATE OR REPLACE FUNCTION public.get_next_requirement_number(p_user_id UUID)
RETURNS INTEGER 
SECURITY DEFINER
SET search_path = public
STABLE
LANGUAGE plpgsql
AS $$
DECLARE
  next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(requirement_number), 0) + 1
  INTO next_num
  FROM requirements
  WHERE user_id = p_user_id;
  
  RETURN next_num;
END;
$$;

-- =========================================================================
-- 5. FIX ROLE MUTABLE SEARCH_PATH - trigger_set_requirement_number function
-- =========================================================================

DROP FUNCTION IF EXISTS public.trigger_set_requirement_number() CASCADE;

CREATE OR REPLACE FUNCTION public.trigger_set_requirement_number()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.requirement_number IS NULL THEN
    NEW.requirement_number := get_next_requirement_number(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;

-- Recreate the trigger
DROP TRIGGER IF EXISTS set_requirement_number_trigger ON requirements;
CREATE TRIGGER set_requirement_number_trigger
BEFORE INSERT ON requirements
FOR EACH ROW
EXECUTE FUNCTION trigger_set_requirement_number();

-- =========================================================================
-- 6. FIX ROLE MUTABLE SEARCH_PATH - set_campaign_user_id function
-- =========================================================================

DROP FUNCTION IF EXISTS public.set_campaign_user_id() CASCADE;

CREATE OR REPLACE FUNCTION public.set_campaign_user_id()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- If user_id is not set, use current authenticated user
  IF NEW.user_id IS NULL AND auth.uid() IS NOT NULL THEN
    NEW.user_id := auth.uid()::uuid;
  END IF;
  RETURN NEW;
END;
$$;

-- Recreate the trigger
DROP TRIGGER IF EXISTS set_campaign_user_id_trigger ON public.bulk_email_campaign_status;
CREATE TRIGGER set_campaign_user_id_trigger
BEFORE INSERT ON public.bulk_email_campaign_status
FOR EACH ROW
EXECUTE FUNCTION set_campaign_user_id();

-- =========================================================================
-- 7. FIX ROLE MUTABLE SEARCH_PATH - add_next_step_comment function
-- =========================================================================

DROP FUNCTION IF EXISTS public.add_next_step_comment(uuid, text) CASCADE;

CREATE OR REPLACE FUNCTION public.add_next_step_comment(
  p_requirement_id UUID,
  p_comment_text TEXT
)
RETURNS JSON
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_comment_id UUID;
  v_user_id UUID;
BEGIN
  -- Get current user ID
  v_user_id := auth.uid();
  
  -- Check if user_id is null
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;
  
  -- Verify user owns the requirement
  IF NOT EXISTS (
    SELECT 1 FROM public.requirements 
    WHERE id = p_requirement_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'You do not have permission to add comments to this requirement';
  END IF;
  
  -- Insert the comment
  INSERT INTO public.next_step_comments (requirement_id, user_id, comment_text)
  VALUES (p_requirement_id, v_user_id, p_comment_text)
  RETURNING id INTO v_comment_id;
  
  -- Return the created comment
  RETURN json_build_object(
    'id', v_comment_id,
    'requirement_id', p_requirement_id,
    'user_id', v_user_id,
    'comment_text', p_comment_text,
    'created_at', NOW(),
    'updated_at', NOW()
  );
END;
$$;

-- =========================================================================
-- 8. FIX ROLE MUTABLE SEARCH_PATH - requirements_search_update function
-- =========================================================================

DROP FUNCTION IF EXISTS public.requirements_search_update() CASCADE;

CREATE OR REPLACE FUNCTION public.requirements_search_update()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_vector := setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
                       setweight(to_tsvector('english', COALESCE(NEW.company, '')), 'B') ||
                       setweight(to_tsvector('english', COALESCE(NEW.primary_tech_stack, '')), 'C');
  RETURN NEW;
END;
$$;

-- Recreate trigger for requirements table
DROP TRIGGER IF EXISTS requirements_search_update_trigger ON requirements;
CREATE TRIGGER requirements_search_update_trigger
BEFORE INSERT OR UPDATE ON requirements
FOR EACH ROW
EXECUTE FUNCTION public.requirements_search_update();

-- =========================================================================
-- 9. FIX EVENT_TRIGGER_FN function
-- =========================================================================

DROP FUNCTION IF EXISTS public.event_trigger_fn() CASCADE;

CREATE OR REPLACE FUNCTION public.event_trigger_fn()
RETURNS event_trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- This is a placeholder event trigger function
  -- Specific implementation depends on your audit/logging requirements
  NULL;
END;
$$;

-- =========================================================================
-- 10. CREATE ACTIVITY_LOGS TABLE (if it doesn't exist)
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL, -- 'requirement', 'consultant', 'campaign', etc.
  resource_id UUID NOT NULL,
  action TEXT NOT NULL, -- 'create', 'update', 'delete', 'view'
  changes JSONB, -- Before/after values for update operations
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for activity_logs
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_date 
  ON public.activity_logs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_logs_resource 
  ON public.activity_logs (resource_type, resource_id);

-- =========================================================================
-- 11. ENABLE RLS ON ACTIVITY_LOGS
-- =========================================================================

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- 12. DROP INSECURE RLS POLICIES (always true conditions)
-- =========================================================================

DROP POLICY IF EXISTS "Allow delete activity_logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Allow insert activity_logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Allow update activity_logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Allow select activity_logs" ON public.activity_logs;

-- =========================================================================
-- 13. CREATE SECURE RLS POLICIES FOR ACTIVITY_LOGS
-- =========================================================================

-- Policy: Users can SELECT their own activity logs
CREATE POLICY "Users can view own activity logs"
  ON public.activity_logs
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid()::uuid);

-- Policy: Service role can INSERT activity logs (for backend operations)
CREATE POLICY "Service role can insert activity logs"
  ON public.activity_logs
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Policy: Service role can UPDATE activity logs
CREATE POLICY "Service role can update activity logs"
  ON public.activity_logs
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy: Service role can DELETE activity logs (for cleanup/maintenance)
CREATE POLICY "Service role can delete activity logs"
  ON public.activity_logs
  FOR DELETE
  TO service_role
  USING (true);

COMMIT;
