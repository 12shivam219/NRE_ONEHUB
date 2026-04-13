-- Migration: 011_add_requirements_end_client.sql
-- Purpose: Persist end client extracted from recruiter JDs

BEGIN;

ALTER TABLE IF EXISTS public.requirements
  ADD COLUMN IF NOT EXISTS end_client text;

COMMIT;
