-- =========================================================================
-- ENTERPRISE-LEVEL QUERY OPTIMIZATION MIGRATION
-- =========================================================================
-- This migration fixes slow queries and adds missing indexes for enterprise
-- performance at 1000+ concurrent users. Implements:
-- 1. Missing composite indexes for filtering + sorting
-- 2. Optimized SQL functions to replace N+1 queries
-- 3. Materialized summary columns
-- 4. Full-text search improvements
-- =========================================================================

-- =========================================================================
-- 1. CRITICAL MISSING INDEXES FOR HIGH-PERFORMANCE PAGINATION
-- =========================================================================

-- Safely create indexes with error handling
DO $$
BEGIN
  -- Interviews: user_id + scheduled_date
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_interviews_user_scheduled
    ON interviews (user_id, scheduled_date DESC, created_at DESC)';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not create idx_interviews_user_scheduled: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- Interviews: user_id + status + scheduled_date
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_interviews_user_status_scheduled
    ON interviews (user_id, status, scheduled_date DESC)';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not create idx_interviews_user_status_scheduled: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- Interviews: scheduled_date + status
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_interviews_scheduled_status
    ON interviews (scheduled_date DESC, status, user_id)';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not create idx_interviews_scheduled_status: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- Documents: user_id + created_at DESC
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_documents_user_created
    ON documents (user_id, created_at DESC)';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not create idx_documents_user_created: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- Documents: user_id + original_filename for ILIKE search
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_documents_filename_trgm
    ON documents USING gin (original_filename gin_trgm_ops)';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not create idx_documents_filename_trgm: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- Consultants: user_id + created_at for sorting
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_consultants_user_created
    ON consultants (user_id, created_at DESC)';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not create idx_consultants_user_created: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- Requirement Emails: user_id + sent_date for efficient lookups
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_requirement_emails_user_sent
    ON requirement_emails (user_id, sent_date DESC)';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not create idx_requirement_emails_user_sent: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- Requirement Emails: requirement_id for JOIN operations
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_requirement_emails_requirement_id
    ON requirement_emails (requirement_id)';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not create idx_requirement_emails_requirement_id: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- Campaign Recipients: account_id + status for bulk operations
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_campaign_recipients_account_status
    ON campaign_recipients (account_id, status)';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not create idx_campaign_recipients_account_status: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- Campaign Recipients: campaign_id for JOIN to campaign table
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign_id
    ON campaign_recipients (campaign_id)';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not create idx_campaign_recipients_campaign_id: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- Login History: user_id + created_at for audit logs
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_login_history_user_created
    ON login_history (user_id, created_at DESC)';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not create idx_login_history_user_created: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- Login History: suspicious + success for security dashboard
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_login_history_suspicious_success
    ON login_history (suspicious DESC, success DESC, created_at DESC)';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not create idx_login_history_suspicious_success: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- Error Reports: user_id + created_at for debugging
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_error_reports_user_created
    ON error_reports (user_id, created_at DESC)';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not create idx_error_reports_user_created: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- Activity Logs: user_id + resource_type + action for audit trail
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_activity_logs_user_resource_action
    ON activity_logs (user_id, resource_type, action, created_at DESC)';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not create idx_activity_logs_user_resource_action: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- Users: status + created_at for admin dashboard statistics
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_users_status_created
    ON users (status, created_at DESC)';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not create idx_users_status_created: %', SQLERRM;
END $$;

-- =========================================================================
-- FOREIGN KEY COVERING INDICES FOR OPTIMAL JOIN PERFORMANCE
-- =========================================================================

DO $$
BEGIN
  -- Document Versions: document_id foreign key covering index
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_document_versions_document_id
    ON document_versions (document_id, created_at DESC)';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not create idx_document_versions_document_id: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- Documents: parent_id foreign key covering index (for nested document hierarchies)
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_documents_parent_id
    ON documents (parent_id, created_at DESC)';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not create idx_documents_parent_id: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- Email Logs: email_thread_id foreign key covering index
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_email_logs_email_thread_id
    ON email_logs (email_thread_id, created_at DESC)';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not create idx_email_logs_email_thread_id: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- Email Threads: parent_id foreign key covering index (for nested thread hierarchies)
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_email_threads_parent_id
    ON email_threads (parent_id, created_at DESC)';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not create idx_email_threads_parent_id: %', SQLERRM;
