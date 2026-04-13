-- Migration: 041_add_rls_policies_job_tables.sql
-- Purpose: Add RLS policies for job_extraction_logs and processed_job_emails tables
-- Issue: Tables have RLS enabled but no policies exist

BEGIN;

-- =========================================================================
-- 1. RLS POLICIES FOR public.job_extraction_logs
-- =========================================================================

-- SELECT: Users can view their own logs, admins can view all
CREATE POLICY "job_extraction_logs_select"
  ON public.job_extraction_logs
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

-- INSERT: Users can insert their own logs, admins can insert for anyone
CREATE POLICY "job_extraction_logs_insert"
  ON public.job_extraction_logs
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

-- UPDATE: Users can update their own logs, admins can update any
CREATE POLICY "job_extraction_logs_update"
  ON public.job_extraction_logs
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

-- DELETE: Users can delete their own logs, admins can delete any
CREATE POLICY "job_extraction_logs_delete"
  ON public.job_extraction_logs
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
CREATE POLICY "job_extraction_logs_service_role"
  ON public.job_extraction_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =========================================================================
-- 2. RLS POLICIES FOR public.processed_job_emails
-- =========================================================================

-- SELECT: Users can view their own processed emails, admins can view all
CREATE POLICY "processed_job_emails_select"
  ON public.processed_job_emails
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

-- INSERT: Users can insert their own processed emails, admins can insert for anyone
CREATE POLICY "processed_job_emails_insert"
  ON public.processed_job_emails
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

-- UPDATE: Users can update their own processed emails, admins can update any
CREATE POLICY "processed_job_emails_update"
  ON public.processed_job_emails
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

-- DELETE: Users can delete their own processed emails, admins can delete any
CREATE POLICY "processed_job_emails_delete"
  ON public.processed_job_emails
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
CREATE POLICY "processed_job_emails_service_role"
  ON public.processed_job_emails
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMIT;
