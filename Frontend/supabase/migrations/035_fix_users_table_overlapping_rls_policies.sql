-- Migration: 035_fix_users_table_overlapping_rls_policies.sql
-- Purpose: Fix overlapping RLS policies on public.users, public.user_sessions, and public.requirements tables
-- Issue: Multiple permissive policies for the same role and action
-- Solution: Remove duplicate policies and consolidate

BEGIN;

-- =========================================================================
-- 1. FIX PUBLIC.USERS TABLE - Remove overlapping policies
-- =========================================================================

DROP POLICY IF EXISTS "users_admin_all" ON public.users;
DROP POLICY IF EXISTS "users_admin_select_all" ON public.users;
DROP POLICY IF EXISTS "users_admin_update_all" ON public.users;
DROP POLICY IF EXISTS "users_update_own" ON public.users;
DROP POLICY IF EXISTS "users_select_own" ON public.users;
DROP POLICY IF EXISTS "users_insert_own" ON public.users;
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
DROP POLICY IF EXISTS "Users can view all users" ON public.users;
DROP POLICY IF EXISTS "service_role_all_users" ON public.users;

-- Recreate with non-overlapping policies
-- Only authenticated users can view their own profile
CREATE POLICY "users_select_own"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (id = (select auth.uid())
    -- Also allow admin users to see all profiles (checked via role, not duplicate policy)
    OR EXISTS (
      SELECT 1 FROM public.users admin_check
      WHERE admin_check.id = (select auth.uid())
      AND admin_check.role = 'admin'
    )
  );

-- Only authenticated users can update their own profile
CREATE POLICY "users_update_own"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (id = (select auth.uid())
    -- Also allow admin users to update all profiles
    OR EXISTS (
      SELECT 1 FROM public.users admin_check
      WHERE admin_check.id = (select auth.uid())
      AND admin_check.role = 'admin'
    )
  )
  WITH CHECK (id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.users admin_check
      WHERE admin_check.id = (select auth.uid())
      AND admin_check.role = 'admin'
    )
  );

-- Service role can do everything
CREATE POLICY "service_role_all_users"
  ON public.users
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =========================================================================
-- 2. FIX PUBLIC.USER_SESSIONS TABLE - Remove duplicate policies
-- =========================================================================

DROP POLICY IF EXISTS "Users can select own sessions" ON public.user_sessions;
DROP POLICY IF EXISTS "Users can view their sessions" ON public.user_sessions;
DROP POLICY IF EXISTS "Users can insert own sessions" ON public.user_sessions;
DROP POLICY IF EXISTS "Users can insert their sessions" ON public.user_sessions;
DROP POLICY IF EXISTS "Users can update own sessions" ON public.user_sessions;
DROP POLICY IF EXISTS "Users can update their sessions" ON public.user_sessions;
DROP POLICY IF EXISTS "Users can delete own sessions" ON public.user_sessions;
DROP POLICY IF EXISTS "Users can delete their sessions" ON public.user_sessions;

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

-- Recreate with single policy per action
CREATE POLICY "Users can select own sessions"
  ON public.user_sessions
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own sessions"
  ON public.user_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own sessions"
  ON public.user_sessions
  FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own sessions"
  ON public.user_sessions
  FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- =========================================================================
-- 3. FIX PUBLIC.REQUIREMENTS TABLE - Remove overlapping policies
-- =========================================================================

DROP POLICY IF EXISTS "requirements_admin_all" ON public.requirements;
DROP POLICY IF EXISTS "requirements_user_own" ON public.requirements;
DROP POLICY IF EXISTS "Users can view own requirements" ON public.requirements;
DROP POLICY IF EXISTS "Users can insert requirements" ON public.requirements;
DROP POLICY IF EXISTS "Users can update own requirements" ON public.requirements;
DROP POLICY IF EXISTS "Users can delete own requirements" ON public.requirements;

ALTER TABLE public.requirements ENABLE ROW LEVEL SECURITY;

-- Single comprehensive SELECT policy
CREATE POLICY "requirements_select"
  ON public.requirements
  FOR SELECT
  TO authenticated
  USING (
    user_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.users admin_check
      WHERE admin_check.id = (select auth.uid())
      AND admin_check.role = 'admin'
    )
  );

-- Single comprehensive INSERT policy
CREATE POLICY "requirements_insert"
  ON public.requirements
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.users admin_check
      WHERE admin_check.id = (select auth.uid())
      AND admin_check.role = 'admin'
    )
  );

-- Single comprehensive UPDATE policy
CREATE POLICY "requirements_update"
  ON public.requirements
  FOR UPDATE
  TO authenticated
  USING (
    user_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.users admin_check
      WHERE admin_check.id = (select auth.uid())
      AND admin_check.role = 'admin'
    )
  )
  WITH CHECK (
    user_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.users admin_check
      WHERE admin_check.id = (select auth.uid())
      AND admin_check.role = 'admin'
    )
  );

-- Single comprehensive DELETE policy
CREATE POLICY "requirements_delete"
  ON public.requirements
  FOR DELETE
  TO authenticated
  USING (
    user_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.users admin_check
      WHERE admin_check.id = (select auth.uid())
      AND admin_check.role = 'admin'
    )
  );

COMMIT;
