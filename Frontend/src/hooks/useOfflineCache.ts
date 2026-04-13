/**
 * Hook for managing offline database and cache
 * Integrates IndexedDB caching throughout the app
 * Enhanced with sync queue, preloading, and analytics
 */

import { useEffect, useCallback, useState } from 'react';
import {
  cacheRequirements,
  getCachedRequirements,
  clearOfflineCache,
  preloadUserData,
  registerBackgroundSync,
  recordAnalytics,
  addToSyncQueue,
  getPendingSyncItems,
  processSyncQueue,
  updateLastSyncTime,
  saveDraft,
  getDraft,
  clearDraft,
  migrateLocalDraftsToIndexedDB,
  getAllDrafts,
  pruneOldDrafts,
  enforceDraftStorageLimits,
  type SyncQueueItem,
} from '../lib/offlineDB';
import { useToast } from '../contexts/ToastContext';

export function useOfflineCache() {
  const [isOnline, setIsOnline] = useState(() => {
    // Initialize from navigator.onLine immediately
    return navigator.onLine;
  });
  const [hasPendingSync, setHasPendingSync] = useState(false);
  const { showToast } = useToast();
  const [isLeader, setIsLeader] = useState(false);

  // Leader election: prefer BroadcastChannel for robust cross-tab coordination
  // Fallback: localStorage heartbeat for older browsers
  useEffect(() => {
    const tabId = (typeof crypto !== 'undefined' && (crypto as any).randomUUID) ? (crypto as any).randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const CHANNEL = 'offline_leader_v1';
    let bc: BroadcastChannel | null = null;
    let bcClaimed = false;
    let bcHeartbeatIv: number | null = null;
    let lsIv: number | null = null;

    const localStorageFallback = () => {
      const LEADER_KEY = CHANNEL;
      const tryClaim = () => {
        try {
          const raw = localStorage.getItem(LEADER_KEY);
          const now = Date.now();
          if (!raw) {
            localStorage.setItem(LEADER_KEY, JSON.stringify({ id: tabId, ts: now }));
            setIsLeader(true);
            return;
          }
          const obj = JSON.parse(raw);
          if (!obj || !obj.ts || (now - obj.ts) > 10000) {
            localStorage.setItem(LEADER_KEY, JSON.stringify({ id: tabId, ts: now }));
            setIsLeader(true);
            return;
          }
          setIsLeader(obj.id === tabId);
        } catch (err) {
          console.debug('[offline] ls-election error', err);
          setIsLeader(false);
        }
      };

      tryClaim();
      lsIv = window.setInterval(() => {
        try {
          const raw = localStorage.getItem(LEADER_KEY);
          const now = Date.now();
          if (!raw) {
            localStorage.setItem(LEADER_KEY, JSON.stringify({ id: tabId, ts: now }));
            setIsLeader(true);
            return;
          }
          const obj = JSON.parse(raw);
          if (obj.id === tabId) {
            localStorage.setItem(LEADER_KEY, JSON.stringify({ id: tabId, ts: now }));
            setIsLeader(true);
          } else if ((now - obj.ts) > 10000) {
            // stale - take over
            localStorage.setItem(LEADER_KEY, JSON.stringify({ id: tabId, ts: now }));
            setIsLeader(true);
          } else {
            setIsLeader(false);
          }
        } catch (err) {
          console.debug('[offline] ls-heartbeat error', err);
          setIsLeader(false);
        }
      }, 5000);

      const cleanupLS = () => {
        try {
          const raw = localStorage.getItem(LEADER_KEY);
          if (raw) {
            const obj = JSON.parse(raw);
            if (obj.id === tabId) localStorage.removeItem(LEADER_KEY);
          }
        } catch (err) {
          console.debug('[offline] ls-cleanup error', err);
        }
        if (lsIv) {
          clearInterval(lsIv);
          lsIv = null;
        }
      };

      window.addEventListener('beforeunload', cleanupLS);
      return () => {
        window.removeEventListener('beforeunload', cleanupLS);
        cleanupLS();
      };
    };

    // Try BroadcastChannel first
    try {
      if (typeof (window as any).BroadcastChannel !== 'undefined') {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        bc = new BroadcastChannel(CHANNEL);
        let seenLeader = false;

        const onMessage = (ev: MessageEvent) => {
          const msg = ev.data;
          if (!msg || !msg.type) return;
          if (msg.type === 'whois') {
            // if we're leader, announce
            if (bcClaimed) {
              bc?.postMessage({ type: 'i-am', id: tabId, ts: Date.now() });
            }
          } else if (msg.type === 'i-am') {
            // someone claimed leadership
            seenLeader = true;
            setIsLeader(msg.id === tabId);
          } else if (msg.type === 'release') {
            // leader released, re-run claiming
            if (!seenLeader) {
              // allow takeover quickly
              bc?.postMessage({ type: 'i-am', id: tabId, ts: Date.now() });
              bcClaimed = true;
              setIsLeader(true);
            }
          }
        };

        bc.addEventListener('message', onMessage as EventListener);

        // Ask who's leader; wait briefly for responses
        bc.postMessage({ type: 'whois' });
        const claimTimeout = window.setTimeout(() => {
          if (!seenLeader) {
            // claim leadership
            bc?.postMessage({ type: 'i-am', id: tabId, ts: Date.now() });
            bcClaimed = true;
            setIsLeader(true);
          }
        }, 250);

        // Heartbeat: if leader, announce periodically so others know we're alive
        bcHeartbeatIv = window.setInterval(() => {
          try {
            if (bcClaimed) {
              bc?.postMessage({ type: 'i-am', id: tabId, ts: Date.now() });
              // Leader can also perform periodic maintenance like pruning
              void enforceDraftStorageLimits({ maxEntries: 1000, maxTotalBytes: 5 * 1024 * 1024 });
            }
          } catch (err) {
            console.debug('[offline] bc-heartbeat error', err);
          }
        }, 5000);

        const cleanupBC = () => {
          try {
            if (bcClaimed) bc?.postMessage({ type: 'release', id: tabId });
          } catch (err) {
            console.debug('[offline] bc-cleanup error', err);
          }
          if (bcHeartbeatIv) {
            clearInterval(bcHeartbeatIv);
            bcHeartbeatIv = null;
          }
          try {
            bc?.removeEventListener('message', onMessage as EventListener);
            bc?.close();
            bc = null;
          } catch (err) {
            console.debug('[offline] bc-close error', err);
          }
          clearTimeout(claimTimeout);
        };

        window.addEventListener('beforeunload', cleanupBC);
        return () => {
          window.removeEventListener('beforeunload', cleanupBC);
          cleanupBC();
        };
      }
    } catch (err) {
      console.debug('[offline] BroadcastChannel error, falling back to localStorage', err);
    }

    // If BroadcastChannel not available or failed, use localStorage fallback
    const cleanupLSFn = localStorageFallback();
    // Schedule periodic pruning for LS fallback leader as well
    const lsPruneIv = window.setInterval(() => {
      try {
        // only leader performs maintenance
        if (localStorage.getItem('offline_leader_v1')) {
          void enforceDraftStorageLimits({ maxEntries: 1000, maxTotalBytes: 5 * 1024 * 1024 });
        }
      } catch (err) {
        console.debug('[offline] ls-prune error', err);
      }
    }, 60 * 60 * 1000); // hourly

    return () => {
      try { if (lsPruneIv) clearInterval(lsPruneIv); } catch (err) { console.debug('[offline] clear lsPruneIv', err); }
      try { cleanupLSFn(); } catch (err) { console.debug('[offline] cleanupLSFn error', err); }
    };
  }, []);

  // Only sync state values directly via closure
  // Remove unnecessary ref synchronization

  // Function to sync pending items
  const syncPendingItems = useCallback(async () => {
    try {
      const pending = await getPendingSyncItems();
      if (pending.length === 0) return;

      // Only sync items that are eligible to be processed now (respect nextAttempt backoff)
      const now = Date.now();
      const due = pending.filter((it) => !it.nextAttempt || it.nextAttempt <= now);
      if (due.length === 0) return;

      console.log(`Syncing ${due.length} pending items...`);

      const startTime = Date.now();

      // Dispatch start-sync event BEFORE processing
      window.dispatchEvent(
        new CustomEvent('start-sync', { detail: { items: due } })
      );

      // Actually process the sync queue in batches
      const result = await processSyncQueue(20);
      
      // Update last sync time
      await updateLastSyncTime();

      // Record analytics
      const duration = Date.now() - startTime;
      await recordAnalytics('sync_complete', {
        itemsSynced: result.processed,
        timeMs: duration,
      });

      // Dispatch completion event AFTER processing
      window.dispatchEvent(new CustomEvent('sync-complete', { 
        detail: { 
          processed: result.processed, 
          failed: result.failed,
          conflicts: result.conflicts || 0
        } 
      }));

      // Update pending-sync flag
      const pendingNow = (await getPendingSyncItems()).length > 0;
      setHasPendingSync(pendingNow);

      // Show warning if conflicts detected
      if (result.conflicts && result.conflicts > 0) {
        console.warn(`[Sync] ${result.conflicts} conflict(s) detected - local version applied`);
        window.dispatchEvent(new CustomEvent('sync-conflicts', { 
          detail: { conflictCount: result.conflicts } 
        }));
      }

      console.log(`Sync completed: ${result.processed} processed, ${result.failed} failed, ${result.conflicts || 0} conflicts`);
    } catch (error) {
      console.error('Failed to sync pending items:', error);
      window.dispatchEvent(new CustomEvent('sync-error', { detail: { error: String(error) } }));
    }
  }, []);

  // One-time initialization of event listeners (runs once on mount)
  useEffect(() => {
    // Register background sync once
    void registerBackgroundSync();
    // Migrate drafts from localStorage into IndexedDB on first run
    void (async () => {
      try {
        const migrated = await migrateLocalDraftsToIndexedDB();
        if (migrated > 0) {
          console.log(`[offline] Migrated ${migrated} drafts to IndexedDB`);
          try {
            showToast?.({
              title: 'Draft migration',
              message: `Migrated ${migrated} drafts to IndexedDB.`,
              type: 'info',
              durationMs: 5000,
            });
          } catch {
            // swallow
          }
        }
        // Run pruning of very old drafts as housekeeping
        try {
          const pruned = await pruneOldDrafts();
          if (pruned > 0) {
            console.log(`[offline] Pruned ${pruned} old drafts`);
          }
        } catch (pe) {
          console.debug('[offline] prune failed', pe);
        }
      } catch (e) {
        console.warn('[offline] Draft migration failed', e);
      }
    })();
  }, [showToast]);

  const forceSync = useCallback(async () => {
    await syncPendingItems();
  }, [syncPendingItems]);

  // Register online/offline and interaction handlers - only depends on syncPendingItems
  useEffect(() => {
    const handleOnline = () => {
      console.log('App is online - syncing cache');
      setIsOnline(true);

      // Log offline duration if we were offline (tracked via closure in handleOffline)
      // This would need to be refactored to use refs if offline duration tracking is needed

      // Auto sync pending items immediately when coming back online
      if (isLeader) void syncPendingItems();
    };

    const handleOffline = () => {
      console.log('App is offline - using cache');
      setIsOnline(false);
    };

    // Handle window focus to sync when user comes back to app
    const handleFocus = () => {
      // Check current online state directly instead of relying on state value
      if (navigator.onLine && isLeader) {
        void syncPendingItems();
      }
    };

    const handleRetrySync = () => {
      if (navigator.onLine && isLeader) {
        void syncPendingItems();
      }
    };

    const handleQueueChanged = () => {
      // Re-evaluate pending sync flag and trigger sync if online
      (async () => {
        const pending = await getPendingSyncItems();
        setHasPendingSync(pending.length > 0);
        if (navigator.onLine && isLeader) {
          void syncPendingItems();
        }
      })();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('retry-sync', handleRetrySync as EventListener);
    window.addEventListener('sync-queue-changed', handleQueueChanged as EventListener);

    // beforeunload guard: show confirmation if offline and pending sync or drafts exist
    const beforeUnload = (e: BeforeUnloadEvent) => {
      // Use synchronous localStorage check as beforeunload cannot be async
      const hasDraft = !!localStorage.getItem('offline_draft:unsaved');
      if (!navigator.onLine && (hasPendingSync || hasDraft)) {
        e.preventDefault();
        e.returnValue = '';
        // Notify UI that reload was blocked so a toast/modal can be shown
        window.dispatchEvent(new Event('reload-blocked'));
        return '';
      }
      return undefined;
    };

    const keydownHandler = (e: KeyboardEvent) => {
      if (!navigator.onLine) {
        const isReload = e.key === 'F5' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r');
        const hasDraft = !!localStorage.getItem('offline_draft:unsaved');
        if (isReload && (hasPendingSync || hasDraft)) {
          e.preventDefault();
          // Dispatch event so UI can show a toast/modal explaining reload is disabled
          window.dispatchEvent(new Event('reload-blocked'));
        }
      }
    };

    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('keydown', keydownHandler as EventListener);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('retry-sync', handleRetrySync as EventListener);
      window.removeEventListener('sync-queue-changed', handleQueueChanged as EventListener);
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('keydown', keydownHandler as EventListener);
    };
  }, [syncPendingItems, hasPendingSync, isLeader]);

  // Listen for messages from the service worker (background sync trigger)
  useEffect(() => {
    const handleSWMessage = (e: Event) => {
      const data = (e as MessageEvent).data;
      if (!data || !data.type) return;
      if (data.type === 'background-sync') {
        if (isLeader) void syncPendingItems();
      }
    };

    if (navigator.serviceWorker && 'addEventListener' in navigator.serviceWorker) {
      (navigator.serviceWorker as unknown as EventTarget).addEventListener('message', handleSWMessage);
    }

    window.addEventListener('message', handleSWMessage);

    return () => {
      if (navigator.serviceWorker && 'removeEventListener' in navigator.serviceWorker) {
        (navigator.serviceWorker as unknown as EventTarget).removeEventListener('message', handleSWMessage);
      }
      window.removeEventListener('message', handleSWMessage);
    };
  }, [syncPendingItems, isLeader]);

  // Function to clear cache on logout
  const handleLogout = useCallback(async () => {
    await clearOfflineCache();
  }, []);

  // Function to add operation to sync queue
  const queueOfflineOperation = useCallback(
    async (
      operation: SyncQueueItem['operation'],
      entityType: SyncQueueItem['entityType'],
      entityId: string,
      payload: Record<string, unknown>
    ) => {
      const id = await addToSyncQueue(operation, entityType, entityId, payload);

      // Record analytics
      if (operation === 'CREATE') {
        await recordAnalytics('offline_create', { entityType });
      } else if (operation === 'UPDATE') {
        await recordAnalytics('offline_update', { entityType });
      } else if (operation === 'DELETE') {
        await recordAnalytics('offline_delete', { entityType });
      }

      return id;
    },
    []
  );

  // Function to preload data
  const preloadData = useCallback(async (userId?: string) => {
    try {
      await preloadUserData(userId);
    } catch (error) {
      console.error('Failed to preload user data:', error);
    }
  }, []);

  return {
    isOnline,
    hasPendingSync,
    handleLogout,
    cacheRequirements,
    getCachedRequirements,
    queueOfflineOperation,
    syncPendingItems,
    preloadData,
    saveDraft,
    getDraft,
    clearDraft,
    getAllDrafts,
    forceSync,
  };
}
