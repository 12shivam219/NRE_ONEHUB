import { useEffect, useState } from 'react';
import { Wifi, WifiOff, Info, X } from 'lucide-react';
import { getSyncStatus } from '../../lib/offlineDB';
import type { SyncStatus } from '../../lib/offlineDB';

/**
 * Feature 2: Offline Indicator UI Component
 * Shows users when they're offline with sync status
 * Also provides educational information about offline capabilities
 */
export const OfflineIndicator = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [showOfflineInfo, setShowOfflineInfo] = useState(false);
  const [hasSeenOfflineInfo, setHasSeenOfflineInfo] = useState(() => {
    // Check if user has seen the offline info before
    return localStorage.getItem('hasSeenOfflineInfo') === 'true';
  });

  useEffect(() => {
    const updateSyncStatus = async () => {
      const status = await getSyncStatus();
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

    const handleOnline = () => {
      console.log('[OfflineIndicator] Online event triggered');
      setIsOnline(true);
      void updateSyncStatus();
    };
    const handleOffline = () => {
      console.log('[OfflineIndicator] Offline event triggered');
      setIsOnline(false);
      
      // Show info banner on first offline experience (if not dismissed)
      if (!hasSeenOfflineInfo) {
        setShowOfflineInfo(true);
      }
      
      // Dispatch event for toast notification
      window.dispatchEvent(new CustomEvent('offline-mode-activated'));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    window.addEventListener('start-sync', updateSyncStatus as EventListener);
    window.addEventListener('sync-complete', updateSyncStatus as EventListener);
    window.addEventListener('sync-error', updateSyncStatus as EventListener);
    window.addEventListener('sync-queue-changed', updateSyncStatus as EventListener);

    void updateSyncStatus();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);

      window.removeEventListener('start-sync', updateSyncStatus as EventListener);
      window.removeEventListener('sync-complete', updateSyncStatus as EventListener);
      window.removeEventListener('sync-error', updateSyncStatus as EventListener);
      window.removeEventListener('sync-queue-changed', updateSyncStatus as EventListener);
    };
  }, [hasSeenOfflineInfo]);

  if (isOnline && (!syncStatus?.isSyncing || syncStatus.progress === 100)) {
    return null;
  }

  // Offline mode
  if (!isOnline) {
    return (
      <>
        <div id="offline-indicator" className="fixed bottom-4 left-4 z-50 bg-amber-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 max-w-sm border border-amber-700">
          <WifiOff className="w-5 h-5 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-medium font-heading">Working offline</p>
            <p className="text-xs opacity-90 font-body">Changes will sync when online</p>
          </div>
          {!hasSeenOfflineInfo && (
            <button
              onClick={() => setShowOfflineInfo(true)}
              className="ml-2 p-1 hover:bg-amber-700 rounded transition-colors"
              aria-label="Learn more about offline mode"
              title="Learn more about offline mode"
            >
              <Info className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Educational Info Banner - Shows on first offline experience */}
        {showOfflineInfo && !hasSeenOfflineInfo && (
          <div className="fixed bottom-24 left-4 z-50 bg-blue-600 text-white px-5 py-4 rounded-lg shadow-xl max-w-md transform transition-all duration-300 ease-out border border-blue-700">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-medium text-xs mb-2 font-heading">✨ Offline Mode Active</h3>
                <p className="text-xs opacity-95 mb-3 font-body">
                  You can continue working offline! Create, edit, and delete requirements. 
                  All changes will automatically sync when you're back online.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setShowOfflineInfo(false);
                      setHasSeenOfflineInfo(true);
                      localStorage.setItem('hasSeenOfflineInfo', 'true');
                    }}
                    className="px-3 py-1.5 bg-white text-blue-600 hover:bg-blue-50 rounded text-xs font-medium transition-colors border border-blue-200 font-heading"
                  >
                    Got it!
                  </button>
                  <button
                    onClick={() => setShowOfflineInfo(false)}
                    className="px-3 py-1.5 bg-white bg-opacity-20 text-white hover:bg-opacity-30 rounded text-xs font-medium transition-colors font-body"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowOfflineInfo(false);
                  setHasSeenOfflineInfo(true);
                  localStorage.setItem('hasSeenOfflineInfo', 'true');
                }}
                className="p-1 hover:bg-blue-500 rounded transition-colors flex-shrink-0"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  // Syncing mode
  if (syncStatus?.isSyncing) {
    return (
      <div id="syncing-indicator" className="fixed bottom-4 left-4 z-50 bg-blue-600 text-white px-4 py-3 rounded-lg shadow-lg border border-blue-700">
        <div className="flex items-center gap-2 mb-2">
          <Wifi className="w-5 h-5 animate-pulse" />
          <p className="font-semibold font-heading">Syncing data</p>
        </div>
        <div className="w-48 bg-blue-300 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${syncStatus.progress}%` }}
          />
        </div>
        <p className="text-xs mt-1 opacity-90 font-body">
          {syncStatus.itemsRemaining} item{syncStatus.itemsRemaining !== 1 ? 's' : ''} remaining
        </p>
        {syncStatus.failedItems > 0 && (
          <p className="text-xs text-red-600 mt-1 font-body">
            ⚠️ {syncStatus.failedItems} item{syncStatus.failedItems !== 1 ? 's' : ''} failed
          </p>
        )}
      </div>
    );
  }

  return null;
};
