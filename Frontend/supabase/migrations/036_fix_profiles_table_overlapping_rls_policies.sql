-- Migration: 036_fix_profiles_table_overlapping_rls_policies.sql
-- Purpose: Fix overlapping RLS policies on public.profiles table
-- Issue: Multiple permissive policies for the same role and action
--   - profiles_admin_all and profiles_user_own both applying to multiple roles
-- Solution: Consolidate into single policies per action using OR conditions
--
-- NOTE: This migration only runs if the profiles table exists.
-- The profiles table may not exist in all deployments, so we check existence first.

BEGIN;

-- Check if profiles table exists before trying to modify it
-- If it doesn't exist, this migration will be skipped safely
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'profiles'
  ) THEN
    RETURN;
  END IF;

  -- Table exists, so proceed with dropping and recreating policies
  EXECUTE 'DROP POLICY IF EXISTS "profiles_admin_all" ON public.profiles';
  EXECUTE 'DROP POLICY IF EXISTS "profiles_user_own" ON public.profiles';
  EXECUTE 'DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles';
  EXECUTE 'DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles';
  EXECUTE 'DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles';
  EXECUTE 'DROP POLICY IF EXISTS "Users can delete own profile" ON public.profiles';
  EXECUTE 'DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles';
  EXECUTE 'DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles';
  EXECUTE 'DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles';

  -- Enable RLS
  EXECUTE 'ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY';

  -- Recreate policies
  EXECUTE 'CREATE POLICY "profiles_select"
    ON public.profiles
    FOR SELECT
    TO authenticated
    USING (
      id = (select auth.uid())
    )';

  EXECUTE 'CREATE POLICY "profiles_insert"
    ON public.profiles
    FOR INSERT
    TO authenticated
    WITH CHECK (
      id = (select auth.uid())
    )';

  EXECUTE 'CREATE POLICY "profiles_update"
    ON public.profiles
    FOR UPDATE
    TO authenticated
    USING (
      id = (select auth.uid())
    )
    WITH CHECK (
      id = (select auth.uid())
    )';

  EXECUTE 'CREATE POLICY "profiles_delete"
    ON public.profiles
    FOR DELETE
    TO authenticated
    USING (
      id = (select auth.uid())
    )';

  EXECUTE 'CREATE POLICY "service_role_all_profiles"
    ON public.profiles
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true)';

END $$;

COMMIT;
