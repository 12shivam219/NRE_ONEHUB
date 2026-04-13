-- Migration: 034_fix_rls_subquery_optimization.sql
-- Purpose: Fix RLS policy performance issue by wrapping auth.uid() calls in subqueries
-- Issue: Supabase security advisor identified that policies re-evaluate current_setting() 
--        or auth.uid() for each row, causing suboptimal query performance at scale
-- Solution: Wrap auth.uid(), auth.email(), and auth.role() with (select ...) 
--           to cache the result and avoid re-evaluation for each row

BEGIN;

-- =========================================================================
-- 1. FIX LOGIN_HISTORY TABLE RLS POLICIES
-- =========================================================================

-- Drop and recreate with optimized subquery
DROP POLICY IF EXISTS "Users can view own login history" ON public.login_history;

CREATE POLICY "Users can view own login history"
  ON public.login_history
  FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()::uuid));

-- Add admin policy if it doesn't exist
DROP POLICY IF EXISTS "admins_manage_login_history_all" ON public.login_history;

CREATE POLICY "admins_manage_login_history_all"
  ON public.login_history
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = (select auth.uid()) AND role = 'admin'
    )
  );

-- =========================================================================
-- 2. FIX ACTIVITY_LOGS TABLE RLS POLICIES
-- =========================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own activity logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Users can insert own activity" ON public.activity_logs;
DROP POLICY IF EXISTS "user_activity_read_own" ON public.activity_logs;
DROP POLICY IF EXISTS "admins_manage_activity_logs_all" ON public.activity_logs;

-- Recreate with optimized subqueries

-- Users can INSERT their own activity logs
CREATE POLICY "Users can insert own activity"
  ON public.activity_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()::uuid));

-- Users can VIEW their own activity logs
CREATE POLICY "Users can view own activity logs"
  ON public.activity_logs
  FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()::uuid));

-- Alias policy for explicit user read
CREATE POLICY "user_activity_read_own"
  ON public.activity_logs
  FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()::uuid));

-- Admins can manage all activity logs
CREATE POLICY "admins_manage_activity_logs_all"
  ON public.activity_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = (select auth.uid()) AND role = 'admin'
    )
  );

-- Service role policies (unchanged but included for completeness)
DROP POLICY IF EXISTS "Service role can insert activity logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Service role can update activity logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Service role can delete activity logs" ON public.activity_logs;

CREATE POLICY "Service role can insert activity logs"
  ON public.activity_logs
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update activity logs"
  ON public.activity_logs
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can delete activity logs"
  ON public.activity_logs
  FOR DELETE
  TO service_role
  USING (true);

-- =========================================================================
-- 3. FIX DOCUMENTS TABLE RLS POLICIES
-- =========================================================================

-- Drop and recreate with optimized subquery
DROP POLICY IF EXISTS "documents_user_own" ON public.documents;

CREATE POLICY "documents_user_own"
  ON public.documents
  FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()::uuid));

-- Ensure other document policies are optimized too
DROP POLICY IF EXISTS "Users can view own documents" ON public.documents;
DROP POLICY IF EXISTS "Users can insert documents" ON public.documents;
DROP POLICY IF EXISTS "Users can update own documents" ON public.documents;
DROP POLICY IF EXISTS "Users can delete own documents" ON public.documents;

CREATE POLICY "Users can view own documents"
  ON public.documents
  FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()::uuid));

CREATE POLICY "Users can insert documents"
  ON public.documents
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()::uuid));

CREATE POLICY "Users can update own documents"
  ON public.documents
  FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()::uuid))
  WITH CHECK (user_id = (select auth.uid()::uuid));

CREATE POLICY "Users can delete own documents"
  ON public.documents
  FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()::uuid));

-- =========================================================================
-- 4. OPTIMIZE OTHER HIGH-USE TABLES WITH auth.uid() IN RLS POLICIES
-- =========================================================================

