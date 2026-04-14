-- =========================================================================
-- Migration 058: Restrict Interview Deletion to Admins Only
-- =========================================================================
-- Purpose: Fix security vulnerability where ANY authenticated user could 
--          delete ANY interview. Only admins should be able to delete interviews.
-- 
-- Issue: Migration 056 set interviews DELETE policy to USING (true) which 
--        allowed all authenticated users to delete all interviews.
--
-- Fix: Update the DELETE policy to only allow admins to delete interviews.
-- =========================================================================

BEGIN;

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "interviews_delete_all_authenticated" ON public.interviews;

-- Create new policy: Only admins can delete interviews
CREATE POLICY "interviews_delete_admin_only"
  ON public.interviews
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users admin_check
      WHERE admin_check.id = (select auth.uid())
      AND admin_check.role = 'admin'
    )
  );

-- Verify the policy is in place
-- SELECT * FROM pg_policies WHERE tablename = 'interviews' ORDER BY policyname;

COMMIT;
