-- Migration: add normalized integer column for interview rounds
-- Adds `round_index` to the `interviews` table, backfills values derived
-- from existing textual `round` values (e.g. '1st Round', '2nd Round'),
-- and creates an index for efficient querying by requirement + round.

BEGIN;

-- 1) Add the new column with a sensible default so existing rows are valid
ALTER TABLE IF EXISTS public.interviews
ADD COLUMN IF NOT EXISTS round_index integer NOT NULL DEFAULT 1;

-- 2) Backfill round_index from textual `round` when possible
-- Extract any digits from the `round` string and use that as the index.
-- Examples: '1st Round' -> 1, 'Round 2' -> 2, 'Final Round' -> keeps default 1
UPDATE public.interviews
SET round_index = CASE
  WHEN round IS NULL OR trim(round) = '' THEN 1
  WHEN round ~ '[0-9]+' THEN (regexp_replace(round, '\D', '', 'g'))::integer
  ELSE 1
END
WHERE round IS NOT NULL;

-- 3) Ensure no NULLs remain and keep default for new rows
ALTER TABLE public.interviews
ALTER COLUMN round_index SET NOT NULL;

-- 4) Add an index to speed up queries grouped/filtered by requirement + round
CREATE INDEX IF NOT EXISTS idx_interviews_requirement_round_idx
ON public.interviews (requirement_id, round_index);

COMMIT;
