-- Migration: 059_drop_old_search_trigger.sql
-- Purpose: Drop the outdated requirements_search_update trigger that references non-existent "company" field
-- The search_vector is now a GENERATED column and doesn't need manual trigger updates

BEGIN;

-- Drop the old trigger that was trying to access the "company" column (renamed to implementation_partner in migration 050)
DROP TRIGGER IF EXISTS requirements_search_update_trigger ON public.requirements;

-- Drop the old trigger function
DROP FUNCTION IF EXISTS public.requirements_search_update();

COMMIT;