END $$;

-- =========================================================================
-- 2. OPTIMIZED SQL FUNCTIONS TO ELIMINATE N+1 QUERIES
-- =========================================================================

-- Function: Get user statistics (replaces multiple COUNT queries in getApprovalStatistics)
CREATE OR REPLACE FUNCTION get_user_statistics()
RETURNS TABLE (
  pending_approval BIGINT,
  pending_verification BIGINT,
  approved BIGINT,
  rejected BIGINT,
  total_users BIGINT,
  today_signups BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE status = 'pending_approval')::BIGINT,
    COUNT(*) FILTER (WHERE status = 'pending_verification')::BIGINT,
    COUNT(*) FILTER (WHERE status = 'approved')::BIGINT,
    COUNT(*) FILTER (WHERE status = 'rejected')::BIGINT,
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)::BIGINT
  FROM users;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- Function: Get requirement statistics for dashboards (single query instead of multiple)
CREATE OR REPLACE FUNCTION get_requirement_statistics(p_user_id UUID)
RETURNS TABLE (
  total_count BIGINT,
  new_count BIGINT,
  in_progress_count BIGINT,
  interview_count BIGINT,
  offer_count BIGINT,
  rejected_count BIGINT,
  closed_count BIGINT,
  avg_rate NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE status = 'NEW')::BIGINT,
    COUNT(*) FILTER (WHERE status = 'IN_PROGRESS')::BIGINT,
    COUNT(*) FILTER (WHERE status = 'INTERVIEW')::BIGINT,
    COUNT(*) FILTER (WHERE status = 'OFFER')::BIGINT,
    COUNT(*) FILTER (WHERE status = 'REJECTED')::BIGINT,
    COUNT(*) FILTER (WHERE status = 'CLOSED')::BIGINT,
    ROUND(AVG(NULLIF(rate, 0)), 2)::NUMERIC
  FROM requirements
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- Function: Get interview statistics for calendars (batch query)
CREATE OR REPLACE FUNCTION get_interview_statistics(p_user_id UUID)
RETURNS TABLE (
  total_count BIGINT,
  pending_count BIGINT,
  scheduled_count BIGINT,
  completed_count BIGINT,
  cancelled_count BIGINT,
  next_interview_date TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE status = 'pending')::BIGINT,
    COUNT(*) FILTER (WHERE status = 'scheduled')::BIGINT,
    COUNT(*) FILTER (WHERE status = 'completed')::BIGINT,
    COUNT(*) FILTER (WHERE status = 'cancelled')::BIGINT,
    MIN(scheduled_date) FILTER (WHERE status = 'scheduled' AND scheduled_date > NOW())
  FROM interviews
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- Function: Batch fetch users with names (replaces N+1 getUserName calls)
CREATE OR REPLACE FUNCTION get_users_by_ids(p_user_ids UUID[])
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  email TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    users.id,
    COALESCE(NULLIF(users.full_name, ''), SPLIT_PART(users.email, '@', 1))::TEXT as full_name,
    users.email
  FROM users
  WHERE users.id = ANY(p_user_ids);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- =========================================================================
-- 3. OPTIMIZED SEARCH QUERIES WITH BETTER RELEVANCE
-- =========================================================================

