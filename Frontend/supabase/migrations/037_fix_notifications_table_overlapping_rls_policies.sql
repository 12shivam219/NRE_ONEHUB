-- Migration: 037_fix_notifications_table_overlapping_rls_policies.sql
-- Purpose: Fix overlapping RLS policies on public.notifications table
-- Issue: Multiple permissive policies for the same role and action
--   - notifications_admin_all and notifications_user_own both applying to multiple roles
-- Solution: Consolidate into single policies per action using OR conditions

BEGIN;

-- =========================================================================
-- 1. DROP ALL EXISTING NOTIFICATIONS TABLE RLS POLICIES
-- =========================================================================

DROP POLICY IF EXISTS "notifications_admin_all" ON public.notifications;
DROP POLICY IF EXISTS "notifications_user_own" ON public.notifications;
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can insert own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can delete own notifications" ON public.notifications;

-- =========================================================================
-- 2. ENABLE RLS IF NOT ALREADY ENABLED
-- =========================================================================

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- 3. CREATE CONSOLIDATED, NON-OVERLAPPING POLICIES
-- =========================================================================

-- SELECT Policy: Users can view their own notifications OR admins can view all
CREATE POLICY "notifications_select"
  ON public.notifications
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

-- INSERT Policy: Users can insert their own notifications OR admins can insert
CREATE POLICY "notifications_insert"
  ON public.notifications
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

-- UPDATE Policy: Users can update their own notifications OR admins can update all
CREATE POLICY "notifications_update"
  ON public.notifications
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

-- DELETE Policy: Users can delete their own notifications OR admins can delete
CREATE POLICY "notifications_delete"
  ON public.notifications
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

-- Service role can do everything
CREATE POLICY "service_role_all_notifications"
  ON public.notifications
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMIT;
