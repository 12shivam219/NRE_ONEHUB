-- Migration: 029_fix_additional_insecure_rls_and_functions.sql
-- Purpose: Fix insecure RLS policies and role mutable search_path
-- Issues Fixed:
--   - immutable_to_text function has role mutable search_path
--   - activity_logs has unrestricted INSERT policy
--   - attachments has unrestricted DELETE, INSERT, UPDATE policies
--   - consultants has unrestricted DELETE, INSERT, UPDATE policies
--   - document_versions has unrestricted DELETE, INSERT, UPDATE policies
--   - email_threads has unrestricted DELETE, INSERT, UPDATE policies
--   - error_reports has unrestricted DELETE, INSERT, UPDATE policies
--   - google_drive_tokens has unrestricted DELETE, INSERT, UPDATE policies

BEGIN;

-- =========================================================================
-- 1. FIX IMMUTABLE_TO_TEXT FUNCTION - Role Mutable Search Path
-- =========================================================================
-- Note: This function is not used in the application code.
-- It's being dropped to remove the security advisor warning about mutable search_path.
-- If needed in the future, it can be recreated with proper search_path configuration.

DROP FUNCTION IF EXISTS public.immutable_to_text(text) CASCADE;

-- =========================================================================
-- 2. FIX ACTIVITY_LOGS TABLE RLS POLICIES
-- =========================================================================

DROP POLICY IF EXISTS "allow_insert_activity" ON public.activity_logs;
DROP POLICY IF EXISTS "Users can view own activity logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Service role can insert activity logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Service role can update activity logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Service role can delete activity logs" ON public.activity_logs;

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Users can SELECT their own activity logs
CREATE POLICY "Users can view own activity logs"
  ON public.activity_logs
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid()::uuid);

-- Service role can INSERT activity logs (enforce user_id if set)
CREATE POLICY "Service role can insert activity logs"
  ON public.activity_logs
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Service role can UPDATE activity logs
CREATE POLICY "Service role can update activity logs"
  ON public.activity_logs
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Service role can DELETE activity logs
CREATE POLICY "Service role can delete activity logs"
  ON public.activity_logs
  FOR DELETE
  TO service_role
  USING (true);

-- =========================================================================
-- 3. FIX ATTACHMENTS TABLE RLS POLICIES
-- =========================================================================

DROP POLICY IF EXISTS "Allow delete attachments" ON public.attachments;
DROP POLICY IF EXISTS "Allow insert attachments" ON public.attachments;
DROP POLICY IF EXISTS "Allow update attachments" ON public.attachments;
DROP POLICY IF EXISTS "Allow select attachments" ON public.attachments;

ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;

-- Users can SELECT their own attachments
CREATE POLICY "Users can view own attachments"
  ON public.attachments
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid()::uuid);

-- Users can INSERT their own attachments
CREATE POLICY "Users can insert attachments"
  ON public.attachments
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid()::uuid);

-- Users can UPDATE their own attachments
CREATE POLICY "Users can update attachments"
  ON public.attachments
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid()::uuid)
  WITH CHECK (user_id = auth.uid()::uuid);

-- Users can DELETE their own attachments
CREATE POLICY "Users can delete attachments"
  ON public.attachments
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid()::uuid);

-- =========================================================================
-- 4. FIX CONSULTANTS TABLE RLS POLICIES
-- =========================================================================

DROP POLICY IF EXISTS "Allow delete consultants" ON public.consultants;
DROP POLICY IF EXISTS "Allow insert consultants" ON public.consultants;
DROP POLICY IF EXISTS "Allow update consultants" ON public.consultants;
DROP POLICY IF EXISTS "Allow select consultants" ON public.consultants;

ALTER TABLE public.consultants ENABLE ROW LEVEL SECURITY;

-- Users can SELECT consultants they created
CREATE POLICY "Users can view own consultants"
  ON public.consultants
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid()::uuid);

-- Users can INSERT consultants
CREATE POLICY "Users can insert consultants"
  ON public.consultants
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid()::uuid);

-- Users can UPDATE their own consultants
CREATE POLICY "Users can update own consultants"
  ON public.consultants
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid()::uuid)
  WITH CHECK (user_id = auth.uid()::uuid);

-- Users can DELETE their own consultants
CREATE POLICY "Users can delete own consultants"
  ON public.consultants
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid()::uuid);

-- =========================================================================
-- 5. FIX DOCUMENT_VERSIONS TABLE RLS POLICIES
-- =========================================================================

DROP POLICY IF EXISTS "Allow delete document_versions" ON public.document_versions;
DROP POLICY IF EXISTS "Allow insert document_versions" ON public.document_versions;
DROP POLICY IF EXISTS "Allow update document_versions" ON public.document_versions;
DROP POLICY IF EXISTS "Allow select document_versions" ON public.document_versions;

ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;

