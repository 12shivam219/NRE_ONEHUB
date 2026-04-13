/**
 * useRAGSearch Hook
 * Phase 2: Semantic search and recommendations using vector embeddings
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '../lib/supabase';

interface SimilarRequirement {
  id: string;
  title: string;
  company: string;
  description: string;
  rate: string | null;
  status: string;
  similarity_score: number;
}

interface SkillMatch {
  skill: string;
  frequency: number;
  match_percentage: number;
}

interface JobMarketAnalytics {
  top_skills: string[];
  avg_rate: number;
  remote_job_percentage: number;
  trending_companies: string[];
  most_active_vendors: string[];
}

/**
 * Find similar requirements using vector search
 */
export function useSimilarRequirements(
  requirementId: string | null,
  options = { limit: 5, threshold: 0.7 }
) {
  const { user } = useAuth();
  const [similar, setSimilar] = useState<SimilarRequirement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cacheRef = useRef<Map<string, SimilarRequirement[]>>(new Map());

  const fetchSimilar = useCallback(async () => {
    if (!requirementId || !user) return;

    // Check cache
    const cacheKey = `${requirementId}-${options.limit}-${options.threshold}`;
    if (cacheRef.current.has(cacheKey)) {
      setSimilar(cacheRef.current.get(cacheKey)!);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Get current requirement's embedding
      const { data: currentReq } = await supabase
        .from('requirements')
        .select('description_embedding')
        .eq('id', requirementId)
        .eq('user_id', user.id)
        .single();

      if (!currentReq?.description_embedding) {
        setError('No embedding found for this requirement');
        setLoading(false);
        return;
      }

      // Search similar
      const { data: results, error: err } = await supabase.rpc(
        'search_similar_requirements',
        {
          p_user_id: user.id,
          p_embedding: currentReq.description_embedding,
          p_limit: options.limit,
          p_similarity_threshold: options.threshold,
        }
      );

      if (err) throw err;

      setSimilar(results || []);
      cacheRef.current.set(cacheKey, results || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      setSimilar([]);
    } finally {
      setLoading(false);
    }
  }, [requirementId, user, options.limit, options.threshold]);

  return { similar, loading, error, refetch: fetchSimilar };
}

/**
 * Find skill matches across requirements
 */
export function useSkillMatching(requirementId: string | null) {
  const { user } = useAuth();
  const [matches, setMatches] = useState<SkillMatch[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchSkillMatches = useCallback(async () => {
    if (!requirementId || !user) return;

    setLoading(true);

    try {
      // Get skills from current requirement
      const { data: req } = await supabase
        .from('requirements')
        .select('primary_tech_stack')
        .eq('id', requirementId)
        .eq('user_id', user.id)
        .single();

      if (!req?.primary_tech_stack) {
        setMatches([]);
        return;
      }

      const skills = req.primary_tech_stack.split(',').map((s: string) => s.trim());

      // Find other requirements with these skills
      const { data: otherReqs } = await supabase
        .from('requirements')
        .select('primary_tech_stack')
        .eq('user_id', user.id)
        .neq('id', requirementId)
        .not('primary_tech_stack', 'is', null);

      if (!otherReqs) {
        setMatches([]);
        return;
      }

      // Count skill matches
      const skillCounts = new Map<string, number>();
      for (const skill of skills) {
        skillCounts.set(skill, 0);
      }

      for (const req of otherReqs) {
        const reqSkills = req.primary_tech_stack.split(',').map((s: string) => s.trim());
        for (const skill of skills) {
          if (reqSkills.some((s: string) => s.toLowerCase() === skill.toLowerCase())) {
            skillCounts.set(skill, (skillCounts.get(skill) || 0) + 1);
          }
        }
      }

      const results = Array.from(skillCounts.entries()).map(([skill, count]) => ({
        skill,
        frequency: count,
        match_percentage: (count / otherReqs.length) * 100,
      }));

      setMatches(results.sort((a, b) => b.frequency - a.frequency));
    } catch (err) {
      console.error('Skill matching error:', err);
      setMatches([]);
    } finally {
      setLoading(false);
    }
  }, [requirementId, user]);

  useEffect(() => {
    fetchSkillMatches();
  }, [requirementId, user, fetchSkillMatches]);

  return { matches, loading, refetch: fetchSkillMatches };
}

/**
 * Get job market analytics
 */
export function useJobMarketAnalytics() {
  const { user } = useAuth();
  const [analytics, setAnalytics] = useState<JobMarketAnalytics | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchAnalytics = useCallback(async () => {
    if (!user) return;

    setLoading(true);

    try {
      // Try to get latest analytics
      const { data: analytics } = await supabase
        .from('job_market_analytics')
        .select('*')
        .eq('user_id', user.id)
        .order('analysis_date', { ascending: false })
        .limit(1)
        .single();

      if (analytics) {
        setAnalytics({
          top_skills: analytics.top_skills || [],
          avg_rate: analytics.avg_rate || 0,
          remote_job_percentage: analytics.remote_job_percentage || 0,
          trending_companies: analytics.trending_companies || [],
          most_active_vendors: analytics.most_active_vendors || [],
        });
      }
    } catch (err) {
      console.error('Analytics fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchAnalytics();
  }, [user, fetchAnalytics]);

  return { analytics, loading, refetch: fetchAnalytics };
}

/**
 * Search for duplicate requirements by similarity
 */
export function useDuplicateDetection(requirementId: string | null) {
  const { user } = useAuth();
  const [duplicates, setDuplicates] = useState<SimilarRequirement[]>([]);
  const [loading, setLoading] = useState(false);

  const checkDuplicates = useCallback(async () => {
    if (!requirementId || !user) return;

    setLoading(true);

    try {
      const { data: results, error: err } = await supabase.rpc(
        'find_similar_duplicates',
        {
          p_user_id: user.id,
          p_requirement_id: requirementId,
          p_similarity_threshold: 0.85,
        }
      );

      if (err) throw err;

      setDuplicates(results || []);
    } catch (err) {
      console.error('Duplicate detection error:', err);
      setDuplicates([]);
    } finally {
      setLoading(false);
    }
  }, [requirementId, user]);

  useEffect(() => {
    checkDuplicates();
  }, [requirementId, user, checkDuplicates]);

  return { duplicates, loading, refetch: checkDuplicates };
}

/**
 * Extract and analyze skills from requirement
 */
export function useRequirementSkills(requirementId: string | null) {
  const { user } = useAuth();
  const [skills, setSkills] = useState<Array<{ skill: string; frequency: number; relevance: number }>>([]);
  const [loading, setLoading] = useState(false);

  const extractSkills = useCallback(async () => {
    if (!requirementId || !user) return;

    setLoading(true);

    try {
      const { data: results, error: err } = await supabase.rpc(
        'extract_skills_from_requirement',
        { p_requirement_id: requirementId }
      );

      if (err) throw err;

      setSkills(results || []);
    } catch (err) {
      console.error('Skills extraction error:', err);
      setSkills([]);
    } finally {
      setLoading(false);
    }
  }, [requirementId, user]);

  useEffect(() => {
    extractSkills();
  }, [requirementId, user, extractSkills]);

  return { skills, loading, refetch: extractSkills };
}
