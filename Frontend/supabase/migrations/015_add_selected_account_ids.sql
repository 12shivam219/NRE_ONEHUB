-- Migration: Add selected_account_ids column to bulk_email_campaigns

-- Add the column to store which email accounts were selected for the campaign
ALTER TABLE IF EXISTS public.bulk_email_campaigns
ADD COLUMN selected_account_ids text[] DEFAULT NULL;

-- Create an index for faster filtering by accounts
CREATE INDEX IF NOT EXISTS idx_bulk_campaigns_account_ids ON public.bulk_email_campaigns USING GIN (selected_account_ids);

-- Add comment for documentation
COMMENT ON COLUMN public.bulk_email_campaigns.selected_account_ids IS 'Array of email account IDs selected for sending this campaign';
