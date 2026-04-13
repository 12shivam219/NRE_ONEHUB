-- Migration: Add composite index for fast email history queries
-- Optimizes the query: SELECT * FROM requirement_emails WHERE requirement_id = X ORDER BY sent_date DESC

CREATE INDEX IF NOT EXISTS idx_req_emails_requirement_sent 
  ON requirement_emails(requirement_id, sent_date DESC);

-- Optional: Add covering index to include status for filtering
CREATE INDEX IF NOT EXISTS idx_req_emails_requirement_sent_status
  ON requirement_emails(requirement_id, sent_date DESC, status);
