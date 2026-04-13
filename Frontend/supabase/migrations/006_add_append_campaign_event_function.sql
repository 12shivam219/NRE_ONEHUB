-- Migration: atomic append function for campaign details and counters

-- Function: append_campaign_event(p_id text, p_event jsonb, p_sent int, p_failed int, p_processed int, p_progress int)

CREATE OR REPLACE FUNCTION public.append_campaign_event(
  p_id text,
  p_event jsonb,
  p_sent integer,
  p_failed integer,
  p_processed integer,
  p_progress integer
)
RETURNS TABLE(id text, status text, total integer, sent integer, failed integer, processed integer, progress integer, details jsonb, created_at timestamptz, started_at timestamptz, completed_at timestamptz) AS $$
DECLARE
  v_id text;
  v_status text;
  v_total integer;
  v_sent integer;
  v_failed integer;
  v_processed integer;
  v_progress integer;
  v_details jsonb;
  v_created_at timestamptz;
  v_started_at timestamptz;
  v_completed_at timestamptz;
BEGIN
  UPDATE public.bulk_email_campaign_status
  SET
    status = 'processing',
    sent = COALESCE(sent,0) + COALESCE(p_sent,0),
    failed = COALESCE(failed,0) + COALESCE(p_failed,0),
    processed = GREATEST(COALESCE(processed,0), COALESCE(p_processed,0)),
    progress = GREATEST(COALESCE(progress,0), COALESCE(p_progress,0)),
    details = COALESCE(details,'[]'::jsonb) || COALESCE(p_event, '[]'::jsonb),
    started_at = COALESCE(started_at, now())
  WHERE bulk_email_campaign_status.id = p_id
  RETURNING 
    bulk_email_campaign_status.id,
    bulk_email_campaign_status.status,
    bulk_email_campaign_status.total,
    bulk_email_campaign_status.sent,
    bulk_email_campaign_status.failed,
    bulk_email_campaign_status.processed,
    bulk_email_campaign_status.progress,
    bulk_email_campaign_status.details,
    bulk_email_campaign_status.created_at,
    bulk_email_campaign_status.started_at,
    bulk_email_campaign_status.completed_at
  INTO v_id, v_status, v_total, v_sent, v_failed, v_processed, v_progress, v_details, v_created_at, v_started_at, v_completed_at;

  IF NOT FOUND THEN
    -- If record doesn't exist, create it
    INSERT INTO public.bulk_email_campaign_status(id, status, total, sent, failed, processed, progress, details, created_at, started_at)
    VALUES (p_id, 'processing', 0, COALESCE(p_sent,0), COALESCE(p_failed,0), COALESCE(p_processed,0), COALESCE(p_progress,0),
            COALESCE(p_event, '[]'::jsonb), now(), now())
    RETURNING 
      bulk_email_campaign_status.id,
      bulk_email_campaign_status.status,
      bulk_email_campaign_status.total,
      bulk_email_campaign_status.sent,
      bulk_email_campaign_status.failed,
      bulk_email_campaign_status.processed,
      bulk_email_campaign_status.progress,
      bulk_email_campaign_status.details,
      bulk_email_campaign_status.created_at,
      bulk_email_campaign_status.started_at,
      bulk_email_campaign_status.completed_at
    INTO v_id, v_status, v_total, v_sent, v_failed, v_processed, v_progress, v_details, v_created_at, v_started_at, v_completed_at;
  END IF;

  id := v_id;
  status := v_status;
  total := v_total;
  sent := v_sent;
  failed := v_failed;
  processed := v_processed;
  progress := v_progress;
  details := v_details;
  created_at := v_created_at;
  started_at := v_started_at;
  completed_at := v_completed_at;
  
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to anon if needed (be cautious) -- keep restricted to service role in production
-- GRANT EXECUTE ON FUNCTION public.append_campaign_event(text, jsonb, integer, integer, integer, integer) TO anon;
