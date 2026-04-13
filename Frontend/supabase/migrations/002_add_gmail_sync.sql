-- Database migrations for Gmail sync and requirement email tracking
-- Run these SQL queries in your Supabase dashboard

-- Table 1: gmail_sync_tokens
-- Stores Gmail API tokens securely for each user
CREATE TABLE IF NOT EXISTS gmail_sync_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL, -- Encrypted in application
  refresh_token TEXT NOT NULL, -- Encrypted in application
  token_expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  gmail_email TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  last_sync_at TIMESTAMP WITH TIME ZONE,
  last_sync_message_id TEXT, -- Track last synced email to avoid duplicates
  sync_frequency_minutes INTEGER DEFAULT 15, -- How often to sync (5, 10, 15, 30, 60)
  auto_link_confidence_level TEXT DEFAULT 'medium', -- high (95%+), medium (70%+), low (all)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_gmail_tokens_user_id ON gmail_sync_tokens(user_id);
CREATE INDEX idx_gmail_tokens_active ON gmail_sync_tokens(is_active);

-- Table 2: requirement_emails
-- Tracks all emails sent for each requirement (from Loster or Gmail)
CREATE TABLE IF NOT EXISTS requirement_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_id UUID NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  consultant_id UUID REFERENCES consultants(id) ON DELETE SET NULL, -- Link to consultant if matched
  sent_via TEXT DEFAULT 'loster_app', -- 'loster_app', 'gmail_synced'
  subject TEXT,
  body_preview TEXT, -- First 500 chars of email body
  message_id TEXT UNIQUE, -- Gmail message ID for tracking
  sent_date TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT DEFAULT 'sent', -- 'sent', 'failed', 'pending', 'bounced'
  error_message TEXT,
  match_confidence INTEGER DEFAULT 100, -- 0-100, confidence of requirement match
  needs_user_confirmation BOOLEAN DEFAULT false, -- True if low confidence match
  notes TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_req_emails_requirement_id ON requirement_emails(requirement_id);
CREATE INDEX idx_req_emails_status ON requirement_emails(status);
CREATE INDEX idx_req_emails_sent_date ON requirement_emails(sent_date DESC);
CREATE INDEX idx_req_emails_message_id ON requirement_emails(message_id);
CREATE INDEX idx_req_emails_consultant_id ON requirement_emails(consultant_id);

-- Table 3: email_sync_logs
-- Audit trail for Gmail sync operations
CREATE TABLE IF NOT EXISTS email_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sync_started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  sync_completed_at TIMESTAMP WITH TIME ZONE,
  emails_fetched INTEGER DEFAULT 0,
  emails_processed INTEGER DEFAULT 0,
  emails_matched INTEGER DEFAULT 0,
  emails_created INTEGER DEFAULT 0,
  status TEXT DEFAULT 'in_progress', -- 'in_progress', 'completed', 'failed'
  error_message TEXT,
  details JSONB
);

CREATE INDEX idx_sync_logs_user_id ON email_sync_logs(user_id);
CREATE INDEX idx_sync_logs_status ON email_sync_logs(status);

-- Table 4: email_matching_rules
-- User-defined rules for matching emails to requirements
CREATE TABLE IF NOT EXISTS email_matching_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requirement_id UUID NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL, -- Keywords to match in email subject/body
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_matching_rules_user_id ON email_matching_rules(user_id);
CREATE INDEX idx_matching_rules_requirement_id ON email_matching_rules(requirement_id);

-- Enable RLS (Row Level Security)
ALTER TABLE gmail_sync_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE requirement_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_matching_rules ENABLE ROW LEVEL SECURITY;

-- RLS Policies for gmail_sync_tokens
CREATE POLICY "Users can view their own Gmail tokens"
  ON gmail_sync_tokens FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own Gmail tokens"
  ON gmail_sync_tokens FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own Gmail tokens"
  ON gmail_sync_tokens FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own Gmail tokens"
  ON gmail_sync_tokens FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for requirement_emails
CREATE POLICY "Users can view emails for their requirements"
  ON requirement_emails FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM requirements
      WHERE requirements.id = requirement_emails.requirement_id
      AND requirements.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert emails for their requirements"
  ON requirement_emails FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM requirements
      WHERE requirements.id = requirement_emails.requirement_id
      AND requirements.user_id = auth.uid()
    ) AND created_by = auth.uid()
  );

CREATE POLICY "Users can update emails for their requirements"
  ON requirement_emails FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM requirements
      WHERE requirements.id = requirement_emails.requirement_id
      AND requirements.user_id = auth.uid()
    )
  );

-- RLS Policies for email_sync_logs
CREATE POLICY "Users can view their own sync logs"
  ON email_sync_logs FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policies for email_matching_rules
CREATE POLICY "Users can manage their own matching rules"
  ON email_matching_rules FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create matching rules"
  ON email_matching_rules FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their matching rules"
  ON email_matching_rules FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their matching rules"
  ON email_matching_rules FOR DELETE
  USING (auth.uid() = user_id);
