/**
 * Cache Management Utilities
 * Centralized functions for cache invalidation and management
 */

import { deleteCacheValue } from './redis';

/**
 * Cache keys used throughout the application
 */
export const CACHE_KEYS = {
  ADMIN_STATS: 'admin:approval_stats',
  REQUIREMENT_PAGE: (userId: string, page: number, pageSize: number) =>
    `requirements:page:${userId}:${page}:${pageSize}`,
  CONSULTANT_PAGE: (userId: string, page: number, pageSize: number) =>
    `consultants:page:${userId}:${page}:${pageSize}`,
  INTERVIEW_PAGE: (userId: string, page: number, pageSize: number) =>
    `interviews:page:${userId}:${page}:${pageSize}`,
  DOCUMENT_PAGE: (userId: string, page: number, pageSize: number) =>
    `documents:page:${userId}:${page}:${pageSize}`,
  REQUIREMENT_STATS: (userId: string) => `requirements:stats:${userId}`,
  INTERVIEW_STATS: (userId: string) => `interviews:stats:${userId}`,
  USER_PROFILE: (userId: string) => `user:profile:${userId}`,
  SEARCH_RESULTS: (userId: string, term: string) =>
    `search:${userId}:${term}`,
} as const;

/**
 * Invalidate all cache for a specific user
 * Call after user makes changes
 */
export const invalidateUserCache = async (userId: string): Promise<void> => {
  const keysToInvalidate = [
    CACHE_KEYS.REQUIREMENT_STATS(userId),
    CACHE_KEYS.INTERVIEW_STATS(userId),
    CACHE_KEYS.USER_PROFILE(userId),
  ];

  for (const key of keysToInvalidate) {
    try {
      await deleteCacheValue(key);
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.warn(`Failed to invalidate cache key: ${key}`, err);
      }
    }
  }
};

/**
 * Invalidate user's paginated lists (requirements, interviews, consultants, documents)
 * Call after creating/updating/deleting items
 */
export const invalidateUserListsCache = async (userId: string): Promise<void> => {
  // Since pagination uses cursors, we only need to invalidate the first page
  // Subsequent pages will automatically reflect changes due to cursor-based approach
  const firstPageKeys = [
    CACHE_KEYS.REQUIREMENT_PAGE(userId, 0, 50),
    CACHE_KEYS.CONSULTANT_PAGE(userId, 0, 50),
    CACHE_KEYS.INTERVIEW_PAGE(userId, 0, 50),
    CACHE_KEYS.DOCUMENT_PAGE(userId, 0, 50),
  ];

  for (const key of firstPageKeys) {
    try {
      await deleteCacheValue(key);
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.warn(`Failed to invalidate cache key: ${key}`, err);
      }
    }
  }
};

/**
 * Invalidate all admin cache
 * Call after admin makes changes to users
 */
export const invalidateAdminCache = async (): Promise<void> => {
  try {
    await deleteCacheValue(CACHE_KEYS.ADMIN_STATS);
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('Failed to invalidate admin cache', err);
    }
  }
};

/**
 * Clear all application cache
 * Use cautiously - call only when necessary
 */
export const clearAllCache = async (): Promise<void> => {
  // In production, this would iterate through all known keys
  // For now, just clear the most critical ones
  const criticalKeys = [
    CACHE_KEYS.ADMIN_STATS,
  ];

  for (const key of criticalKeys) {
    try {
      await deleteCacheValue(key);
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.warn(`Failed to clear cache key: ${key}`, err);
      }
    }
  }
};
