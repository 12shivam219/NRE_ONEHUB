/**
 * Run from anywhere: node path/to/email-server/scripts/redis-smoke-test.mjs
 * redis-url.js loads email-server/.env automatically.
 */
import IORedis from 'ioredis';
import { resolveRedisUrl } from '../redis-url.js';

const url = resolveRedisUrl();
let host = '?';
try {
  host = new URL(url).hostname;
} catch {
  /* ignore */
}
console.log('Using Redis host:', host, '(port from URL)');

const client = new IORedis(url, {
  maxRetriesPerRequest: null,
  connectTimeout: 20000,
});

client.on('error', (err) => {
  console.error('Redis client error:', err.message);
});

try {
  const pong = await client.ping();
  console.log('PING result:', pong);
  await client.quit();
  console.log('OK — Redis connection works.');
  process.exit(0);
} catch (err) {
  console.error('FAIL —', err.message || err);
  try {
    await client.quit();
  } catch {
    /* ignore */
  }
  process.exit(1);
}
