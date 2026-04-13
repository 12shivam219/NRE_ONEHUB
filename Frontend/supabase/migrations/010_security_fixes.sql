-- Migration: 010_security_fixes.sql
-- Purpose: Fix critical security issues:
-- 1. Remove role mutable search_path from functions
-- 2. Move extensions (pg_trgm, unaccent) to extensions schema
-- 3. Enable HaveIBeenPwned password checking in Supabase Auth

BEGIN;

-- =========================================================================
-- 1. CREATE EXTENSIONS SCHEMA (if it doesn't exist)
-- =========================================================================

CREATE SCHEMA IF NOT EXISTS extensions;

-- =========================================================================
-- 2. MOVE EXTENSIONS TO EXTENSIONS SCHEMA
-- =========================================================================

-- Drop dependent objects first (trigram indexes) before moving extension
DROP INDEX IF EXISTS idx_requirements_title_trgm;
DROP INDEX IF EXISTS idx_requirements_company_trgm;
DROP INDEX IF EXISTS idx_requirements_tech_trgm;
DROP INDEX IF EXISTS idx_requirements_vendor_company_trgm;
DROP INDEX IF EXISTS idx_requirements_vendor_email_trgm;
DROP INDEX IF EXISTS idx_consultants_name_trgm;
DROP INDEX IF EXISTS idx_consultants_email_trgm;
DROP INDEX IF EXISTS idx_consultants_primary_skills_trgm;
DROP INDEX IF EXISTS idx_users_email_trgm;
DROP INDEX IF EXISTS idx_users_full_name_trgm;

-- Move pg_trgm extension to extensions schema
ALTER EXTENSION pg_trgm SET SCHEMA extensions;

-- Move unaccent extension to extensions schema
ALTER EXTENSION unaccent SET SCHEMA extensions;

-- Recreate trigram indexes with correct schema reference
CREATE INDEX IF NOT EXISTS idx_requirements_title_trgm 
  ON requirements USING gin (title extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_requirements_company_trgm 
  ON requirements USING gin (company extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_requirements_tech_trgm 
  ON requirements USING gin (primary_tech_stack extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_requirements_vendor_company_trgm 
  ON requirements USING gin (vendor_company extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_requirements_vendor_email_trgm 
  ON requirements USING gin (vendor_email extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_consultants_name_trgm 
  ON consultants USING gin (name extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_consultants_email_trgm 
  ON consultants USING gin (email extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_consultants_primary_skills_trgm 
  ON consultants USING gin (primary_skills extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_users_email_trgm 
  ON users USING gin (email extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_users_full_name_trgm 
  ON users USING gin (full_name extensions.gin_trgm_ops);

-- =========================================================================
-- 3. FIX ROLE MUTABLE SEARCH_PATH - is_admin function
-- =========================================================================

-- Drop existing function with role mutable search_path
DROP FUNCTION IF EXISTS public.is_admin(uuid) CASCADE;

-- Recreate without role mutable search_path
CREATE OR REPLACE FUNCTION public.is_admin(p_user_id uuid)
RETURNS boolean
SECURITY DEFINER
STABLE
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT is_admin INTO v_is_admin
  FROM auth.users
  WHERE id = p_user_id;
  
  RETURN COALESCE(v_is_admin, false);
END;
$$;

-- =========================================================================
-- 4. FIX ROLE MUTABLE SEARCH_PATH - requirements_search_update function
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
-- 5. FIX ROLE MUTABLE SEARCH_PATH - append_campaign_event function
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
BEGIN
  UPDATE public.bulk_email_campaign_status
  SET
    sent = COALESCE(sent,0) + COALESCE(p_sent,0),
    failed = COALESCE(failed,0) + COALESCE(p_failed,0),
    processed = GREATEST(COALESCE(processed,0), COALESCE(p_processed,0)),
    progress = GREATEST(COALESCE(progress,0), COALESCE(p_progress,0)),
    details = COALESCE(details,'[]'::jsonb) || COALESCE(p_event, '[]'::jsonb)
  WHERE id = p_id
  RETURNING id, status, total, sent, failed, processed, progress, details, created_at, started_at, completed_at
  INTO id, status, total, sent, failed, processed, progress, details, created_at, started_at, completed_at;

  IF NOT FOUND THEN
    INSERT INTO public.bulk_email_campaign_status(id, status, total, sent, failed, processed, progress, details, created_at)
    VALUES (p_id, 'processing', 0, COALESCE(p_sent,0), COALESCE(p_failed,0), COALESCE(p_processed,0), COALESCE(p_progress,0),
            COALESCE(p_event, '[]'::jsonb), now())
    RETURNING id, status, total, sent, failed, processed, progress, details, created_at, started_at, completed_at
    INTO id, status, total, sent, failed, processed, progress, details, created_at, started_at, completed_at;
  END IF;

  RETURN NEXT;
END;
$$;

-- =========================================================================
-- 6. FIX ROLE MUTABLE SEARCH_PATH - cleanup_old_campaigns function
-- =========================================================================

DROP FUNCTION IF EXISTS public.cleanup_old_campaigns() CASCADE;

CREATE OR REPLACE FUNCTION public.cleanup_old_campaigns()
RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM public.bulk_email_campaign_status
  WHERE created_at < now() - INTERVAL '3 days';
END;
$$;

-- Reschedule the cleanup job with pg_cron
-- Note: First, unschedule the old job if it exists
SELECT cron.unschedule('cleanup_old_campaigns_daily') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'cleanup_old_campaigns_daily'
);

-- Schedule the cleanup with the fixed function
SELECT cron.schedule('cleanup_old_campaigns_daily', '0 3 * * *', $$SELECT public.cleanup_old_campaigns();$$);

-- =========================================================================
-- 7. ENABLE HAVEIBEEENPWNED PASSWORD CHECKING IN SUPABASE AUTH
-- =========================================================================

-- Note: This requires updating Supabase Auth configuration via the dashboard or API.
-- The following documents the recommended setup:
--
-- To enable HaveIBeenPwned checking in Supabase Auth:
-- 1. Go to: Project Settings > Security > Password Strength
-- 2. Enable "Check password against HaveIBeenPwned database"
-- 3. This will prevent users from using compromised passwords
--
-- Alternatively, if using Supabase CLI or API:
-- Set auth configuration variable:
-- auth.password_check_against_have_i_been_pwned = true

-- For now, we create a comment documenting the requirement
COMMENT ON SCHEMA public IS 'Main schema. Note: HaveIBeenPwned password checking should be enabled in Auth project settings.';

COMMIT;