-- Enhanced full-text search function for requirements (without search_vector dependency)
CREATE OR REPLACE FUNCTION search_requirements(
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
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id,
    r.title,
    r.company,
    r.description,
    r.status::TEXT,
    r.rate,
    r.created_at,
    -- Calculate relevance score based on field matches
    CASE
      WHEN r.title ILIKE (p_search_term || '%') THEN 1.0::REAL
      WHEN r.title ILIKE ('%' || p_search_term || '%') THEN 0.8::REAL
      WHEN r.company ILIKE ('%' || p_search_term || '%') THEN 0.6::REAL
      WHEN r.description ILIKE ('%' || p_search_term || '%') THEN 0.4::REAL
      ELSE 0.2::REAL
    END as relevance_score
  FROM requirements r
  WHERE r.user_id = p_user_id
    AND (
      r.title ILIKE ('%' || p_search_term || '%')
      OR r.company ILIKE ('%' || p_search_term || '%')
      OR r.description ILIKE ('%' || p_search_term || '%')
    )
  ORDER BY relevance_score DESC, r.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- Enhanced full-text search function for consultants
CREATE OR REPLACE FUNCTION search_consultants(
  p_user_id UUID,
  p_search_term TEXT,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  email TEXT,
  primary_skills TEXT,
  status TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.name,
    c.email,
    c.primary_skills,
    c.status::TEXT
  FROM consultants c
  WHERE c.user_id = p_user_id
    AND (
      c.name ILIKE ('%' || p_search_term || '%')
      OR c.email ILIKE ('%' || p_search_term || '%')
      OR c.primary_skills ILIKE ('%' || p_search_term || '%')
    )
  ORDER BY
    CASE
      WHEN c.name ILIKE (p_search_term || '%') THEN 1
      WHEN c.name ILIKE ('%' || p_search_term || '%') THEN 2
      ELSE 3
    END,
    c.updated_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- =========================================================================
-- 4. MATERIALIZED SUMMARY COLUMNS FOR FAST AGGREGATIONS
-- =========================================================================

-- Add summary columns to requirements table for fast stats without aggregations
-- (these may already exist - IF NOT EXISTS will skip them)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'requirements' AND column_name = 'application_count'
  ) THEN
    ALTER TABLE requirements ADD COLUMN application_count INTEGER DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'requirements' AND column_name = 'interview_count'
  ) THEN
    ALTER TABLE requirements ADD COLUMN interview_count INTEGER DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'requirements' AND column_name = 'last_activity_at'
  ) THEN
    ALTER TABLE requirements ADD COLUMN last_activity_at TIMESTAMP WITH TIME ZONE;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'requirements' AND column_name = 'is_starred'
  ) THEN
    ALTER TABLE requirements ADD COLUMN is_starred BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Add index on new summary columns for quick filtering
CREATE INDEX IF NOT EXISTS idx_requirements_starred
  ON requirements (user_id, is_starred, created_at DESC)
  WHERE is_starred = true;

-- Add summary columns to interviews table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'interviews' AND column_name = 'has_notes'
  ) THEN
    ALTER TABLE interviews ADD COLUMN has_notes BOOLEAN DEFAULT false;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'interviews' AND column_name = 'is_completed'
  ) THEN
    ALTER TABLE interviews ADD COLUMN is_completed BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Create index for quick completed interview lookups
CREATE INDEX IF NOT EXISTS idx_interviews_completed
  ON interviews (user_id, is_completed, scheduled_date DESC)
  WHERE is_completed = true;

-- =========================================================================
-- 5. VIEW FOR COMMON ADMIN QUERIES (MATERIALIZED FOR PERFORMANCE)
-- =========================================================================

-- Drop existing view if present
DROP MATERIALIZED VIEW IF EXISTS user_approval_stats CASCADE;

-- Create optimized view for admin statistics
CREATE MATERIALIZED VIEW user_approval_stats AS
SELECT
  'pending_approval'::TEXT as status,
  COUNT(*)::BIGINT as count
FROM users
WHERE status = 'pending_approval'

UNION ALL

SELECT
  'pending_verification'::TEXT,
  COUNT(*)::BIGINT
FROM users
WHERE status = 'pending_verification'

UNION ALL

SELECT
  'approved'::TEXT,
  COUNT(*)::BIGINT
FROM users
WHERE status = 'approved'

UNION ALL

SELECT
  'rejected'::TEXT,
  COUNT(*)::BIGINT
FROM users
WHERE status = 'rejected';

-- Index on materialized view for faster queries
CREATE UNIQUE INDEX idx_user_approval_stats_status
  ON user_approval_stats (status);

-- Revoke public access and grant only to authenticated users
DO $$
BEGIN
  -- Revoke all permissions from public
  REVOKE ALL ON user_approval_stats FROM PUBLIC;
  REVOKE ALL ON user_approval_stats FROM anon;
  REVOKE ALL ON user_approval_stats FROM authenticated;
  
  -- Grant select only to authenticated users
  GRANT SELECT ON user_approval_stats TO authenticated;
  
  RAISE NOTICE 'Permissions set for user_approval_stats view';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not set permissions on user_approval_stats: %', SQLERRM;