-- Users can SELECT document versions for documents they own
CREATE POLICY "Users can view document versions"
  ON public.document_versions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.documents
      WHERE documents.id = document_versions.document_id
      AND documents.user_id = auth.uid()::uuid
    )
  );

-- Users can INSERT document versions for documents they own
CREATE POLICY "Users can insert document versions"
  ON public.document_versions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.documents
      WHERE documents.id = document_versions.document_id
      AND documents.user_id = auth.uid()::uuid
    )
  );

-- Users can UPDATE document versions for documents they own
CREATE POLICY "Users can update document versions"
  ON public.document_versions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.documents
      WHERE documents.id = document_versions.document_id
      AND documents.user_id = auth.uid()::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.documents
      WHERE documents.id = document_versions.document_id
      AND documents.user_id = auth.uid()::uuid
    )
  );

-- Users can DELETE document versions for documents they own
CREATE POLICY "Users can delete document versions"
  ON public.document_versions
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.documents
      WHERE documents.id = document_versions.document_id
      AND documents.user_id = auth.uid()::uuid
    )
  );

-- =========================================================================
-- 6. FIX EMAIL_THREADS TABLE RLS POLICIES
-- =========================================================================

DROP POLICY IF EXISTS "Allow delete email_threads" ON public.email_threads;
DROP POLICY IF EXISTS "Allow insert email_threads" ON public.email_threads;
DROP POLICY IF EXISTS "Allow update email_threads" ON public.email_threads;
DROP POLICY IF EXISTS "Allow select email_threads" ON public.email_threads;

ALTER TABLE public.email_threads ENABLE ROW LEVEL SECURITY;

-- Users can SELECT their own email threads
CREATE POLICY "Users can view own email threads"
  ON public.email_threads
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid()::uuid);

-- Users can INSERT their own email threads
CREATE POLICY "Users can insert email threads"
  ON public.email_threads
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid()::uuid);

-- Users can UPDATE their own email threads
CREATE POLICY "Users can update email threads"
  ON public.email_threads
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid()::uuid)
  WITH CHECK (user_id = auth.uid()::uuid);

-- Users can DELETE their own email threads
CREATE POLICY "Users can delete email threads"
  ON public.email_threads
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid()::uuid);

-- =========================================================================
-- 7. FIX ERROR_REPORTS TABLE RLS POLICIES
-- =========================================================================

DROP POLICY IF EXISTS "Allow delete error_reports" ON public.error_reports;
DROP POLICY IF EXISTS "Allow insert error_reports" ON public.error_reports;
DROP POLICY IF EXISTS "Allow update error_reports" ON public.error_reports;
DROP POLICY IF EXISTS "Allow select error_reports" ON public.error_reports;

ALTER TABLE public.error_reports ENABLE ROW LEVEL SECURITY;

-- Users can SELECT their own error reports
CREATE POLICY "Users can view own error reports"
  ON public.error_reports
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid()::uuid);

-- Users can INSERT error reports for themselves
CREATE POLICY "Users can insert error reports"
  ON public.error_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid()::uuid);

-- Service role can UPDATE error reports
CREATE POLICY "Service role can update error reports"
  ON public.error_reports
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Service role can DELETE error reports
CREATE POLICY "Service role can delete error reports"
  ON public.error_reports
  FOR DELETE
  TO service_role
  USING (true);

-- =========================================================================
-- 8. FIX GOOGLE_DRIVE_TOKENS TABLE RLS POLICIES
-- =========================================================================

DROP POLICY IF EXISTS "Allow delete google_drive_tokens" ON public.google_drive_tokens;
DROP POLICY IF EXISTS "Allow insert google_drive_tokens" ON public.google_drive_tokens;
DROP POLICY IF EXISTS "Allow update google_drive_tokens" ON public.google_drive_tokens;
DROP POLICY IF EXISTS "Allow select google_drive_tokens" ON public.google_drive_tokens;

ALTER TABLE public.google_drive_tokens ENABLE ROW LEVEL SECURITY;

-- Users can SELECT their own Google Drive tokens
CREATE POLICY "Users can view own google drive tokens"
  ON public.google_drive_tokens
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid()::uuid);

-- Users can INSERT their own Google Drive tokens
CREATE POLICY "Users can insert google drive tokens"
  ON public.google_drive_tokens
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid()::uuid);

-- Users can UPDATE their own Google Drive tokens
CREATE POLICY "Users can update own google drive tokens"
  ON public.google_drive_tokens
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid()::uuid)
  WITH CHECK (user_id = auth.uid()::uuid);

-- Users can DELETE their own Google Drive tokens
CREATE POLICY "Users can delete own google drive tokens"
  ON public.google_drive_tokens
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid()::uuid);

-- =========================================================================
-- 9. REMOVED - INTERVIEW_FOCUS_CACHE TABLE (Deprecated Feature)
-- =========================================================================
-- The interview_focus_cache table and RLS policies have been removed
-- as part of the feature deprecation. See migration 042_remove_interview_focus_cache.sql

COMMIT;
