-- Migration: 013_fix_campaign_recipients_rls.sql
-- Purpose: Fix RLS policy violations on campaign_recipients table
-- This allows users to insert campaign recipients for their own campaigns

BEGIN;

-- =========================================================================
-- 1. DISABLE RLS TEMPORARILY IF NEEDED (check current policy)
-- =========================================================================

-- Get campaign ID and user ID from bulk_email_campaigns
-- then allow INSERT if user_id matches the campaign creator

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can view own campaign recipients" ON public.campaign_recipients;
DROP POLICY IF EXISTS "Users can insert own campaign recipients" ON public.campaign_recipients;
DROP POLICY IF EXISTS "Users can update own campaign recipients" ON public.campaign_recipients;
DROP POLICY IF EXISTS "Users can delete own campaign recipients" ON public.campaign_recipients;

-- =========================================================================
-- 2. CREATE PROPER RLS POLICIES FOR campaign_recipients
-- =========================================================================

-- Enable RLS on campaign_recipients if not already enabled
ALTER TABLE public.campaign_recipients ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view recipients of campaigns they created
CREATE POLICY "Users can view own campaign recipients"
  ON public.campaign_recipients
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.bulk_email_campaigns
      WHERE bulk_email_campaigns.id = campaign_recipients.campaign_id
      AND bulk_email_campaigns.user_id = auth.uid()
    )
  );

-- Policy: Users can insert recipients for campaigns they created
CREATE POLICY "Users can insert own campaign recipients"
  ON public.campaign_recipients
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.bulk_email_campaigns
      WHERE bulk_email_campaigns.id = campaign_recipients.campaign_id
      AND bulk_email_campaigns.user_id = auth.uid()
    )
  );

-- Policy: Users can update recipients of campaigns they created
CREATE POLICY "Users can update own campaign recipients"
  ON public.campaign_recipients
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.bulk_email_campaigns
      WHERE bulk_email_campaigns.id = campaign_recipients.campaign_id
      AND bulk_email_campaigns.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.bulk_email_campaigns
      WHERE bulk_email_campaigns.id = campaign_recipients.campaign_id
      AND bulk_email_campaigns.user_id = auth.uid()
    )
  );

-- Policy: Users can delete recipients of campaigns they created
CREATE POLICY "Users can delete own campaign recipients"
  ON public.campaign_recipients
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.bulk_email_campaigns
      WHERE bulk_email_campaigns.id = campaign_recipients.campaign_id
      AND bulk_email_campaigns.user_id = auth.uid()
    )
  );

-- =========================================================================
-- 3. ALSO ENSURE bulk_email_campaigns HAS PROPER RLS
-- =========================================================================

DROP POLICY IF EXISTS "Users can view own campaigns" ON public.bulk_email_campaigns;
DROP POLICY IF EXISTS "Users can insert own campaigns" ON public.bulk_email_campaigns;
DROP POLICY IF EXISTS "Users can update own campaigns" ON public.bulk_email_campaigns;
DROP POLICY IF EXISTS "Users can delete own campaigns" ON public.bulk_email_campaigns;

ALTER TABLE public.bulk_email_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own campaigns"
  ON public.bulk_email_campaigns
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own campaigns"
  ON public.bulk_email_campaigns
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own campaigns"
  ON public.bulk_email_campaigns
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own campaigns"
  ON public.bulk_email_campaigns
  FOR DELETE
  USING (user_id = auth.uid());

-- =========================================================================
-- 4. CREATE INDEXES FOR BETTER PERFORMANCE
-- =========================================================================

CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign_id 
  ON public.campaign_recipients(campaign_id);

CREATE INDEX IF NOT EXISTS idx_campaign_recipients_status 
  ON public.campaign_recipients(status);

CREATE INDEX IF NOT EXISTS idx_bulk_campaigns_user_id 
  ON public.bulk_email_campaigns(user_id);

CREATE INDEX IF NOT EXISTS idx_bulk_campaigns_requirement_id 
  ON public.bulk_email_campaigns(requirement_id);

COMMIT;
