-- Migration: 038_fix_infinite_recursion_users_table.sql
-- Purpose: Fix infinite recursion in RLS policies on users table
-- Issue: Policies on public.users table that reference public.users in subqueries
--        cause infinite recursion when the table is accessed
-- Solution: Simplify policies to only check user ID, not role. Admin access handled via service role.

BEGIN;

-- =========================================================================
-- 1. FIX PUBLIC.USERS TABLE - Remove recursive subquery references
-- =========================================================================

-- Drop the problematic policies that cause infinite recursion
DROP POLICY IF EXISTS "users_select_own" ON public.users;
DROP POLICY IF EXISTS "users_update_own" ON public.users;
DROP POLICY IF EXISTS "service_role_all_users" ON public.users;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- SELECT: Users can view their own profile ONLY
CREATE POLICY "users_select_own"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (id = (select auth.uid()));

-- UPDATE: Users can only update their own profile
CREATE POLICY "users_update_own"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (id = (select auth.uid()))
  WITH CHECK (id = (select auth.uid()));

-- Service role bypass
CREATE POLICY "service_role_all_users"
  ON public.users
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =========================================================================
-- 2. FIX NOTIFICATIONS TABLE - Remove recursive subquery references
-- =========================================================================

-- Drop policies that reference users table causing recursion
DROP POLICY IF EXISTS "notifications_select" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update" ON public.notifications;
DROP POLICY IF EXISTS "notifications_delete" ON public.notifications;
DROP POLICY IF EXISTS "service_role_all_notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can insert own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can delete own notifications" ON public.notifications;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can only see their own notifications
CREATE POLICY "notifications_select"
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

-- Users can only insert their own notifications
CREATE POLICY "notifications_insert"
  ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

-- Users can only update their own notifications
CREATE POLICY "notifications_update"
  ON public.notifications
  FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- Users can only delete their own notifications
CREATE POLICY "notifications_delete"
  ON public.notifications
  FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()));

-- Service role bypass
CREATE POLICY "service_role_all_notifications"
  ON public.notifications
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =========================================================================
-- 3. FIX REQUIREMENTS TABLE - Remove recursive subquery references
-- =========================================================================

-- Drop policies that reference users table causing recursion
DROP POLICY IF EXISTS "requirements_select" ON public.requirements;
DROP POLICY IF EXISTS "requirements_insert" ON public.requirements;
DROP POLICY IF EXISTS "requirements_update" ON public.requirements;
DROP POLICY IF EXISTS "requirements_delete" ON public.requirements;
DROP POLICY IF EXISTS "service_role_all_requirements" ON public.requirements;
DROP POLICY IF EXISTS "Users can view own requirements" ON public.requirements;
DROP POLICY IF EXISTS "Users can insert requirements" ON public.requirements;
DROP POLICY IF EXISTS "Users can update own requirements" ON public.requirements;
DROP POLICY IF EXISTS "Users can delete own requirements" ON public.requirements;

ALTER TABLE public.requirements ENABLE ROW LEVEL SECURITY;

-- Users can only view their own requirements
CREATE POLICY "requirements_select"
  ON public.requirements
  FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

-- Users can only insert their own requirements
CREATE POLICY "requirements_insert"
  ON public.requirements
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

-- Users can only update their own requirements
CREATE POLICY "requirements_update"
  ON public.requirements
  FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- Users can only delete their own requirements
CREATE POLICY "requirements_delete"
  ON public.requirements
  FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()));

-- Service role bypass (for admin operations)
CREATE POLICY "service_role_all_requirements"
  ON public.requirements
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMIT;
