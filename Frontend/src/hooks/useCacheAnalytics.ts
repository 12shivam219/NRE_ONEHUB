import { useEffect, useState, useCallback } from 'react';
import { getCacheAnalytics, recordAnalytics } from '../lib/offlineDB';
import type { CacheAnalytics } from '../lib/offlineDB';

/**
 * Feature 10: Hook for tracking cache analytics
 * Monitor offline usage patterns and sync performance
 */
export function useCacheAnalytics() {
  const [analytics, setAnalytics] = useState<CacheAnalytics | undefined>();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadAnalytics = async () => {
      try {
        const data = await getCacheAnalytics();
        setAnalytics(data);
        setIsLoading(false);
      } catch (error) {
        console.error('Failed to load cache analytics:', error);
        setIsLoading(false);
      }
    };

    loadAnalytics();
  }, []);

  const logEvent = useCallback(
    async (event: string, data: Record<string, unknown>) => {
      await recordAnalytics(event, data);
      const updated = await getCacheAnalytics();
      setAnalytics(updated);
    },
    []
  );

  const logOfflineTime = useCallback(
    async (minutes: number) => {
      await logEvent('offline_time', { minutes });
    },
    [logEvent]
  );

  const logOfflineCreate = useCallback(
    async (entityType: string) => {
      await logEvent('offline_create', { entityType });
    },
    [logEvent]
  );

  const logOfflineUpdate = useCallback(
    async (entityType: string) => {
      await logEvent('offline_update', { entityType });
    },
    [logEvent]
  );

  const logOfflineDelete = useCallback(
    async (entityType: string) => {
      await logEvent('offline_delete', { entityType });
    },
    [logEvent]
  );

  const logSyncComplete = useCallback(
    async (itemsSynced: number, timeMs: number) => {
      await logEvent('sync_complete', { itemsSynced, timeMs });
    },
    [logEvent]
  );

  return {
    analytics,
    isLoading,
    logEvent,
    logOfflineTime,
    logOfflineCreate,
    logOfflineUpdate,
    logOfflineDelete,
    logSyncComplete,
  };
}
