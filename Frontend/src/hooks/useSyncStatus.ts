import { useEffect, useState, useCallback } from 'react';
import {
  getPendingSyncItems,
  updateSyncItemStatus,
  clearSyncedItems,
  getSyncStatus as fetchSyncStatus,
} from '../lib/offlineDB';
import type { SyncStatus, SyncQueueItem } from '../lib/offlineDB';

/**
 * Feature 6: Hook for tracking sync progress
 * Provides real-time sync status for UI updates
 */
export function useSyncStatus() {
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const updateStatus = async () => {
      const status = await fetchSyncStatus();
      setSyncStatus((prev) => {
        if (!prev && !status) return prev;
        if (!prev || !status) return status;
        const same =
          prev.isSyncing === status.isSyncing &&
          prev.itemsRemaining === status.itemsRemaining &&
          prev.lastSyncTime === status.lastSyncTime &&
          prev.failedItems === status.failedItems &&
          prev.progress === status.progress &&
          prev.totalItems === status.totalItems;
        return same ? prev : status;
      });
    };

    updateStatus();

    // Consolidate all sync event listeners into a single handler
    const handleSyncEvent = updateStatus as EventListener;
    const syncEvents = ['sync-complete', 'start-sync', 'sync-error', 'sync-queue-changed'];
    syncEvents.forEach(event => window.addEventListener(event, handleSyncEvent));

    return () => {
      syncEvents.forEach(event => window.removeEventListener(event, handleSyncEvent));
    };
  }, []);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    const status = await fetchSyncStatus();
    setSyncStatus(status);
    setIsRefreshing(false);
  }, []);

  return { syncStatus, refresh, isRefreshing };
}

/**
 * Hook for managing sync queue
 */
export function useSyncQueue() {
  const [pendingItems, setPendingItems] = useState<SyncQueueItem[]>([]);

  useEffect(() => {
    const loadPending = async () => {
      const items = await getPendingSyncItems();
      setPendingItems((prev) => {
        if (prev.length !== items.length) return items;
        for (let i = 0; i < prev.length; i++) {
          const a = prev[i];
          const b = items[i];
          if (
            a.id !== b.id ||
            a.status !== b.status ||
            a.retries !== b.retries ||
            a.timestamp !== b.timestamp ||
            a.nextAttempt !== b.nextAttempt ||
            a.lastError !== b.lastError
          ) {
            return items;
          }
        }
        return prev;
      });
    };

    loadPending();

    // Consolidate all sync event listeners into a single handler
    const onSyncEvent = (() => void loadPending()) as EventListener;
    const syncEvents = ['sync-complete', 'start-sync', 'sync-error', 'sync-queue-changed'];
    syncEvents.forEach(event => window.addEventListener(event, onSyncEvent));

    return () => {
      syncEvents.forEach(event => window.removeEventListener(event, onSyncEvent));
    };
  }, []);

  const updateItemStatus = useCallback(
    async (itemId: string, status: SyncQueueItem['status'], error?: string) => {
      await updateSyncItemStatus(itemId, status, error);
      const items = await getPendingSyncItems();
      setPendingItems(items);
    },
    []
  );

  const clearSynced = useCallback(async () => {
    await clearSyncedItems();
    const items = await getPendingSyncItems();
    setPendingItems(items);
  }, []);

  return {
    pendingItems,
    updateItemStatus,
    clearSynced,
    pendingCount: pendingItems.length,
  };
}
