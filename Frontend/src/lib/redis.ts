/**
 * Frontend cache layer.
 * Keeps a browser-safe in-memory fallback and intentionally avoids importing
 * Node Redis clients into the Vite bundle.
 */

interface CacheConfig {
  ttl?: number;
  prefix?: string;
}

const DEFAULT_TTL = 1800;
const CACHE_PREFIX = 'nre:';
const IN_MEMORY_CACHE = new Map<string, { value: unknown; expires: number }>();
const CACHE_SIZE_LIMIT = 10000;

let redisClient: any = null;
let isRedisAvailable = false;

export const initializeRedis = async (redisUrl?: string) => {
  if (!redisUrl) {
    console.log('[Redis] URL not provided, using in-memory cache only');
    return;
  }

  console.info(
    `[Redis] Remote Redis initialization is disabled in the frontend bundle (${redisUrl}). Using in-memory cache only.`
  );
  redisClient = null;
  isRedisAvailable = false;
};

export const getCacheValue = async <T>(key: string): Promise<T | null> => {
  const cacheKey = CACHE_PREFIX + key;

  try {
    if (isRedisAvailable && redisClient) {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as T;
      }
    }
  } catch (error) {
    console.warn('[Cache] Redis get failed:', error);
  }

  const inMem = IN_MEMORY_CACHE.get(cacheKey);
  if (inMem && inMem.expires > Date.now()) {
    return inMem.value as T;
  }

  if (inMem) {
    IN_MEMORY_CACHE.delete(cacheKey);
  }

  return null;
};

export const setCacheValue = async <T>(
  key: string,
  value: T,
  config?: CacheConfig
): Promise<void> => {
  const cacheKey = CACHE_PREFIX + key;
  const ttl = config?.ttl || DEFAULT_TTL;

  try {
    if (isRedisAvailable && redisClient) {
      await redisClient.setEx(cacheKey, ttl, JSON.stringify(value));
      return;
    }

    const expires = Date.now() + ttl * 1000;

    if (IN_MEMORY_CACHE.size >= CACHE_SIZE_LIMIT) {
      const oldestKey = Array.from(IN_MEMORY_CACHE.entries()).sort(
        (a, b) => a[1].expires - b[1].expires
      )[0]?.[0];

      if (oldestKey) {
        IN_MEMORY_CACHE.delete(oldestKey);
      }
    }

    IN_MEMORY_CACHE.set(cacheKey, { value, expires });
  } catch (error) {
    console.warn('[Cache] Set failed:', error);
  }
};

export const deleteCacheKey = async (key: string): Promise<void> => {
  const cacheKey = CACHE_PREFIX + key;

  try {
    if (isRedisAvailable && redisClient) {
      await redisClient.del(cacheKey);
    }
  } catch (error) {
    console.warn('[Cache] Redis delete failed:', error);
  }

  IN_MEMORY_CACHE.delete(cacheKey);
};

export const deleteCacheValue = deleteCacheKey;

export const clearCachePattern = async (pattern: string): Promise<void> => {
  const searchPattern = CACHE_PREFIX + pattern;

  try {
    if (isRedisAvailable && redisClient) {
      const keys = await redisClient.keys(searchPattern);
      if (keys.length > 0) {
        await redisClient.del(keys);
      }
      return;
    }
  } catch (error) {
    console.warn('[Cache] Redis pattern clear failed:', error);
  }

  for (const key of IN_MEMORY_CACHE.keys()) {
    if (key.startsWith(searchPattern.replace('*', ''))) {
      IN_MEMORY_CACHE.delete(key);
    }
  }
};

export const getCacheStats = async () => {
  let redisStats: any = null;

  if (isRedisAvailable && redisClient) {
    try {
      redisStats = await redisClient.info('memory');
    } catch (error) {
      console.warn('[Cache] Failed to get Redis stats:', error);
    }
  }

  return {
    redis: isRedisAvailable,
    redisStats,
    inMemorySize: IN_MEMORY_CACHE.size,
    maxInMemory: CACHE_SIZE_LIMIT,
  };
};

export const generateRequirementsCacheKey = (params: {
  userId: string;
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  minRate?: string;
  maxRate?: string;
  remoteFilter?: string;
  sortBy?: string;
  sortOrder?: string;
}) => {
  const sorted = Object.keys(params)
    .sort()
    .reduce((acc, key) => {
      if ((params as any)[key]) {
        acc[key] = (params as any)[key];
      }
      return acc;
    }, {} as any);

  return `requirements:${JSON.stringify(sorted)}`;
};

export default {
  getCacheValue,
  setCacheValue,
  deleteCacheKey,
  clearCachePattern,
  getCacheStats,
  initializeRedis,
};
