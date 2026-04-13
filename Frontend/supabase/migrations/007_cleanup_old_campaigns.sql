-- Migration: schedule cleanup job for old campaign records using pg_cron

-- Note: This migration requires the pg_cron extension to be enabled in your Postgres instance.
-- Supabase (managed) may require enabling pg_cron via the dashboard or requesting it from support.

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Function to delete old campaigns older than 3 days
CREATE OR REPLACE FUNCTION public.cleanup_old_campaigns() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM public.bulk_email_campaign_status
  WHERE created_at < now() - INTERVAL '3 days';
END;
$$;

-- Schedule the cleanup to run daily at 03:00 UTC (adjust as needed)
SELECT cron.schedule('cleanup_old_campaigns_daily', '0 3 * * *', $$SELECT public.cleanup_old_campaigns();$$);

-- If pg_cron is unavailable in your environment, consider running a separate scheduled job (Cloud Function, GitHub Actions, or server-side cron) to run the same DELETE query.
