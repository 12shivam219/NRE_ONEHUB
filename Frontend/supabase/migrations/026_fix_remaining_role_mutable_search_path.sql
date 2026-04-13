-- Migration: 026_fix_remaining_role_mutable_search_path.sql
-- Purpose: Fix role mutable search_path issues on remaining functions
-- This fixes Supabase advisor warnings for functions that need immutable search_path settings

BEGIN;

-- =========================================================================
-- 1. FIX ROLE MUTABLE SEARCH_PATH - get_next_requirement_number function
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
-- 2. FIX ROLE MUTABLE SEARCH_PATH - trigger_set_requirement_number function
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
-- 3. FIX ROLE MUTABLE SEARCH_PATH - set_campaign_user_id function
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
-- 4. FIX ROLE MUTABLE SEARCH_PATH - add_next_step_comment function
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
-- 5. FIX ROLE MUTABLE SEARCH_PATH - requirements_search_update function
-- (Re-apply if needed, ensures it's correct)
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

COMMIT;
