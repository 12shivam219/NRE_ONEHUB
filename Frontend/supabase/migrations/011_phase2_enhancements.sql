-- Phase 2 Enhancement: Analytics, Exports, and Command Registry
-- Added tables and functions for streaming, analytics, exports, and custom commands

-- Analytics table for tracking AI assistant usage
CREATE TABLE IF NOT EXISTS chat_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL,
  message_count INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  total_duration_ms INTEGER DEFAULT 0,
  sentiment TEXT, -- 'positive', 'neutral', 'negative'
  top_topics TEXT[], -- JSON array of topics discussed
  actions_executed TEXT[], -- JSON array of actions taken
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT check_sentiment CHECK (sentiment IN ('positive', 'neutral', 'negative'))
);

CREATE INDEX IF NOT EXISTS idx_chat_analytics_user_id ON chat_analytics(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_analytics_created_at ON chat_analytics(created_at);

-- Conversation exports (for sharing/archiving)
CREATE TABLE IF NOT EXISTS conversation_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  format TEXT NOT NULL CHECK (format IN ('json', 'pdf', 'markdown')),
  file_path TEXT,
  is_shared BOOLEAN DEFAULT FALSE,
  share_token TEXT UNIQUE,
  share_expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_conversation_exports_user_id ON conversation_exports(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_exports_share_token ON conversation_exports(share_token);

-- Custom voice commands registry
CREATE TABLE IF NOT EXISTS custom_voice_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trigger_phrase TEXT NOT NULL,
  action_type TEXT NOT NULL,
  action_target TEXT,
  action_params JSONB,
  is_active BOOLEAN DEFAULT TRUE,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, trigger_phrase)
);

CREATE INDEX IF NOT EXISTS idx_custom_voice_commands_user_id ON custom_voice_commands(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_voice_commands_active ON custom_voice_commands(is_active);

-- Wake word settings per user
CREATE TABLE IF NOT EXISTS wake_word_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  wake_word TEXT DEFAULT 'hey assistant',
  is_enabled BOOLEAN DEFAULT TRUE,
  sensitivity FLOAT DEFAULT 0.5 CHECK (sensitivity >= 0.1 AND sensitivity <= 1.0),
  auto_listen_duration_ms INTEGER DEFAULT 5000,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_wake_word_settings_user_id ON wake_word_settings(user_id);

-- Streaming conversation metadata
CREATE TABLE IF NOT EXISTS streaming_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL,
  session_token TEXT UNIQUE,
  start_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  end_time TIMESTAMP WITH TIME ZONE,
  total_chunks INTEGER DEFAULT 0,
  total_response_time_ms INTEGER DEFAULT 0,
  is_completed BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_streaming_sessions_user_id ON streaming_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_streaming_sessions_token ON streaming_sessions(session_token);

-- Row Level Security Policies

-- Analytics RLS
ALTER TABLE chat_analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own analytics"
  ON chat_analytics FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own analytics"
  ON chat_analytics FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Exports RLS
ALTER TABLE conversation_exports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own exports"
  ON conversation_exports FOR SELECT
  USING (auth.uid() = user_id OR is_shared = TRUE);

CREATE POLICY "Users can create exports"
  ON conversation_exports FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own exports"
  ON conversation_exports FOR DELETE
  USING (auth.uid() = user_id);

-- Custom commands RLS
ALTER TABLE custom_voice_commands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their custom commands"
  ON custom_voice_commands FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Wake word settings RLS
ALTER TABLE wake_word_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their wake word settings"
  ON wake_word_settings FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Streaming sessions RLS
ALTER TABLE streaming_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their streaming sessions"
  ON streaming_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create streaming sessions"
  ON streaming_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);
