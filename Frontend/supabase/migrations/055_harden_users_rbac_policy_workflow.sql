-- Migration: 055_harden_users_rbac_policy_workflow.sql
-- Purpose:
-- 1) Use public.users.role as the source of truth for admin checks.
-- 2) Avoid recursive RLS by moving admin evaluation into SECURITY DEFINER helper.
-- 3) Keep self-service profile insert/update while allowing admins to manage users.

BEGIN;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Helper used by RLS policies; SECURITY DEFINER avoids recursive checks on public.users.
CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS boolean
SECURITY DEFINER
STABLE
SET search_path = public
LANGUAGE sql
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role = 'admin'
  );
$$;

DROP POLICY IF EXISTS "users_select_own" ON public.users;
CREATE POLICY "users_select_own"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (
    id = (select auth.uid())
    OR public.current_user_is_admin()
  );

DROP POLICY IF EXISTS "users_update_own" ON public.users;
CREATE POLICY "users_update_own"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (
    id = (select auth.uid())
    OR public.current_user_is_admin()
  )
  WITH CHECK (
    id = (select auth.uid())
    OR public.current_user_is_admin()
  );

DROP POLICY IF EXISTS "users_insert_own" ON public.users;
CREATE POLICY "users_insert_own"
  ON public.users
  FOR INSERT
  TO authenticated
  WITH CHECK (
    id = (select auth.uid())
    OR public.current_user_is_admin()
  );

DROP POLICY IF EXISTS "service_role_all_users" ON public.users;
CREATE POLICY "service_role_all_users"
  ON public.users
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMIT;

