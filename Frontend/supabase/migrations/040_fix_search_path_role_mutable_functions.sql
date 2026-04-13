-- Migration: 040_fix_search_path_role_mutable_functions.sql
-- Purpose: Fix "role mutable search_path" security issues in functions
-- Issue: Functions without SET search_path = public are vulnerable to search path manipulation attacks
-- Solution: Add SECURITY DEFINER and SET search_path = public to all affected functions

BEGIN;

-- =========================================================================
-- 1. FIX cleanup_expired_translations FUNCTION
-- =========================================================================
-- Issue: Function has no search_path configuration
-- Solution: Add SECURITY DEFINER and SET search_path = public

DROP FUNCTION IF EXISTS public.cleanup_expired_translations();

CREATE OR REPLACE FUNCTION public.cleanup_expired_translations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM translation_cache WHERE expires_at < NOW();
END;
$$;

-- =========================================================================
-- 2. FIX get_requirements_paginated FUNCTION
-- =========================================================================
-- Issue: Function has no SECURITY DEFINER or search_path configuration
-- Solution: Add SECURITY DEFINER and SET search_path = public

DROP FUNCTION IF EXISTS public.get_requirements_paginated(UUID, TEXT, INT, INT);

CREATE OR REPLACE FUNCTION public.get_requirements_paginated(
  p_user_id UUID,
  p_status TEXT DEFAULT NULL,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE(
  id UUID,
  user_id UUID,
  title TEXT,
  status TEXT,
  company TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sql TEXT;
  has_deleted_at BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='requirements' AND column_name='deleted_at'
  ) INTO has_deleted_at;

  sql := 'SELECT r.id, r.user_id, r.title, r.status, r.company, r.created_at, r.updated_at FROM public.requirements r WHERE r.user_id = ' || quote_literal(p_user_id);
  IF has_deleted_at THEN
    sql := sql || ' AND r.deleted_at IS NULL';
  END IF;
  IF p_status IS NOT NULL THEN
    sql := sql || ' AND r.status = ' || quote_literal(p_status);
  END IF;
  sql := sql || ' ORDER BY r.created_at DESC LIMIT ' || p_limit::TEXT || ' OFFSET ' || p_offset::TEXT;

  RETURN QUERY EXECUTE sql;
END;
$$;

-- =========================================================================
-- 3. FIX count_requirements FUNCTION
-- =========================================================================
-- Issue: Function has no SECURITY DEFINER or search_path configuration
-- Solution: Add SECURITY DEFINER and SET search_path = public

DROP FUNCTION IF EXISTS public.count_requirements(UUID);

CREATE OR REPLACE FUNCTION public.count_requirements(p_user_id UUID)
RETURNS INT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sql TEXT;
  res INT;
  has_deleted_at BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='requirements' AND column_name='deleted_at'
  ) INTO has_deleted_at;

  sql := 'SELECT COUNT(*)::INT FROM public.requirements WHERE user_id = ' || quote_literal(p_user_id);
  IF has_deleted_at THEN
    sql := sql || ' AND deleted_at IS NULL';
  END IF;

  EXECUTE sql INTO res;
  RETURN res;
END;
$$;

-- =========================================================================
-- 4. FIX get_users_by_ids FUNCTION
-- =========================================================================
-- Issue: Function in some environments missing SECURITY DEFINER or search_path configuration
-- Solution: Add SECURITY DEFINER and SET search_path = public

DROP FUNCTION IF EXISTS public.get_users_by_ids(UUID[]);

CREATE OR REPLACE FUNCTION public.get_users_by_ids(p_user_ids UUID[])
RETURNS TABLE(
  id UUID,
  full_name TEXT,
  email TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    users.id,
    COALESCE(NULLIF(users.full_name, ''), SPLIT_PART(users.email, '@', 1))::TEXT as full_name,
    users.email
  FROM users
  WHERE users.id = ANY(p_user_ids);
END;
$$;

COMMIT;
