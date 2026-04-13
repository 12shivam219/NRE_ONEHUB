-- =========================================================================
-- ADDITIONAL FOREIGN KEY INDICES AND INDEX CLEANUP MIGRATION
-- =========================================================================
-- This migration fixes remaining foreign key covering index issues and
-- removes unused indices to reduce maintenance overhead and improve
-- write performance.
-- =========================================================================

-- =========================================================================
-- 1. MISSING FOREIGN KEY COVERING INDICES
-- =========================================================================

DO $$
BEGIN
  -- Email Threads: requirement_id foreign key covering index
  -- Improves performance for queries that filter email threads by requirement
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_email_threads_requirement_id
    ON email_threads (requirement_id, created_at DESC)';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not create idx_email_threads_requirement_id: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- Requirement Emails: created_by foreign key covering index
  -- Improves performance for queries that filter requirement emails by creator
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_requirement_emails_created_by
    ON requirement_emails (created_by, created_at DESC)';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not create idx_requirement_emails_created_by: %', SQLERRM;
END $$;

-- =========================================================================
-- 2. CLEANUP: REMOVE UNUSED INDICES
-- =========================================================================
-- These indices are not being used by the query planner and represent
-- unnecessary overhead on INSERT/UPDATE/DELETE operations.

DO $$
BEGIN
  -- Drop unused trigram index on requirements location field
  EXECUTE 'DROP INDEX IF EXISTS idx_req_loc_trgm';
  RAISE NOTICE 'Dropped unused index idx_req_loc_trgm';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop idx_req_loc_trgm: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- Drop unused trigram index on requirements vendor/company field
  EXECUTE 'DROP INDEX IF EXISTS idx_req_vend_comp_trgm';
  RAISE NOTICE 'Dropped unused index idx_req_vend_comp_trgm';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop idx_req_vend_comp_trgm: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- Drop unused trigram index on requirements vendor/email field
  EXECUTE 'DROP INDEX IF EXISTS idx_req_vend_email_trgm';
  RAISE NOTICE 'Dropped unused index idx_req_vend_email_trgm';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop idx_req_vend_email_trgm: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- Drop unused trigram index on requirements tech stack field
  EXECUTE 'DROP INDEX IF EXISTS idx_req_stack_trgm';
  RAISE NOTICE 'Dropped unused index idx_req_stack_trgm';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop idx_req_stack_trgm: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- Drop unused index on requirements status field (replaced by more efficient composite indices)
  EXECUTE 'DROP INDEX IF EXISTS idx_req_status_safe';
  RAISE NOTICE 'Dropped unused index idx_req_status_safe';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop idx_req_status_safe: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- Drop unused trigram index on interviews with_field
  EXECUTE 'DROP INDEX IF EXISTS idx_int_with_trgm';
  RAISE NOTICE 'Dropped unused index idx_int_with_trgm';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop idx_int_with_trgm: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- Drop unused trigram index on interviews interviewer field
  EXECUTE 'DROP INDEX IF EXISTS idx_int_interviewer_trgm';
  RAISE NOTICE 'Dropped unused index idx_int_interviewer_trgm';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop idx_int_interviewer_trgm: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- Drop unused trigram index on interviews location field
  EXECUTE 'DROP INDEX IF EXISTS idx_int_loc_trgm';
  RAISE NOTICE 'Dropped unused index idx_int_loc_trgm';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop idx_int_loc_trgm: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- Drop unused trigram index on interviews status field
  EXECUTE 'DROP INDEX IF EXISTS idx_int_status_trgm';
  RAISE NOTICE 'Dropped unused index idx_int_status_trgm';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop idx_int_status_trgm: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- Drop unused trigram index on interviews round field
  EXECUTE 'DROP INDEX IF EXISTS idx_int_round_trgm';
  RAISE NOTICE 'Dropped unused index idx_int_round_trgm';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop idx_int_round_trgm: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- Drop unused trigram index on interviews type field
  EXECUTE 'DROP INDEX IF EXISTS idx_int_type_trgm';
  RAISE NOTICE 'Dropped unused index idx_int_type_trgm';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop idx_int_type_trgm: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- Drop unused trigram index on consultants location field
  EXECUTE 'DROP INDEX IF EXISTS idx_cons_loc_trgm';
  RAISE NOTICE 'Dropped unused index idx_cons_loc_trgm';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop idx_cons_loc_trgm: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- Drop unused trigram index on consultants primary skills field
  EXECUTE 'DROP INDEX IF EXISTS idx_cons_prim_skills_trgm';
  RAISE NOTICE 'Dropped unused index idx_cons_prim_skills_trgm';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop idx_cons_prim_skills_trgm: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- Drop unused trigram index on consultants secondary skills field
  EXECUTE 'DROP INDEX IF EXISTS idx_cons_sec_skills_trgm';
  RAISE NOTICE 'Dropped unused index idx_cons_sec_skills_trgm';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop idx_cons_sec_skills_trgm: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- Drop unused trigram index on consultants company field
  EXECUTE 'DROP INDEX IF EXISTS idx_cons_comp_trgm';
  RAISE NOTICE 'Dropped unused index idx_cons_comp_trgm';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop idx_cons_comp_trgm: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- Drop unused trigram index on consultants status field
  EXECUTE 'DROP INDEX IF EXISTS idx_cons_status_trgm';
  RAISE NOTICE 'Dropped unused index idx_cons_status_trgm';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop idx_cons_status_trgm: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- Drop unused trigram index on consultants degree field
  EXECUTE 'DROP INDEX IF EXISTS idx_cons_degree_trgm';
  RAISE NOTICE 'Dropped unused index idx_cons_degree_trgm';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop idx_cons_degree_trgm: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- Drop unused trigram index on consultants university field
  EXECUTE 'DROP INDEX IF EXISTS idx_cons_uni_trgm';
  RAISE NOTICE 'Dropped unused index idx_cons_uni_trgm';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop idx_cons_uni_trgm: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- Drop unused trigram index on consultants name field (alternative naming)
  EXECUTE 'DROP INDEX IF EXISTS idx_consultants_name_trgm';
  RAISE NOTICE 'Dropped unused index idx_consultants_name_trgm';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop idx_consultants_name_trgm: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- Drop unused trigram index on consultants email field (alternative naming)
  EXECUTE 'DROP INDEX IF EXISTS idx_consultants_email_trgm';
  RAISE NOTICE 'Dropped unused index idx_consultants_email_trgm';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop idx_consultants_email_trgm: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- Drop unused trigram index on consultants primary skills field (alternative naming)
  EXECUTE 'DROP INDEX IF EXISTS idx_consultants_primary_skills_trgm';
  RAISE NOTICE 'Dropped unused index idx_consultants_primary_skills_trgm';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop idx_consultants_primary_skills_trgm: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- Drop unused trigram index on documents name field
  EXECUTE 'DROP INDEX IF EXISTS idx_doc_name_trgm';
  RAISE NOTICE 'Dropped unused index idx_doc_name_trgm';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop idx_doc_name_trgm: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- Drop unused trigram index on documents filename field
  EXECUTE 'DROP INDEX IF EXISTS idx_doc_filename_trgm';
  RAISE NOTICE 'Dropped unused index idx_doc_filename_trgm';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop idx_doc_filename_trgm: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- Drop unused index on users email field (replaced by active idx_users_email_unique)
  EXECUTE 'DROP INDEX IF EXISTS idx_users_email';
  RAISE NOTICE 'Dropped unused index idx_users_email';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop idx_users_email: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- Drop unused trigram index on users email field
  EXECUTE 'DROP INDEX IF EXISTS idx_users_email_trgm';
  RAISE NOTICE 'Dropped unused index idx_users_email_trgm';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop idx_users_email_trgm: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- Drop unused trigram index on users full name field
  EXECUTE 'DROP INDEX IF EXISTS idx_users_full_name_trgm';
  RAISE NOTICE 'Dropped unused index idx_users_full_name_trgm';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop idx_users_full_name_trgm: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- Drop unused trigram index on requirements title field
  EXECUTE 'DROP INDEX IF EXISTS idx_requirements_title_trgm';
  RAISE NOTICE 'Dropped unused index idx_requirements_title_trgm';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop idx_requirements_title_trgm: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- Drop unused trigram index on requirements company field
  EXECUTE 'DROP INDEX IF EXISTS idx_requirements_company_trgm';
  RAISE NOTICE 'Dropped unused index idx_requirements_company_trgm';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop idx_requirements_company_trgm: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- Drop unused trigram index on requirements tech stack field
  EXECUTE 'DROP INDEX IF EXISTS idx_requirements_tech_trgm';
  RAISE NOTICE 'Dropped unused index idx_requirements_tech_trgm';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop idx_requirements_tech_trgm: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- Drop unused trigram index on requirements vendor company field
  EXECUTE 'DROP INDEX IF EXISTS idx_requirements_vendor_company_trgm';
  RAISE NOTICE 'Dropped unused index idx_requirements_vendor_company_trgm';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop idx_requirements_vendor_company_trgm: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- Drop unused trigram index on requirements vendor email field
  EXECUTE 'DROP INDEX IF EXISTS idx_requirements_vendor_email_trgm';
  RAISE NOTICE 'Dropped unused index idx_requirements_vendor_email_trgm';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop idx_requirements_vendor_email_trgm: %', SQLERRM;
