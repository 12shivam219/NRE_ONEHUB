-- Migration: Add account_id column to campaign_recipients for recipient-specific account assignment

-- Add column to track which email account should send to this recipient
ALTER TABLE IF EXISTS public.campaign_recipients
ADD COLUMN account_id text DEFAULT NULL;

-- Add index for faster queries by account
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_account_id ON public.campaign_recipients (account_id);

-- Add comment for documentation
COMMENT ON COLUMN public.campaign_recipients.account_id IS 'ID of the email account that will send emails to this recipient (if NULL, use rotation or first available)';
