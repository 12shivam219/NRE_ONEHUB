-- Migration: 014_fix_campaign_status_rls.sql
-- Purpose: Add RLS policies to bulk_email_campaign_status table
-- This allows authenticated users to read and write campaign status records

BEGIN;

-- Enable RLS on the table
ALTER TABLE public.bulk_email_campaign_status ENABLE ROW LEVEL SECURITY;

-- Policy: Allow service role (backend) to do anything (bypasses RLS)
-- This is implicit for service_role, but being explicit for clarity

-- Policy: Allow authenticated users to READ their own campaign status
-- (campaign created by them, stored with their user context)
CREATE POLICY "Allow authenticated users to read campaign status"
  ON public.bulk_email_campaign_status
  FOR SELECT
  TO authenticated
  USING (true);  -- Allow all reads for now (campaigns don't have user_id field, so can't restrict by user)

-- Policy: Allow service role to INSERT campaign status
-- (Note: service_role bypasses RLS by default, but being explicit)
CREATE POLICY "Allow service role to insert campaign status"
  ON public.bulk_email_campaign_status
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Policy: Allow service role to UPDATE campaign status
CREATE POLICY "Allow service role to update campaign status"
  ON public.bulk_email_campaign_status
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Also allow anon role to read (for non-authenticated scenarios if needed)
CREATE POLICY "Allow anon to read campaign status"
  ON public.bulk_email_campaign_status
  FOR SELECT
  TO anon
  USING (true);

COMMIT;
