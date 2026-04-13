-- Migration: 022_ensure_end_client_column.sql
-- Purpose: Ensure end_client column exists in requirements table (fixing missing migration)

BEGIN;

ALTER TABLE IF EXISTS public.requirements
  ADD COLUMN IF NOT EXISTS end_client text;

COMMIT;
