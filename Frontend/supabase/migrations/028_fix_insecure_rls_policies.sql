-- Migration: 028_fix_insecure_rls_policies.sql
-- Purpose: Fix insecure RLS policies that allow unrestricted access (always true conditions)
-- Issues Fixed:
--   - rate_limits: Multiple policies with unrestricted access
--   - login_history: Multiple policies with unrestricted access
--   - jd_parsing_cache: INSERT policy with unrestricted access
--   - interviews: Multiple policies with unrestricted access

BEGIN;

-- =========================================================================
-- 1. FIX RATE_LIMITS TABLE RLS POLICIES
-- =========================================================================
-- rate_limits should be service_role only (backend rate limiting)

DROP POLICY IF EXISTS "allow_rate_limits" ON public.rate_limits;
DROP POLICY IF EXISTS "Allow update rate_limits" ON public.rate_limits;
DROP POLICY IF EXISTS "Allow insert rate_limits" ON public.rate_limits;
DROP POLICY IF EXISTS "Allow delete rate_limits" ON public.rate_limits;
DROP POLICY IF EXISTS "Allow select rate_limits" ON public.rate_limits;

-- Enable RLS
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Policy: Service role only can SELECT
CREATE POLICY "Service role can select rate limits"
  ON public.rate_limits
  FOR SELECT
  TO service_role
  USING (true);

-- Policy: Service role only can INSERT
CREATE POLICY "Service role can insert rate limits"
  ON public.rate_limits
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Policy: Service role only can UPDATE
CREATE POLICY "Service role can update rate limits"
  ON public.rate_limits
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy: Service role only can DELETE
CREATE POLICY "Service role can delete rate limits"
  ON public.rate_limits
  FOR DELETE
  TO service_role
  USING (true);

-- =========================================================================
-- 2. FIX LOGIN_HISTORY TABLE RLS POLICIES
-- =========================================================================
-- login_history should restrict authenticated users to their own records

DROP POLICY IF EXISTS "Allow update login_history" ON public.login_history;
DROP POLICY IF EXISTS "Allow login history insert" ON public.login_history;
DROP POLICY IF EXISTS "Allow insert login_history" ON public.login_history;
DROP POLICY IF EXISTS "Allow delete login_history" ON public.login_history;
DROP POLICY IF EXISTS "Allow select login_history" ON public.login_history;

-- Enable RLS
ALTER TABLE public.login_history ENABLE ROW LEVEL SECURITY;

-- Policy: Users can SELECT their own login history
CREATE POLICY "Users can view own login history"
  ON public.login_history
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid()::uuid);

-- Policy: Service role can INSERT login records
CREATE POLICY "Service role can insert login history"
  ON public.login_history
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Policy: Service role only can UPDATE (for cleanup/maintenance)
CREATE POLICY "Service role can update login history"
  ON public.login_history
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy: Service role only can DELETE (for cleanup)
CREATE POLICY "Service role can delete login history"
  ON public.login_history
  FOR DELETE
  TO service_role
  USING (true);

-- =========================================================================
-- 3. FIX JD_PARSING_CACHE TABLE RLS POLICIES
-- =========================================================================
-- jd_parsing_cache is a system cache, should be service_role only

DROP POLICY IF EXISTS "Allow authenticated users to insert cache" ON public.jd_parsing_cache;
DROP POLICY IF EXISTS "Allow select jd_parsing_cache" ON public.jd_parsing_cache;
DROP POLICY IF EXISTS "Allow update jd_parsing_cache" ON public.jd_parsing_cache;
DROP POLICY IF EXISTS "Allow insert jd_parsing_cache" ON public.jd_parsing_cache;
DROP POLICY IF EXISTS "Allow delete jd_parsing_cache" ON public.jd_parsing_cache;

-- Enable RLS
ALTER TABLE public.jd_parsing_cache ENABLE ROW LEVEL SECURITY;

-- Policy: Service role can SELECT cache entries
CREATE POLICY "Service role can select jd parsing cache"
  ON public.jd_parsing_cache
  FOR SELECT
  TO service_role
  USING (true);

-- Policy: Service role can INSERT cache entries
CREATE POLICY "Service role can insert jd parsing cache"
  ON public.jd_parsing_cache
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Policy: Service role can UPDATE cache entries
CREATE POLICY "Service role can update jd parsing cache"
  ON public.jd_parsing_cache
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy: Service role can DELETE cache entries
CREATE POLICY "Service role can delete jd parsing cache"
  ON public.jd_parsing_cache
  FOR DELETE
  TO service_role
  USING (true);

-- =========================================================================
-- 4. FIX INTERVIEWS TABLE RLS POLICIES
-- =========================================================================
-- interviews should restrict users to their own records or records where they're involved

DROP POLICY IF EXISTS "Allow update interviews" ON public.interviews;
DROP POLICY IF EXISTS "Allow insert interviews" ON public.interviews;
DROP POLICY IF EXISTS "Allow delete interviews" ON public.interviews;
DROP POLICY IF EXISTS "Allow select interviews" ON public.interviews;

-- Enable RLS
ALTER TABLE public.interviews ENABLE ROW LEVEL SECURITY;

-- Policy: Users can SELECT interviews they created or are assigned to
CREATE POLICY "Users can view own interviews"
  ON public.interviews
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()::uuid 
    OR created_by = auth.uid()::uuid
  );

-- Policy: Users can INSERT interviews (creates their own)
CREATE POLICY "Users can insert own interviews"
  ON public.interviews
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid()::uuid);

-- Policy: Users can UPDATE their own interviews
CREATE POLICY "Users can update own interviews"
  ON public.interviews
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid()::uuid)
  WITH CHECK (user_id = auth.uid()::uuid);

-- Policy: Users can DELETE their own interviews
CREATE POLICY "Users can delete own interviews"
  ON public.interviews
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid()::uuid);

-- Additional policies for service role (backend operations)
CREATE POLICY "Service role can select all interviews"
  ON public.interviews
  FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "Service role can insert interviews"
  ON public.interviews
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update interviews"
  ON public.interviews
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can delete interviews"
  ON public.interviews
  FOR DELETE
  TO service_role
  USING (true);

COMMIT;
