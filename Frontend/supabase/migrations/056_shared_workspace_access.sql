-- Migration: 056_shared_workspace_access.sql
-- Purpose:
-- 1) Convert CRM/Marketing/Tools modules into a shared workspace:
--    - all authenticated users can read/write all rows (no owner scoping).
-- 2) Keep admin visibility on users, and enable admin-grade auditing via activity_logs.
-- Notes:
-- - This is intentionally permissive to match "all users can do anything" requirement.
-- - Sensitive token tables (e.g., gmail_sync_tokens, google_drive_tokens) are NOT opened up here.

BEGIN;

-- ============================================================================
-- 1) USERS: all authenticated users can list all users
-- ============================================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_own" ON public.users;
CREATE POLICY "users_select_all_authenticated"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (true);

-- Keep existing update/insert policies (from prior migrations) as-is.

-- ============================================================================
-- 2) SHARED WORKSPACE TABLES (CRM / Marketing / Tools)
--    Make CRUD open to all authenticated users.
-- ============================================================================

-- ---------- requirements ----------
ALTER TABLE public.requirements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "requirements_select" ON public.requirements;
DROP POLICY IF EXISTS "requirements_insert" ON public.requirements;
DROP POLICY IF EXISTS "requirements_update" ON public.requirements;
DROP POLICY IF EXISTS "requirements_delete" ON public.requirements;

CREATE POLICY "requirements_select_all_authenticated"
  ON public.requirements
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "requirements_insert_all_authenticated"
  ON public.requirements
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "requirements_update_all_authenticated"
  ON public.requirements
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "requirements_delete_all_authenticated"
  ON public.requirements
  FOR DELETE
  TO authenticated
  USING (true);

-- ---------- consultants ----------
ALTER TABLE public.consultants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own consultants" ON public.consultants;
DROP POLICY IF EXISTS "Users can insert consultants" ON public.consultants;
DROP POLICY IF EXISTS "Users can update own consultants" ON public.consultants;
DROP POLICY IF EXISTS "Users can delete own consultants" ON public.consultants;

CREATE POLICY "consultants_select_all_authenticated"
  ON public.consultants
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "consultants_insert_all_authenticated"
  ON public.consultants
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "consultants_update_all_authenticated"
  ON public.consultants
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "consultants_delete_all_authenticated"
  ON public.consultants
  FOR DELETE
  TO authenticated
  USING (true);

-- ---------- interviews ----------
ALTER TABLE public.interviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own interviews" ON public.interviews;
DROP POLICY IF EXISTS "Users can insert own interviews" ON public.interviews;
DROP POLICY IF EXISTS "Users can update own interviews" ON public.interviews;
DROP POLICY IF EXISTS "Users can delete own interviews" ON public.interviews;

CREATE POLICY "interviews_select_all_authenticated"
  ON public.interviews
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "interviews_insert_all_authenticated"
  ON public.interviews
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "interviews_update_all_authenticated"
  ON public.interviews
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "interviews_delete_all_authenticated"
  ON public.interviews
  FOR DELETE
  TO authenticated
  USING (true);

-- ---------- next_step_comments ----------
ALTER TABLE public.next_step_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view next step comments on their requirements" ON public.next_step_comments;
DROP POLICY IF EXISTS "Users can add next step comments to their requirements" ON public.next_step_comments;
DROP POLICY IF EXISTS "Users can delete own next step comments" ON public.next_step_comments;
DROP POLICY IF EXISTS "Admins can delete any next step comment" ON public.next_step_comments;

CREATE POLICY "next_step_comments_select_all_authenticated"
  ON public.next_step_comments
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "next_step_comments_insert_all_authenticated"
  ON public.next_step_comments
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "next_step_comments_update_all_authenticated"
  ON public.next_step_comments
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "next_step_comments_delete_all_authenticated"
  ON public.next_step_comments
  FOR DELETE
  TO authenticated
  USING (true);

-- ---------- email_threads ----------
ALTER TABLE public.email_threads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own email threads" ON public.email_threads;
DROP POLICY IF EXISTS "Users can insert email threads" ON public.email_threads;
DROP POLICY IF EXISTS "Users can update email threads" ON public.email_threads;
DROP POLICY IF EXISTS "Users can delete email threads" ON public.email_threads;

