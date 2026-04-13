-- Migration: 030_fix_immutable_to_text_search_path.sql
-- Purpose: Fix the immutable_to_text function that has role mutable search_path
-- The warning occurs because SECURITY DEFINER allows role-dependent search_path
-- Solution: Create function without SECURITY DEFINER so search_path is truly immutable

BEGIN;

-- =========================================================================
-- DROP AND RECREATE immutable_to_text WITHOUT SECURITY DEFINER
-- =========================================================================
-- Remove SECURITY DEFINER to eliminate role-mutable search_path warning
-- This function is simple enough that it doesn't need elevated privileges

DROP FUNCTION IF EXISTS public.immutable_to_text(text) CASCADE;

CREATE OR REPLACE FUNCTION public.immutable_to_text(p_value text)
RETURNS text
IMMUTABLE
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN p_value::text;
END;
$$;

-- Make sure the function is accessible
GRANT EXECUTE ON FUNCTION public.immutable_to_text(text) TO authenticated, anon, service_role;

COMMIT;
