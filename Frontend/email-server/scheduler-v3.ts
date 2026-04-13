import axios from 'axios';
import { CronJob } from 'cron';
import Redis from 'ioredis';
import { Queue, Worker, QueueEvents } from 'bullmq';
import dotenv from 'dotenv';

dotenv.config();

const redisConnection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
};

const embeddingQueue = new Queue('embeddings', {
  connection: redisConnection,
});

const SCHEDULER_CONFIG = {
  POLLING_INTERVAL: process.env.JOB_POLLING_INTERVAL_MINUTES || '10',
  MAX_RETRIES: 3,
  RETRY_BACKOFF_MS: 5000,
  EMBEDDING_SERVICE_URL: process.env.EMBEDDING_SERVICE_URL || 'http://localhost:3001',
};

class SchedulerV3 {
  private job: CronJob | null = null;
  private isRunning = false;
  private lastError: string | null = null;
  private generateWorker: Worker | null = null;
  private migrateWorker: Worker | null = null;
  private queueEvents: QueueEvents | null = null;

  constructor() {
    this.setupEmbeddingQueueHandlers();
  }

  private setupEmbeddingQueueHandlers() {
    // Setup workers for different job types
    this.generateWorker = new Worker('embeddings', async (job) => {
      const { requirementId, description } = job.data;

      try {
        const response = await axios.post(
          `${SCHEDULER_CONFIG.EMBEDDING_SERVICE_URL}/api/embeddings/generate`,
          {
            requirementId,
            description,
          },
          { timeout: 30000 }
        );

        return response.data;
      } catch (error) {
        console.error(`[Embeddings] Failed to generate embedding for ${requirementId}:`, error);
        throw error;
      }
    }, {
      connection: redisConnection,
      concurrency: parseInt(process.env.EMBEDDING_CONCURRENCY || '3'),
    });

    this.migrateWorker = new Worker('embeddings', async (job) => {
      const { userId, batchSize } = job.data;

      try {
        const response = await axios.post(
          `${SCHEDULER_CONFIG.EMBEDDING_SERVICE_URL}/api/embeddings/bulk-migrate`,
          {
            userId,
            batchSize: batchSize || 10,
          },
          { timeout: 120000 }
        );

        return response.data;
      } catch (error) {
        console.error(`[Embeddings] Bulk migration failed for user ${userId}:`, error);
        throw error;
      }
    }, {
      connection: redisConnection,
    });

    // Setup event listeners
    this.queueEvents = new QueueEvents('embeddings', {
      connection: redisConnection,
    });

    this.queueEvents.on('completed', ({ jobId }) => {
      console.log(`[Embeddings] ✅ Job ${jobId} completed`);
    });

    this.queueEvents.on('failed', ({ jobId, failedReason }) => {
      console.error(`[Embeddings] ❌ Job ${jobId} failed: ${failedReason}`);
    });
  }

  async startEmbeddingService() {
    try {
      console.log('[Scheduler] Starting embedding service...');

      const response = await axios.post(`${SCHEDULER_CONFIG.EMBEDDING_SERVICE_URL}/api/health/check`, {}, {
        timeout: 5000,
      });

      if (response.data.status === 'healthy') {
        console.log('[Scheduler] ✅ Embedding service is healthy');
        return true;
      }
    } catch (error) {
      console.warn('[Scheduler] Embedding service not available:', error);
      return false;
    }
  }

  async executeJobExtraction() {
    const executionId = `exec-${Date.now()}`;
    console.log(`[Scheduler] [${executionId}] Starting job extraction cycle...`);

    try {
      // Create a Redis client for this operation
      const redis = new Redis(redisConnection);

      // Check last execution
      const lastExecution = await redis.get('scheduler:last-execution');
      const timeSinceLastRun = lastExecution ? Date.now() - parseInt(lastExecution) : null;

      console.log(`[Scheduler] [${executionId}] Time since last run: ${timeSinceLastRun ? Math.round(timeSinceLastRun / 1000) + 's' : 'N/A'}`);

      // Call job extraction agent
      const response = await axios.post(
        `${process.env.API_SERVER_URL || 'http://localhost:3000'}/api/jobs/extract`,
        {},
        {
          timeout: 60000,
        }
      );

      const { success, jobsExtracted, jobsProcessed, embeddingsQueued } = response.data;

      console.log(`[Scheduler] [${executionId}] Job extraction result:`, {
        success,
        jobsExtracted,
        jobsProcessed,
        embeddingsQueued,
      });

      // Update last execution time
      await redis.set('scheduler:last-execution', Date.now().toString());

      // Clear error on success
      this.lastError = null;

      redis.disconnect();

      return {
        success,
        jobsExtracted,
        jobsProcessed,
        embeddingsQueued,
      };
    } catch (error) {
      const redis = new Redis(redisConnection);
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.lastError = errorMsg;

      console.error(`[Scheduler] [${executionId}] Job extraction failed:`, errorMsg);

      // Log error to Redis for monitoring
      await redis.lpush('scheduler:errors', JSON.stringify({
        timestamp: new Date().toISOString(),
        error: errorMsg,
        executionId,
      }));

      // Keep only last 100 errors
      await redis.ltrim('scheduler:errors', 0, 99);

      redis.disconnect();

      throw error;
    }
  }