END $$;

-- =========================================================================
-- 6. QUERY OPTIMIZATION: COVERING INDEXES
-- =========================================================================

-- Covering index for common document list query (includes all needed columns)
DO $$
BEGIN
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_documents_user_created_covering
    ON documents (user_id, created_at DESC)
    INCLUDE (original_filename, filename)';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not create idx_documents_user_created_covering: %', SQLERRM;
END $$;

-- Covering index for requirement emails reporting
DO $$
BEGIN
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_requirement_emails_covering
    ON requirement_emails (user_id, sent_date DESC)
    INCLUDE (recipient_email, status)';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not create idx_requirement_emails_covering: %', SQLERRM;
END $$;

-- Covering index for interview list queries
DO $$
BEGIN
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_interviews_covering
    ON interviews (user_id, scheduled_date DESC)
    INCLUDE (status, title)';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not create idx_interviews_covering: %', SQLERRM;
END $$;

-- =========================================================================
-- 7. ANALYZE EXISTING INDEXES
-- =========================================================================

-- Update query planner statistics for better query plans
DO $$
BEGIN
  ANALYZE requirements;
  ANALYZE consultants;
  ANALYZE interviews;
  ANALYZE documents;
  ANALYZE users;
  ANALYZE activity_logs;
  ANALYZE login_history;
  ANALYZE requirement_emails;
  ANALYZE campaign_recipients;
  ANALYZE error_reports;
  RAISE NOTICE 'ANALYZE operations completed successfully';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Some ANALYZE operations failed (non-critical): %', SQLERRM;
END $$;

-- =========================================================================
-- 8. PERFORMANCE MONITORING UTILITIES
-- =========================================================================

-- View to find unused indexes (helps identify what can be dropped)
DO $$
BEGIN
  DROP VIEW IF EXISTS unused_indexes CASCADE;
  EXECUTE 'CREATE VIEW unused_indexes WITH (security_invoker = true) AS
    SELECT
      schemaname,
      relname as tablename,
      indexrelname as indexname,
      idx_scan,
      idx_tup_read,
      idx_tup_fetch,
      pg_size_pretty(pg_relation_size(indexrelid)) as index_size
    FROM pg_stat_user_indexes
    WHERE idx_scan = 0
      AND indexrelname NOT LIKE ''pg_toast%''
    ORDER BY pg_relation_size(indexrelid) DESC';
  RAISE NOTICE 'Created unused_indexes view';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not create unused_indexes view: %', SQLERRM;
END $$;

-- View to identify slow-running queries (requires pg_stat_statements extension)
DO $$
BEGIN
  DROP VIEW IF EXISTS slow_queries CASCADE;
  EXECUTE 'CREATE VIEW slow_queries WITH (security_invoker = true) AS
    SELECT
      query,
      calls,
      mean_exec_time,
      max_exec_time,
      total_exec_time,
      rows
    FROM pg_stat_statements
    WHERE query NOT ILIKE ''%pg_stat%''
      AND mean_exec_time > 100
    ORDER BY mean_exec_time DESC
    LIMIT 20';
  RAISE NOTICE 'Created slow_queries view';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not create slow_queries view (pg_stat_statements may not be installed): %', SQLERRM;
END $$;

-- =========================================================================
-- RECOMMENDATIONS FOR APPLICATION-LEVEL OPTIMIZATION
-- =========================================================================
-- 1. Replace getApprovalStatistics() with single call to get_user_statistics()
-- 2. Batch user lookups using get_users_by_ids() instead of N+1 getUserName() calls
-- 3. Use search_requirements() and search_consultants() for full-text queries
-- 4. Add result caching with 5-minute TTL for admin statistics
-- 5. Use cursor pagination exclusively (keyset pagination) for all list views
-- 6. Pre-fetch related data in single queries instead of lazy loading
-- 7. Consider denormalization for frequently queried aggregations
-- 8. Run VACUUM and ANALYZE weekly to maintain index effectiveness
-- 9. Monitor pg_stat_statements for new slow queries in production
-- 10. Set up query timeout at 30 seconds for admin operations, 5 seconds for user-facing queries
-- =========================================================================
