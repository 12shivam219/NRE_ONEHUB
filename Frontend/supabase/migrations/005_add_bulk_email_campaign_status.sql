-- Migration: create bulk_email_campaign_status table

CREATE TABLE IF NOT EXISTS public.bulk_email_campaign_status (
  id text PRIMARY KEY,
  status text NOT NULL,
  total integer NOT NULL DEFAULT 0,
  sent integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  processed integer NOT NULL DEFAULT 0,
  progress integer NOT NULL DEFAULT 0,
  details jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);

-- Optional index for querying recent campaigns
CREATE INDEX IF NOT EXISTS idx_bulk_campaign_created_at ON public.bulk_email_campaign_status (created_at DESC);
