-- Migration: 039_fix_chat_history_user_metadata_rls.sql
-- Purpose: Fix insecure RLS policy on chat_history table that references user_metadata
-- Issue: user_metadata is editable by end users and should never be used in security contexts
-- Solution: Replace user_metadata check with a proper role check using profiles table

BEGIN;

-- Drop the insecure policy that uses user_metadata
DROP POLICY IF EXISTS "Users can view their own chat history" ON public.chat_history;

-- Ensure we have a function to safely check if user is admin
-- This uses the immutable auth.uid() and checks the users table
CREATE OR REPLACE FUNCTION is_user_admin(user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role = 'admin' FROM public.users WHERE id = user_id LIMIT 1),
    false
  );
$$;

-- Create the corrected policy without user_metadata
-- Users can view their own chat history, or admins can view all
CREATE POLICY "Users can view their own chat history (secure)"
  ON public.chat_history
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id OR
    is_user_admin(auth.uid())
  );

-- Also drop the INSERT policy and recreate it with proper checks
DROP POLICY IF EXISTS "Insert chat history for current user" ON public.chat_history;

-- Only allow authenticated users to insert their own records or service_role for system operations
CREATE POLICY "Insert chat history for current user (secure)"
  ON public.chat_history
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id OR
    auth.uid() IS NULL -- Allow NULL for system-triggered inserts via Edge Functions
  );

COMMIT;