CREATE POLICY "email_threads_select_all_authenticated"
  ON public.email_threads
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "email_threads_insert_all_authenticated"
  ON public.email_threads
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "email_threads_update_all_authenticated"
  ON public.email_threads
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "email_threads_delete_all_authenticated"
  ON public.email_threads
  FOR DELETE
  TO authenticated
  USING (true);

-- ---------- requirement_emails ----------
ALTER TABLE public.requirement_emails ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view requirement emails" ON public.requirement_emails;
DROP POLICY IF EXISTS "Users can insert requirement emails" ON public.requirement_emails;
DROP POLICY IF EXISTS "Users can update requirement emails" ON public.requirement_emails;
DROP POLICY IF EXISTS "Users can delete requirement emails" ON public.requirement_emails;

CREATE POLICY "requirement_emails_select_all_authenticated"
  ON public.requirement_emails
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "requirement_emails_insert_all_authenticated"
  ON public.requirement_emails
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "requirement_emails_update_all_authenticated"
  ON public.requirement_emails
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "requirement_emails_delete_all_authenticated"
  ON public.requirement_emails
  FOR DELETE
  TO authenticated
  USING (true);

-- ---------- bulk email campaign tables ----------
ALTER TABLE public.bulk_email_campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own campaigns" ON public.bulk_email_campaigns;
DROP POLICY IF EXISTS "Users can insert their own campaigns" ON public.bulk_email_campaigns;
DROP POLICY IF EXISTS "Users can update their own campaigns" ON public.bulk_email_campaigns;
DROP POLICY IF EXISTS "Users can delete their own campaigns" ON public.bulk_email_campaigns;

CREATE POLICY "bulk_email_campaigns_select_all_authenticated"
  ON public.bulk_email_campaigns
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "bulk_email_campaigns_insert_all_authenticated"
  ON public.bulk_email_campaigns
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "bulk_email_campaigns_update_all_authenticated"
  ON public.bulk_email_campaigns
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "bulk_email_campaigns_delete_all_authenticated"
  ON public.bulk_email_campaigns
  FOR DELETE
  TO authenticated
  USING (true);

ALTER TABLE public.campaign_recipients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view recipients for their campaigns" ON public.campaign_recipients;
DROP POLICY IF EXISTS "Users can insert recipients for their campaigns" ON public.campaign_recipients;
DROP POLICY IF EXISTS "Users can update recipients for their campaigns" ON public.campaign_recipients;
DROP POLICY IF EXISTS "Users can delete recipients for their campaigns" ON public.campaign_recipients;

CREATE POLICY "campaign_recipients_select_all_authenticated"
  ON public.campaign_recipients
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "campaign_recipients_insert_all_authenticated"
  ON public.campaign_recipients
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "campaign_recipients_update_all_authenticated"
  ON public.campaign_recipients
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "campaign_recipients_delete_all_authenticated"
  ON public.campaign_recipients
  FOR DELETE
  TO authenticated
  USING (true);

ALTER TABLE public.bulk_email_campaign_status ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_select_own_campaign_status" ON public.bulk_email_campaign_status;
DROP POLICY IF EXISTS "authenticated_insert_own_campaign_status" ON public.bulk_email_campaign_status;
DROP POLICY IF EXISTS "authenticated_update_own_campaign_status" ON public.bulk_email_campaign_status;
DROP POLICY IF EXISTS "authenticated_delete_own_campaign_status" ON public.bulk_email_campaign_status;

CREATE POLICY "bulk_email_campaign_status_select_all_authenticated"
  ON public.bulk_email_campaign_status
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "bulk_email_campaign_status_insert_all_authenticated"
  ON public.bulk_email_campaign_status
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "bulk_email_campaign_status_update_all_authenticated"
  ON public.bulk_email_campaign_status
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "bulk_email_campaign_status_delete_all_authenticated"
  ON public.bulk_email_campaign_status
  FOR DELETE
  TO authenticated
  USING (true);

