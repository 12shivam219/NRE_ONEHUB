-- Migration: 057_shared_email_accounts_access.sql
-- Purpose: Shared workspace access for public.email_accounts.
-- Notes:
-- - This matches the requirement: all authenticated users can see/create/update/delete all records.
-- - The client should avoid selecting `app_password_encrypted`.

BEGIN;

ALTER TABLE public.email_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_accounts_select" ON public.email_accounts;
DROP POLICY IF EXISTS "email_accounts_insert" ON public.email_accounts;
DROP POLICY IF EXISTS "email_accounts_update" ON public.email_accounts;
DROP POLICY IF EXISTS "email_accounts_delete" ON public.email_accounts;
DROP POLICY IF EXISTS "Users can view own email accounts" ON public.email_accounts;
DROP POLICY IF EXISTS "Users can insert own email accounts" ON public.email_accounts;
DROP POLICY IF EXISTS "Users can update own email accounts" ON public.email_accounts;
DROP POLICY IF EXISTS "Users can delete own email accounts" ON public.email_accounts;
DROP POLICY IF EXISTS "Allow select email_accounts" ON public.email_accounts;
DROP POLICY IF EXISTS "Allow insert email_accounts" ON public.email_accounts;
DROP POLICY IF EXISTS "Allow update email_accounts" ON public.email_accounts;
DROP POLICY IF EXISTS "Allow delete email_accounts" ON public.email_accounts;

CREATE POLICY "email_accounts_select_all_authenticated"
  ON public.email_accounts
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "email_accounts_insert_all_authenticated"
  ON public.email_accounts
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "email_accounts_update_all_authenticated"
  ON public.email_accounts
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "email_accounts_delete_all_authenticated"
  ON public.email_accounts
  FOR DELETE
  TO authenticated
  USING (true);

COMMIT;

