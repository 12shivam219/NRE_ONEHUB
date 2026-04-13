-- Migration: 041_add_branch_merges_rls_policies.sql
-- Purpose: Add missing RLS policies for branch_merges table
-- Issue: Table has RLS enabled but no policies defined, making it inaccessible

BEGIN;

-- =========================================================================
-- ADD RLS POLICIES FOR branch_merges TABLE
-- =========================================================================
-- Users should be able to manage merges for their own branches

-- Policy: Users can SELECT branch merges for their own branches
CREATE POLICY "Users can view their own branch merges"
  ON public.branch_merges
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.conversation_branches cb
      WHERE (cb.id = branch_merges.source_branch_id OR cb.id = branch_merges.target_branch_id)
      AND cb.user_id = auth.uid()
    )
  );

-- Policy: Users can INSERT branch merges for their own branches
CREATE POLICY "Users can create branch merges for their own branches"
  ON public.branch_merges
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.conversation_branches cb
      WHERE cb.id = source_branch_id AND cb.user_id = auth.uid()
    ) AND
    EXISTS (
      SELECT 1 FROM public.conversation_branches cb
      WHERE cb.id = target_branch_id AND cb.user_id = auth.uid()
    )
  );

-- Policy: Users can UPDATE their own branch merges
CREATE POLICY "Users can update their own branch merges"
  ON public.branch_merges
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Policy: Users can DELETE their own branch merges
CREATE POLICY "Users can delete their own branch merges"
  ON public.branch_merges
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Policy: Service role can perform all operations (for backend operations)
CREATE POLICY "Service role can manage branch merges"
  ON public.branch_merges
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMIT;