-- attachments
DROP POLICY IF EXISTS "Users can view own attachments" ON public.attachments;
DROP POLICY IF EXISTS "Users can insert attachments" ON public.attachments;
DROP POLICY IF EXISTS "Users can update attachments" ON public.attachments;
DROP POLICY IF EXISTS "Users can delete attachments" ON public.attachments;

CREATE POLICY "Users can view own attachments"
  ON public.attachments
  FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()::uuid));

CREATE POLICY "Users can insert attachments"
  ON public.attachments
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()::uuid));

CREATE POLICY "Users can update attachments"
  ON public.attachments
  FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()::uuid))
  WITH CHECK (user_id = (select auth.uid()::uuid));

CREATE POLICY "Users can delete attachments"
  ON public.attachments
  FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()::uuid));

-- consultants
DROP POLICY IF EXISTS "Users can view own consultants" ON public.consultants;
DROP POLICY IF EXISTS "Users can insert consultants" ON public.consultants;
DROP POLICY IF EXISTS "Users can update own consultants" ON public.consultants;
DROP POLICY IF EXISTS "Users can delete own consultants" ON public.consultants;

CREATE POLICY "Users can view own consultants"
  ON public.consultants
  FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()::uuid));

CREATE POLICY "Users can insert consultants"
  ON public.consultants
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()::uuid));

CREATE POLICY "Users can update own consultants"
  ON public.consultants
  FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()::uuid))
  WITH CHECK (user_id = (select auth.uid()::uuid));

CREATE POLICY "Users can delete own consultants"
  ON public.consultants
  FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()::uuid));

-- email_threads
DROP POLICY IF EXISTS "Users can view own email threads" ON public.email_threads;
DROP POLICY IF EXISTS "Users can insert email threads" ON public.email_threads;
DROP POLICY IF EXISTS "Users can update email threads" ON public.email_threads;
DROP POLICY IF EXISTS "Users can delete email threads" ON public.email_threads;

CREATE POLICY "Users can view own email threads"
  ON public.email_threads
  FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()::uuid));

CREATE POLICY "Users can insert email threads"
  ON public.email_threads
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()::uuid));

CREATE POLICY "Users can update email threads"
  ON public.email_threads
  FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()::uuid))
  WITH CHECK (user_id = (select auth.uid()::uuid));

CREATE POLICY "Users can delete email threads"
  ON public.email_threads
  FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()::uuid));

-- error_reports
DROP POLICY IF EXISTS "Users can view own error reports" ON public.error_reports;
DROP POLICY IF EXISTS "Users can insert error reports" ON public.error_reports;

CREATE POLICY "Users can view own error reports"
  ON public.error_reports
  FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()::uuid));

CREATE POLICY "Users can insert error reports"
  ON public.error_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()::uuid));

-- google_drive_tokens
DROP POLICY IF EXISTS "Users can view own google drive tokens" ON public.google_drive_tokens;
DROP POLICY IF EXISTS "Users can insert google drive tokens" ON public.google_drive_tokens;
DROP POLICY IF EXISTS "Users can update own google drive tokens" ON public.google_drive_tokens;
DROP POLICY IF EXISTS "Users can delete own google drive tokens" ON public.google_drive_tokens;

CREATE POLICY "Users can view own google drive tokens"
  ON public.google_drive_tokens
  FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()::uuid));

CREATE POLICY "Users can insert google drive tokens"
  ON public.google_drive_tokens
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()::uuid));

CREATE POLICY "Users can update own google drive tokens"
  ON public.google_drive_tokens
  FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()::uuid))
  WITH CHECK (user_id = (select auth.uid()::uuid));

CREATE POLICY "Users can delete own google drive tokens"
  ON public.google_drive_tokens
  FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()::uuid));

