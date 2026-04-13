-- Migration: add user_sessions table

-- Creates the `user_sessions` table for tracking active user sessions
-- and allows admin/service-role code to revoke sessions when needed.

CREATE TABLE IF NOT EXISTS public.user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  revoked BOOLEAN NOT NULL DEFAULT false,
  last_activity TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  browser TEXT,
  os TEXT,
  device TEXT,
  ip_address TEXT,
  location TEXT
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON public.user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_revoked ON public.user_sessions(revoked);
CREATE INDEX IF NOT EXISTS idx_user_sessions_last_activity ON public.user_sessions(last_activity DESC);

-- Enable Row Level Security so client-side access can be restricted by policies
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

-- Basic RLS policies: allow users to manage their own sessions. Admin actions
-- (revoke via admin panel) should use a server/service role which bypasses RLS.
CREATE POLICY "Users can view their sessions"
  ON public.user_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their sessions"
  ON public.user_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their sessions"
  ON public.user_sessions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Optionally allow users to delete their own sessions
CREATE POLICY "Users can delete their sessions"
  ON public.user_sessions FOR DELETE
  USING (auth.uid() = user_id);
