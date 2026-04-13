-- Migration: Remove interview_focus_cache table and related infrastructure
-- Purpose: Complete removal of Groq AI interview focus generation feature
-- Note: Edge Function 'interview-focus-generator' has been deleted from codebase

-- Drop RLS policies first (reverse order from creation)
DROP POLICY IF EXISTS "Allow service role to read interview focus cache" ON public.interview_focus_cache;
DROP POLICY IF EXISTS "Allow service role to update interview focus cache" ON public.interview_focus_cache;
DROP POLICY IF EXISTS "Allow service role to insert interview focus cache" ON public.interview_focus_cache;
DROP POLICY IF EXISTS "Allow service role to delete interview focus cache" ON public.interview_focus_cache;

-- Drop indexes
DROP INDEX IF EXISTS idx_interview_focus_cache_created;
DROP INDEX IF EXISTS idx_interview_focus_cache_hash;

-- Drop table
DROP TABLE IF EXISTS public.interview_focus_cache;