-- interviews
DROP POLICY IF EXISTS "Users can view own interviews" ON public.interviews;
DROP POLICY IF EXISTS "Users can insert own interviews" ON public.interviews;
DROP POLICY IF EXISTS "Users can update own interviews" ON public.interviews;
DROP POLICY IF EXISTS "Users can delete own interviews" ON public.interviews;

CREATE POLICY "Users can view own interviews"
  ON public.interviews
  FOR SELECT
  TO authenticated
  USING (
    user_id = (select auth.uid()::uuid) 
    OR created_by = (select auth.uid()::uuid)
  );

CREATE POLICY "Users can insert own interviews"
  ON public.interviews
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()::uuid));

CREATE POLICY "Users can update own interviews"
  ON public.interviews
  FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()::uuid))
  WITH CHECK (user_id = (select auth.uid()::uuid));

CREATE POLICY "Users can delete own interviews"
  ON public.interviews
  FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()::uuid));

-- document_versions
DROP POLICY IF EXISTS "Users can view document versions" ON public.document_versions;
DROP POLICY IF EXISTS "Users can insert document versions" ON public.document_versions;
DROP POLICY IF EXISTS "Users can update document versions" ON public.document_versions;
DROP POLICY IF EXISTS "Users can delete document versions" ON public.document_versions;

CREATE POLICY "Users can view document versions"
  ON public.document_versions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.documents
      WHERE documents.id = document_versions.document_id
      AND documents.user_id = (select auth.uid()::uuid)
    )
  );

CREATE POLICY "Users can insert document versions"
  ON public.document_versions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.documents
      WHERE documents.id = document_versions.document_id
      AND documents.user_id = (select auth.uid()::uuid)
    )
  );

CREATE POLICY "Users can update document versions"
  ON public.document_versions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.documents
      WHERE documents.id = document_versions.document_id
      AND documents.user_id = (select auth.uid()::uuid)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.documents
      WHERE documents.id = document_versions.document_id
      AND documents.user_id = (select auth.uid()::uuid)
    )
  );

CREATE POLICY "Users can delete document versions"
  ON public.document_versions
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.documents
      WHERE documents.id = document_versions.document_id
      AND documents.user_id = (select auth.uid()::uuid)
    )
  );

-- user_sessions
DROP POLICY IF EXISTS "Users can select own sessions" ON public.user_sessions;
DROP POLICY IF EXISTS "Users can insert own sessions" ON public.user_sessions;
DROP POLICY IF EXISTS "Users can update own sessions" ON public.user_sessions;
DROP POLICY IF EXISTS "Users can delete own sessions" ON public.user_sessions;

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
-- 5. OPTIMIZE ADMIN POLICIES IN next_step_comments
-- =========================================================================

DROP POLICY IF EXISTS "Users can view next step comments on their requirements" ON public.next_step_comments;
DROP POLICY IF EXISTS "Users can add next step comments to their requirements" ON public.next_step_comments;
DROP POLICY IF EXISTS "Users can delete their own next step comments" ON public.next_step_comments;
DROP POLICY IF EXISTS "Admins can delete any next step comments" ON public.next_step_comments;

CREATE POLICY "Users can view next step comments on their requirements"
  ON public.next_step_comments
  FOR SELECT
  USING (
    requirement_id IN (
      SELECT id FROM public.requirements WHERE user_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = (select auth.uid()) AND role = 'admin'
    )
  );

CREATE POLICY "Users can add next step comments to their requirements"
  ON public.next_step_comments
  FOR INSERT
  WITH CHECK (
    user_id = (select auth.uid()::uuid)
    AND requirement_id IN (
      SELECT id FROM public.requirements WHERE user_id = (select auth.uid())
    )
  );

CREATE POLICY "Users can delete their own next step comments"
  ON public.next_step_comments
  FOR DELETE
  USING (user_id = (select auth.uid()::uuid));

CREATE POLICY "Admins can delete any next step comments"
  ON public.next_step_comments
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = (select auth.uid()) AND role = 'admin'
    )
  );

COMMIT;
