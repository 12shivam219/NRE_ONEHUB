-- Migration: 024_harden_campaign_status_rls.sql
-- Purpose: Strengthen RLS policies on bulk_email_campaign_status table
-- This fixes the critical security issue where anonymous users could read all campaign data
-- Changes:
--   1. Add user_id column to track campaign ownership
--   2. Replace permissive policies with strict user-based restrictions
--   3. Block ALL access for anonymous users
--   4. Allow service_role (backend) for operations
--   5. Restrict authenticated users to their own campaigns only

BEGIN;

-- =========================================================================
-- 1. ADD USER_ID COLUMN IF NOT EXISTS
-- =========================================================================

ALTER TABLE public.bulk_email_campaign_status 
ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create index for user-based queries
CREATE INDEX IF NOT EXISTS idx_bulk_campaign_user_id 
  ON public.bulk_email_campaign_status(user_id);

-- =========================================================================
-- 2. ENABLE RLS IF NOT ALREADY ENABLED
-- =========================================================================

ALTER TABLE public.bulk_email_campaign_status ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- 3. DROP EXISTING PERMISSIVE POLICIES (Security Issue)
-- =========================================================================
-- The previous migration allowed anonymous users to read ALL campaigns
-- These policies must be removed

DROP POLICY IF EXISTS "Allow authenticated users to read campaign status" 
  ON public.bulk_email_campaign_status;

DROP POLICY IF EXISTS "Allow service role to insert campaign status" 
  ON public.bulk_email_campaign_status;

DROP POLICY IF EXISTS "Allow service role to update campaign status" 
  ON public.bulk_email_campaign_status;

DROP POLICY IF EXISTS "Allow anon to read campaign status" 
  ON public.bulk_email_campaign_status;

-- =========================================================================
-- 4. IMPLEMENT STRICT RLS POLICIES
-- =========================================================================

-- DENY: Anon users cannot access campaign status at all
CREATE POLICY "Deny anon users from campaign status"
  ON public.bulk_email_campaign_status
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

-- ALLOW: Service role (backend server) can do anything
-- (Used for email server operations, migrations, etc.)
CREATE POLICY "Service role can manage campaign status"
  ON public.bulk_email_campaign_status
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ALLOW: Authenticated users can READ only their own campaigns
CREATE POLICY "Authenticated users can read own campaign status"
  ON public.bulk_email_campaign_status
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()::uuid
    OR
    -- Fallback: Allow access if campaign belongs to a campaign they created
    EXISTS (
      SELECT 1 FROM public.bulk_email_campaigns
      WHERE bulk_email_campaigns.id::text = bulk_email_campaign_status.id
      AND bulk_email_campaigns.user_id = auth.uid()::uuid
    )
  );

-- ALLOW: Authenticated users can INSERT campaigns (backend will set user_id)
CREATE POLICY "Authenticated users can create campaigns"
  ON public.bulk_email_campaign_status
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()::uuid
    OR user_id IS NULL  -- Allow insert without user_id, will be set by trigger
  );

-- ALLOW: Authenticated users can UPDATE their own campaigns
CREATE POLICY "Authenticated users can update own campaigns"
  ON public.bulk_email_campaign_status
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid()::uuid)
  WITH CHECK (user_id = auth.uid()::uuid);

-- ALLOW: Authenticated users can DELETE their own campaigns
CREATE POLICY "Authenticated users can delete own campaigns"
  ON public.bulk_email_campaign_status
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid()::uuid);

-- =========================================================================
-- 5. CREATE TRIGGER TO AUTO-SET USER_ID ON INSERT
-- =========================================================================
-- This ensures user_id is populated from auth context when creating campaigns

CREATE OR REPLACE FUNCTION set_campaign_user_id()
RETURNS TRIGGER AS $$
BEGIN
  -- If user_id is not set, use current authenticated user
  IF NEW.user_id IS NULL AND auth.uid() IS NOT NULL THEN
    NEW.user_id := auth.uid()::uuid;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS set_campaign_user_id_trigger 
  ON public.bulk_email_campaign_status;

CREATE TRIGGER set_campaign_user_id_trigger
BEFORE INSERT ON public.bulk_email_campaign_status
FOR EACH ROW
EXECUTE FUNCTION set_campaign_user_id();

-- =========================================================================
-- 6. UPDATE BULK_EMAIL_CAMPAIGNS POLICIES SIMILARLY
-- =========================================================================
-- Ensure the parent table has consistent RLS

DROP POLICY IF EXISTS "Allow authenticated users to read campaign status" 
  ON public.bulk_email_campaigns;

DROP POLICY IF EXISTS "Users can view own campaigns" 
  ON public.bulk_email_campaigns;

DROP POLICY IF EXISTS "Users can insert own campaigns" 
  ON public.bulk_email_campaigns;

DROP POLICY IF EXISTS "Users can update own campaigns" 
  ON public.bulk_email_campaigns;

DROP POLICY IF EXISTS "Users can delete own campaigns" 
  ON public.bulk_email_campaigns;

-- DENY: Anon users cannot access campaigns
CREATE POLICY "Deny anon users from campaigns"
  ON public.bulk_email_campaigns
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

-- ALLOW: Authenticated users can read their own campaigns
CREATE POLICY "Authenticated users can read own campaigns"
  ON public.bulk_email_campaigns
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid()::uuid);

-- ALLOW: Authenticated users can insert campaigns
CREATE POLICY "Authenticated users can create campaigns"
  ON public.bulk_email_campaigns
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid()::uuid OR user_id IS NULL);

-- ALLOW: Authenticated users can update their own campaigns
CREATE POLICY "Authenticated users can update own campaigns"
  ON public.bulk_email_campaigns
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid()::uuid)
  WITH CHECK (user_id = auth.uid()::uuid);

-- ALLOW: Authenticated users can delete their own campaigns
CREATE POLICY "Authenticated users can delete own campaigns"
  ON public.bulk_email_campaigns
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid()::uuid);

-- ALLOW: Service role can do anything
CREATE POLICY "Service role can manage campaigns"
  ON public.bulk_email_campaigns
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =========================================================================
-- 7. VERIFY POLICIES
-- =========================================================================
-- Run these queries to verify policies are correctly applied:
--
-- SELECT * FROM pg_policies 
-- WHERE tablename IN ('bulk_email_campaign_status', 'bulk_email_campaigns')
-- ORDER BY tablename, policyname;
--
-- Expected output should show:
-- - "Deny anon users from..." for both tables
-- - Service role allowing all operations
-- - Authenticated users limited to their own records

-- =========================================================================
-- 8. TESTING (in separate transaction)
-- =========================================================================
-- As anonymous user: SELECT * FROM bulk_email_campaign_status -> returns 0 rows
-- As authenticated user: SELECT * FROM bulk_email_campaign_status -> returns only own campaigns
-- As service_role: SELECT * FROM bulk_email_campaign_status -> returns all rows

COMMIT;
