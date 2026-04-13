-- Migration: 053_fix_users_insert_policy.sql
-- Purpose: Allow authenticated users to create their own profile row in public.users.
-- Without this, client-side registration that inserts into public.users fails due to RLS.

BEGIN;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Users can insert their own profile row (id must equal auth.uid()).
DROP POLICY IF EXISTS "users_insert_own" ON public.users;
CREATE POLICY "users_insert_own"
  ON public.users
  FOR INSERT
  TO authenticated
  WITH CHECK (id = (select auth.uid()));

COMMIT;

