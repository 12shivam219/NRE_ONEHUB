-- Chat System Tables
-- Tables to support the AI assistant conversation feature

-- Messages table for storing chat history
CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Chat history table for logging analytics
CREATE TABLE IF NOT EXISTS chat_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_message TEXT NOT NULL,
  assistant_response TEXT NOT NULL,
  action_type TEXT,
  conversation_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_id 
  ON chat_messages(conversation_id);

CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id 
  ON chat_messages(user_id);

CREATE INDEX IF NOT EXISTS idx_chat_messages_timestamp 
  ON chat_messages(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_chat_history_user_id 
  ON chat_history(user_id);

CREATE INDEX IF NOT EXISTS idx_chat_history_created_at 
  ON chat_history(created_at DESC);

-- Row-level security policies
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_history ENABLE ROW LEVEL SECURITY;

-- Users can only see their own messages
CREATE POLICY "Users can view their own chat messages"
  ON chat_messages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own chat messages"
  ON chat_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can view their own chat history (admin can view all)
-- NOTE: DO NOT use user_metadata for security checks - it's editable by end users
-- This policy is intentionally simple and should be superseded by migration 039
CREATE POLICY "Users can view their own chat history"
  ON chat_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Insert chat history for current user"
  ON chat_history FOR INSERT
  WITH CHECK (true); -- Edge function inserts on behalf of users
