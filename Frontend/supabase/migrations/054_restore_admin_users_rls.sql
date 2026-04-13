-- Migration: 054_restore_admin_users_rls.sql
-- Purpose: Restore admin visibility/editing on public.users without recursive policies.
-- Approach: Use public.is_admin(auth.uid()) which reads auth.users (no recursion on public.users).

BEGIN;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Replace non-admin-only policies with admin-aware versions.
DROP POLICY IF EXISTS "users_select_own" ON public.users;
CREATE POLICY "users_select_own"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (
    id = (select auth.uid())
    OR public.is_admin((select auth.uid()))
  );

DROP POLICY IF EXISTS "users_update_own" ON public.users;
CREATE POLICY "users_update_own"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (
    id = (select auth.uid())
    OR public.is_admin((select auth.uid()))
  )
  WITH CHECK (
    id = (select auth.uid())
    OR public.is_admin((select auth.uid()))
  );

COMMIT;

