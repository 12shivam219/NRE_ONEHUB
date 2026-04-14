-- Migration: 060_fix_requirements_company_compat.sql
-- Purpose:
-- 1) Fix legacy SQL functions still referencing requirements.company
-- 2) Keep backward compatibility for RPC callers that still expect "company" in return shape
-- 3) Ensure outdated search trigger cannot reference dropped columns

BEGIN;

-- ---------------------------------------------------------------------------
-- Remove stale trigger/function if present (legacy versions referenced NEW.company)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS requirements_search_update_trigger ON public.requirements;
DROP FUNCTION IF EXISTS public.requirements_search_update();

-- ---------------------------------------------------------------------------
-- Recreate search_requirements using implementation_partner
-- Keep output column named "company" for compatibility with old clients.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_requirements(
  p_user_id UUID,
  p_search_term TEXT,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  company TEXT,
  description TEXT,
  status TEXT,
  rate NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE,
  relevance_score REAL
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id,
    r.title,
    r.implementation_partner::TEXT AS company,
    r.description,
    r.status::TEXT,
    r.rate,
    r.created_at,
    CASE
      WHEN r.title ILIKE (p_search_term || '%') THEN 1.0::REAL
      WHEN r.title ILIKE ('%' || p_search_term || '%') THEN 0.8::REAL
      WHEN r.implementation_partner ILIKE ('%' || p_search_term || '%') THEN 0.6::REAL
      WHEN r.description ILIKE ('%' || p_search_term || '%') THEN 0.4::REAL
      ELSE 0.2::REAL
    END AS relevance_score
  FROM public.requirements r
  WHERE r.user_id = p_user_id
    AND (
      r.title ILIKE ('%' || p_search_term || '%')
      OR r.implementation_partner ILIKE ('%' || p_search_term || '%')
      OR r.description ILIKE ('%' || p_search_term || '%')
    )
  ORDER BY relevance_score DESC, r.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- ---------------------------------------------------------------------------
-- Recreate get_requirements_paginated to avoid r.company references.
-- Keep return column named "company" for compatibility.
-- ---------------------------------------------------------------------------
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
    WHERE table_schema = 'public' AND table_name = 'requirements' AND column_name = 'deleted_at'
  ) INTO has_deleted_at;

  sql := 'SELECT r.id, r.user_id, r.title, r.status, r.implementation_partner AS company, r.created_at, r.updated_at FROM public.requirements r WHERE r.user_id = ' || quote_literal(p_user_id);
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

COMMIT;