-- ---------- documents / folders / shares / versions ----------
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "documents_select" ON public.documents;
DROP POLICY IF EXISTS "documents_insert" ON public.documents;
DROP POLICY IF EXISTS "documents_update" ON public.documents;
DROP POLICY IF EXISTS "documents_delete" ON public.documents;

CREATE POLICY "documents_select_all_authenticated"
  ON public.documents
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "documents_insert_all_authenticated"
  ON public.documents
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "documents_update_all_authenticated"
  ON public.documents
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "documents_delete_all_authenticated"
  ON public.documents
  FOR DELETE
  TO authenticated
  USING (true);

ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "folders_select_own" ON public.folders;
DROP POLICY IF EXISTS "folders_insert_own" ON public.folders;
DROP POLICY IF EXISTS "folders_update_own" ON public.folders;
DROP POLICY IF EXISTS "folders_delete_own" ON public.folders;

CREATE POLICY "folders_select_all_authenticated"
  ON public.folders
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "folders_insert_all_authenticated"
  ON public.folders
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "folders_update_all_authenticated"
  ON public.folders
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "folders_delete_all_authenticated"
  ON public.folders
  FOR DELETE
  TO authenticated
  USING (true);

ALTER TABLE public.folder_shares ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "folder_shares_select_owner" ON public.folder_shares;
DROP POLICY IF EXISTS "folder_shares_insert_owner" ON public.folder_shares;
DROP POLICY IF EXISTS "folder_shares_update_owner" ON public.folder_shares;
DROP POLICY IF EXISTS "folder_shares_delete_owner" ON public.folder_shares;
DROP POLICY IF EXISTS "folder_shares_select_recipient" ON public.folder_shares;

CREATE POLICY "folder_shares_select_all_authenticated"
  ON public.folder_shares
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "folder_shares_insert_all_authenticated"
  ON public.folder_shares
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "folder_shares_update_all_authenticated"
  ON public.folder_shares
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "folder_shares_delete_all_authenticated"
  ON public.folder_shares
  FOR DELETE
  TO authenticated
  USING (true);

ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view document versions" ON public.document_versions;
DROP POLICY IF EXISTS "Users can insert document versions" ON public.document_versions;
DROP POLICY IF EXISTS "Users can update document versions" ON public.document_versions;
DROP POLICY IF EXISTS "Users can delete document versions" ON public.document_versions;

CREATE POLICY "document_versions_select_all_authenticated"
  ON public.document_versions
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "document_versions_insert_all_authenticated"
  ON public.document_versions
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "document_versions_update_all_authenticated"
  ON public.document_versions
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "document_versions_delete_all_authenticated"
  ON public.document_versions
  FOR DELETE
  TO authenticated
  USING (true);

-- ============================================================================
-- 3) STORAGE BUCKET (documents): shared read/write for authenticated users
-- ============================================================================
DROP POLICY IF EXISTS "documents_bucket_select_own" ON storage.objects;
DROP POLICY IF EXISTS "documents_bucket_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "documents_bucket_update_own" ON storage.objects;
DROP POLICY IF EXISTS "documents_bucket_delete_own" ON storage.objects;

CREATE POLICY "documents_bucket_select_all_authenticated"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'documents');

CREATE POLICY "documents_bucket_insert_all_authenticated"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'documents');

CREATE POLICY "documents_bucket_update_all_authenticated"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'documents')
  WITH CHECK (bucket_id = 'documents');

CREATE POLICY "documents_bucket_delete_all_authenticated"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'documents');

-- ============================================================================
-- 4) AUDIT: allow admin to read all activity logs; allow authenticated inserts for own user_id
-- ============================================================================
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own activity logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Service role can insert activity logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Service role can update activity logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Service role can delete activity logs" ON public.activity_logs;

-- Users can view own logs; admins can view all
CREATE POLICY "activity_logs_select_own_or_admin"
  ON public.activity_logs
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()::uuid
    OR public.current_user_is_admin()
  );

-- Allow authenticated users to insert audit logs for themselves
CREATE POLICY "activity_logs_insert_own"
  ON public.activity_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid()::uuid);

-- Keep service role full control
CREATE POLICY "activity_logs_service_role_all"
  ON public.activity_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMIT;