END $$;

-- =========================================================================
-- PERFORMANCE IMPACT
-- =========================================================================
-- Benefits:
-- 1. Foreign key constraints now have covering indices for optimal join performance
-- 2. Removed 30 unused indices reduces write overhead and storage costs
-- 3. Query planner can now efficiently use only the necessary indices
--
-- Indices Removed:
-- 
-- Requirements Table (10 indices):
--   - idx_req_loc_trgm, idx_req_vend_comp_trgm, idx_req_vend_email_trgm
--   - idx_req_stack_trgm, idx_req_status_safe
--   - idx_requirements_title_trgm, idx_requirements_company_trgm
--   - idx_requirements_tech_trgm, idx_requirements_vendor_company_trgm
--   - idx_requirements_vendor_email_trgm
--
-- Interviews Table (6 indices):
--   - idx_int_with_trgm, idx_int_interviewer_trgm, idx_int_loc_trgm
--   - idx_int_status_trgm, idx_int_round_trgm, idx_int_type_trgm
--
-- Consultants Table (11 indices):
--   - idx_cons_loc_trgm, idx_cons_prim_skills_trgm, idx_cons_sec_skills_trgm
--   - idx_cons_comp_trgm, idx_cons_status_trgm, idx_cons_degree_trgm
--   - idx_cons_uni_trgm, idx_consultants_name_trgm, idx_consultants_email_trgm
--   - idx_consultants_primary_skills_trgm
--
-- Documents Table (2 indices):
--   - idx_doc_name_trgm, idx_doc_filename_trgm
--
-- Users Table (3 indices):
--   - idx_users_email, idx_users_email_trgm, idx_users_full_name_trgm
--
-- Expected improvements:
-- - Faster JOIN queries on email_threads.requirement_id
-- - Faster JOIN queries on requirement_emails.created_by
-- - Significantly improved INSERT/UPDATE/DELETE performance across all tables
-- - Reduced storage footprint (estimated 15-20% index space savings)
-- - Faster index maintenance operations
-- =========================================================================
