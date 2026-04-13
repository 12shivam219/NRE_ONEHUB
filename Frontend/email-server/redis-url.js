import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load email-server/.env even when the process cwd is repo root or Frontend/ (fixes missing REDIS_URL → localhost).
const __emailServerDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__emailServerDir, '.env') });

const DEFAULT_REDIS_URL = 'redis://localhost:6379';

/**
 * Strips accidental redis-cli / shell noise (e.g. " -u redis://...", quotes).
 * If the raw value is wrong, ioredis may treat it as a Unix socket path → ENOENT.
 */
export function normalizeRedisUrl(raw) {
  if (raw == null || typeof raw !== 'string') return null;
  let s = raw.trim();
  if (!s) return null;
  s = s.replace(/^['"]|['"]$/g, '');
  const extracted = s.match(/(rediss?:\/\/[^\s"'`]+)/i);
  if (extracted) return extracted[1];
  if (/^rediss?:\/\//i.test(s)) return s;
  return s;
}

let warnedUsingLocalDefault = false;

export function resolveRedisUrl() {
  const n = normalizeRedisUrl(process.env.REDIS_URL);
  if (n) return n;
  if (process.env.REDIS_HOST) {
    const port = process.env.REDIS_PORT || '6379';
    return `redis://${process.env.REDIS_HOST}:${port}`;
  }
  if (!warnedUsingLocalDefault) {
    warnedUsingLocalDefault = true;
    console.warn(
      '⚠️  REDIS_URL is not set or is empty after trimming. Using redis://127.0.0.1:6379. ' +
        'Add REDIS_URL to .env (local) or to your Render service Environment (name must be REDIS_URL), then restart.'
    );
  }
  return DEFAULT_REDIS_URL;
}

/**
 * BullMQ warns when maxmemory-policy is not "noeviction" (Redis Cloud free tier is often volatile-lru).
 * skipVersionCheck skips that INFO-based check (and Redis version check). Use BULLMQ_SKIP_VERSION_CHECK=false to always run checks.
 */
export function bullMqSkipVersionCheck() {
  if (process.env.BULLMQ_SKIP_VERSION_CHECK === 'false') return false;
  if (process.env.BULLMQ_SKIP_VERSION_CHECK === 'true') return true;
  try {
    const host = new URL(resolveRedisUrl()).hostname.toLowerCase();
    if (host.includes('redislabs.com') || host.includes('redis.cloud')) return true;
    if (host.endsWith('.upstash.io')) return true;
  } catch {
    /* ignore */
  }
  return false;
}