  async queueEmbeddingMigration(userId: string, batchSize = 10) {
    console.log(`[Scheduler] Queuing embedding migration for user ${userId}`);

    const job = await embeddingQueue.add(
      'bulk-migrate',
      { userId, batchSize },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: true,
      }
    );

    console.log(`[Scheduler] Bulk migration queued with job ID ${job.id}`);
    return job.id;
  }

  start() {
    if (this.isRunning) {
      console.log('[Scheduler] Already running');
      return;
    }

    console.log(`[Scheduler] Starting with ${SCHEDULER_CONFIG.POLLING_INTERVAL}min interval`);

    // Cron expression: runs every N minutes
    const cronExpression = `*/${SCHEDULER_CONFIG.POLLING_INTERVAL} * * * *`;

    this.job = new CronJob(
      cronExpression,
      async () => {
        try {
          await this.executeJobExtraction();
        } catch (error) {
          console.error('[Scheduler] Extraction cycle failed:', error);
        }
      },
      null,
      true,
      'UTC'
    );

    this.isRunning = true;

    // Log scheduler status
    this.logStatus();

    // Setup error handler
    process.on('unhandledRejection', (reason) => {
      console.error('[Scheduler] Unhandled rejection:', reason);
    });

    console.log('[Scheduler] ✅ Scheduler started successfully');
  }

  stop() {
    if (this.job) {
      this.job.stop();
      this.isRunning = false;
      console.log('[Scheduler] ✅ Scheduler stopped');
    }
  }

  private logStatus() {
    const interval = setInterval(() => {
      if (!this.isRunning) {
        clearInterval(interval);
        return;
      }

      const nextRun = this.job?.nextDate();
      const nextRunTime = nextRun ? nextRun.toString() : 'Unknown';
      console.log(
        `[Scheduler] Status - Running: ${this.isRunning}, Next execution: ${nextRunTime}, Last error: ${this.lastError || 'None'}`
      );
    }, 3600000); // Log every hour
  }

  async getStatus() {
    const redis = new Redis(redisConnection);

    const lastExecution = await redis.get('scheduler:last-execution');
    const recentErrors = await redis.lrange('scheduler:errors', 0, 4);

    redis.disconnect();

    return {
      isRunning: this.isRunning,
      lastExecution: lastExecution ? new Date(parseInt(lastExecution)).toISOString() : null,
      lastError: this.lastError,
      recentErrors: recentErrors.map((e: string) => JSON.parse(e)),
    };
  }
}

// Graceful shutdown
const scheduler = new SchedulerV3();

async function shutdown(signal: string) {
  console.log(`\n[Scheduler] Received ${signal}, shutting down gracefully...`);
  scheduler.stop();
  
  if (scheduler['generateWorker']) {
    await scheduler['generateWorker'].close();
  }
  if (scheduler['migrateWorker']) {
    await scheduler['migrateWorker'].close();
  }
  if (scheduler['queueEvents']) {
    await scheduler['queueEvents'].close();
  }
  
  await embeddingQueue.close();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Start scheduler
(async () => {
  console.log('[Scheduler] Initializing V3...');

  // Start embedding service
  const embeddingServiceReady = await scheduler.startEmbeddingService();
  if (!embeddingServiceReady) {
    console.warn('[Scheduler] Embedding service not available on startup, will retry...');
  }

  // Start main scheduler
  scheduler.start();

  // Export for API integration
  module.exports = { scheduler };
})();
