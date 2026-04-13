/**
 * Job Extraction API Endpoints
 * Phase 2: API routes for job extraction, embeddings, and RAG operations
 * Integrates with job-extraction-agent-v3 and embedding-service
 */

import express, { Request, Response, Router } from 'express';
import axios from 'axios';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const router = Router();

const redisConnection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
};

const redis = new Redis(redisConnection);

const embeddingQueue = new Queue('embeddings', {
  connection: redisConnection,
});

const EMBEDDING_SERVICE_URL = process.env.EMBEDDING_SERVICE_URL || 'http://localhost:3001';

/**
 * POST /api/jobs/extract
 * Trigger job extraction and optional real-time embedding generation
 */
router.post('/api/jobs/extract', async (req: Request, res: Response) => {
  try {
    console.log('[API] Starting job extraction cycle');

    // Call job extraction agent v3
    const agentResponse = await axios.post(
      `${process.env.JOB_EXTRACTION_API}/api/agent/extract-jobs`,
      {},
      { timeout: 120000 }
    );

    const { jobsExtracted, jobsProcessed, success } = agentResponse.data;

    console.log('[API] Job extraction complete:', { jobsExtracted, jobsProcessed });

    // Queue embeddings for newly extracted jobs if enabled
    let embeddingsQueued = 0;
    if (process.env.GENERATE_EMBEDDINGS_REAL_TIME === 'true') {
      try {
        const embeddingResponse = await axios.post(
          `${EMBEDDING_SERVICE_URL}/api/embeddings/queue-recent`,
          {
            minutesAgo: parseInt(process.env.JOB_POLLING_INTERVAL_MINUTES || '10') + 1,
            priority: 'high',
          },
          { timeout: 30000 }
        );

        embeddingsQueued = embeddingResponse.data.queued || 0;
        console.log('[API] Queued embeddings:', embeddingsQueued);
      } catch (err) {
        console.warn('[API] Failed to queue embeddings:', err);
        // Don't fail the entire extraction if embedding queuing fails
      }
    }

    res.json({
      success,
      jobsExtracted,
      jobsProcessed,
      embeddingsQueued,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[API] Job extraction failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/embeddings/generate
 * Generate embedding for a single requirement
 */
router.post('/api/embeddings/generate', async (req: Request, res: Response) => {
  const { requirementId, userId } = req.body;

  if (!requirementId || !userId) {
    res.status(400).json({ error: 'requirementId and userId required' });
    return;
  }

  try {
    console.log(`[API] Generating embedding for requirement ${requirementId}`);

    // Get requirement description
    const { data: requirement } = await supabase
      .from('requirements')
      .select('description, title, primary_tech_stack')
      .eq('id', requirementId)
      .eq('user_id', userId)
      .single();

    if (!requirement) {
      res.status(404).json({ error: 'Requirement not found' });
      return;
    }

    // Generate embedding via embedding service
    const response = await axios.post(
      `${EMBEDDING_SERVICE_URL}/api/embeddings/generate`,
      {
        requirementId,
        description: requirement.description || requirement.title,
        metadata: {
          title: requirement.title,
          skills: requirement.primary_tech_stack?.split(',') || [],
        },
      },
      { timeout: 30000 }
    );

    res.json({
      success: true,
      requirementId,
      embedding: response.data.embedding,
      dimension: response.data.dimension,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[API] Embedding generation failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/embeddings/bulk-generate
 * Start bulk embedding generation for user
 */
router.post('/api/embeddings/bulk-generate', async (req: Request, res: Response) => {
  const { userId, batchSize = 10 } = req.body;

  if (!userId) {
    res.status(400).json({ error: 'userId required' });
    return;
  }

  try {
    console.log(`[API] Queuing bulk embedding migration for user ${userId}`);

    // Queue bulk migration job
    const job = await embeddingQueue.add(
      'bulk-migrate',
      { userId, batchSize },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        jobId: `bulk-migration-${userId}-${Date.now()}`,
      }
    );

    res.json({
      success: true,
      jobId: job.id,
      status: 'queued',
      message: `Bulk embedding migration started for ${userId}`,
    });
  } catch (error) {
    console.error('[API] Bulk embedding failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/embeddings/status/:jobId
 * Get status of embedding job
 */
router.get('/api/embeddings/status/:jobId', async (req: Request, res: Response) => {
  const { jobId } = req.params;
  const jobIdStr = Array.isArray(jobId) ? jobId[0] : jobId;

  try {
    const job = await embeddingQueue.getJob(jobIdStr);

    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    const state = await job.getState();
    const progress = job.progress && typeof job.progress !== 'function' ? job.progress : 0;

    res.json({
      jobId: jobIdStr,
      state,
      progress,
      data: job.data,
    });
  } catch (error) {
    console.error('[API] Status check failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/search/similar
 * Search for similar requirements using vector similarity
 */
router.post('/api/search/similar', async (req: Request, res: Response) => {
  const { userId, requirementId, limit = 5, threshold = 0.7 } = req.body;

  if (!userId || !requirementId) {
    res.status(400).json({ error: 'userId and requirementId required' });
    return;
  }

  try {
    console.log(`[API] Searching similar requirements for ${requirementId}`);

    // Get current requirement
    const { data: current } = await supabase
      .from('requirements')
      .select('description_embedding')
      .eq('id', requirementId)
      .eq('user_id', userId)
      .single();

    if (!current?.description_embedding) {
      res.status(404).json({ error: 'Requirement embedding not found' });
      return;
    }

    // Search similar
    const { data: results, error } = await supabase.rpc(
      'search_similar_requirements',
      {
        p_user_id: userId,
        p_embedding: current.description_embedding,
        p_limit: limit,
        p_similarity_threshold: threshold,
      }
    );

    if (error) throw error;

    res.json({
      success: true,
      results,
      count: results?.length || 0,
    });
  } catch (error) {
    console.error('[API] Similar search failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/search/duplicates
 * Find potential duplicate requirements
 */
router.post('/api/search/duplicates', async (req: Request, res: Response) => {
  const { userId, requirementId, threshold = 0.85 } = req.body;

  if (!userId || !requirementId) {
    res.status(400).json({ error: 'userId and requirementId required' });
    return;
  }

  try {
    console.log(`[API] Checking duplicates for ${requirementId}`);

    const { data: results, error } = await supabase.rpc(
      'find_similar_duplicates',
      {
        p_user_id: userId,
        p_requirement_id: requirementId,
        p_similarity_threshold: threshold,
      }
    );

    if (error) throw error;

    res.json({
      success: true,
      duplicates: results,
      count: results?.length || 0,
      action_required: (results?.length || 0) > 0,
    });
  } catch (error) {
    console.error('[API] Duplicate check failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/analytics/quality-metrics
 * Get requirement quality metrics
 */
router.post('/api/analytics/quality-metrics', async (req: Request, res: Response) => {
  const { userId } = req.body;

  if (!userId) {
    res.status(400).json({ error: 'userId required' });
    return;
  }

  try {
    console.log(`[API] Getting quality metrics for user ${userId}`);

    const { data: metrics, error } = await supabase.rpc(
      'get_requirement_quality_metrics',
      { p_user_id: userId }
    );

    if (error) throw error;

    res.json({
      success: true,
      metrics,
    });
  } catch (error) {
    console.error('[API] Metrics retrieval failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/health/check
 * Health check endpoint
 */
router.get('/api/health/check', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      api: 'running',
      embedding_queue: embeddingQueue ? 'ready' : 'unavailable',
    },
  });
});

export default router;
