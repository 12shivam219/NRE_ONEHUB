import { useEffect, useState } from 'react';
import { Clock, CheckCircle, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useSyncStatus, useSyncQueue } from '../../hooks/useSyncStatus';
import { useCacheAnalytics } from '../../hooks/useCacheAnalytics';
import { processSyncQueue } from '../../lib/offlineDB';
import { LogoLoader } from '../common/LogoLoader';

/**
 * Feature 6 & 10: Sync Dashboard Component
 * Real-time sync progress and analytics display
 */
export const SyncDashboard = () => {
  const { syncStatus, refresh } = useSyncStatus();
  const { analytics } = useCacheAnalytics();
  const { pendingItems, updateItemStatus, clearSynced, pendingCount } = useSyncQueue();
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [showSyncPanel, setShowSyncPanel] = useState(false);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);

  useEffect(() => {
    if (syncStatus?.lastSyncTime) {
      setLastSyncTime(new Date(syncStatus.lastSyncTime));
    }
  }, [syncStatus?.lastSyncTime]);

  const getStatusColor = (progress: number) => {
    if (progress === 100) return 'text-green-600';
    if (progress >= 50) return 'text-blue-600';
    return 'text-orange-600';
  };

  const getProgressBarColor = (progress: number) => {
    if (progress === 100) return 'bg-green-500';
    if (progress >= 50) return 'bg-blue-500';
    return 'bg-orange-500';
  };

  return (
    <div className="space-y-6">
      {/* Sync Status Card */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary-600" />
            <h3 className="font-medium text-gray-900">Sync Status</h3>
          </div>
          <button
            onClick={refresh}
            className="px-3 py-1 bg-gray-100 text-gray-700 text-xs rounded-lg hover:bg-gray-200 transition"
          >
            Refresh
          </button>
        </div>

        {syncStatus && (
          <div className="space-y-4">
            {/* Status Indicator */}
            <div className="flex items-center gap-2">
              {syncStatus.isSyncing ? (
                <span className="w-5 h-5"><LogoLoader size="sm" /></span>
              ) : syncStatus.failedItems > 0 ? (
                <AlertCircle className="w-5 h-5 text-red-500" />
              ) : (
                <CheckCircle className="w-5 h-5 text-green-500" />
              )}
              <span className={`font-medium ${getStatusColor(syncStatus.progress)}`}>
                {syncStatus.isSyncing
                  ? 'Syncing...'
                  : syncStatus.failedItems > 0
                    ? 'Sync Failed'
                    : 'Synced'}
              </span>
            </div>

            {/* Progress Information */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-gray-600">Items Synced:</span>
                <span className="font-medium text-gray-900">
                  {syncStatus.totalItems - syncStatus.itemsRemaining} / {syncStatus.totalItems}
                </span>
              </div>

              {/* Progress Bar */}
              {syncStatus.totalItems > 0 && (
                <div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${getProgressBarColor(
                        syncStatus.progress
                      )}`}
                      style={{ width: `${syncStatus.progress}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 text-right mt-1">
                    {syncStatus.progress}% complete
                  </p>
                </div>
              )}
            </div>

            {/* Last Sync Time */}
            {lastSyncTime && (
              <p className="text-xs text-gray-500">
                Last sync: {lastSyncTime.toLocaleString()}
              </p>
            )}

            {/* Failed Items Warning */}
            {syncStatus.failedItems > 0 && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-xs text-red-700">
                  ⚠️ {syncStatus.failedItems} item{syncStatus.failedItems !== 1 ? 's' : ''} failed to sync.
                  Try again when online.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Analytics Card */}
      {analytics && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="font-medium text-gray-900 mb-4">Offline Statistics</h3>

          <div className="grid grid-cols-2 gap-4">
            {/* Offline Time */}
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-600">Offline Time</p>
              <p className="text-xs font-medium text-gray-900">
                {analytics.offlineTime} <span className="text-xs text-gray-600">min</span>
              </p>
            </div>

            {/* Created Offline */}
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-600">Created Offline</p>
              <p className="text-xs font-medium text-gray-900">
                {analytics.itemsCreatedOffline}
              </p>
            </div>

            {/* Updated Offline */}
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-600">Updated Offline</p>
              <p className="text-xs font-medium text-gray-900">
                {analytics.itemsUpdatedOffline}
              </p>
            </div>

            {/* Deleted Offline */}
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-600">Deleted Offline</p>
              <p className="text-xs font-medium text-gray-900">
                {analytics.itemsDeletedOffline}
              </p>
            </div>

            {/* Sync Success Rate */}
            <div className="p-3 bg-gray-50 rounded-lg col-span-2">
              <p className="text-xs text-gray-600">Sync Success Rate</p>
              <div className="flex items-center gap-2 mt-1">
                <div className="flex-1 bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-green-500 h-2 rounded-full transition-all"
                    style={{ width: `${analytics.syncSuccessRate}%` }}
                  />
                </div>
                <span className="text-xs font-medium text-gray-900">
                  {analytics.syncSuccessRate}%
                </span>
              </div>
            </div>

            {/* Total Syncs */}
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-600">Total Sync Events</p>
              <p className="text-xs font-medium text-gray-900">
                {analytics.totalSyncEvents}
              </p>
            </div>

            {/* Average Sync Time */}
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-600">Avg Sync Time</p>
              <p className="text-xs font-medium text-gray-900">
                {Math.round(analytics.averageSyncTime)} <span className="text-xs text-gray-600">ms</span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Sync Queue Panel */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setShowSyncPanel(!showSyncPanel)}
            className="flex items-center gap-2 font-medium text-gray-900 hover:text-primary-600 transition"
          >
            {showSyncPanel ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            Sync Queue ({pendingCount})
          </button>
        </div>

        {showSyncPanel && (
          <div className="space-y-3 border-t border-gray-200 pt-4">
            {pendingItems.length === 0 ? (
              <div className="py-4 text-center text-xs text-gray-500">No items in queue</div>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <button
                    onClick={async () => {
                      setIsProcessingQueue(true);
                      try {
                        await processSyncQueue(pendingItems.length);
                        window.dispatchEvent(new CustomEvent('sync-complete'));
                      } finally {
                        setIsProcessingQueue(false);
                      }
                    }}
                    className="px-3 py-1 bg-primary-600 text-white rounded text-xs hover:bg-primary-700 transition"
                    disabled={isProcessingQueue || pendingItems.length === 0}
                  >
                    {isProcessingQueue ? 'Processing...' : 'Process Queue'}
                  </button>
                  <button
                    onClick={async () => {
                      await clearSynced();
                      window.dispatchEvent(new CustomEvent('sync-complete'));
                    }}
                    className="px-3 py-1 border border-gray-300 rounded text-xs hover:bg-gray-50 transition"
                  >
                    Clear Synced
                  </button>
                  <div className="text-xs text-gray-600 ml-auto">
                    Pending: <span className="font-medium text-gray-800">{pendingCount}</span>
                  </div>
                </div>

                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {pendingItems.slice(0, 10).map(item => (
                    <div key={item.id} className="flex items-start justify-between p-3 bg-gray-50 border border-gray-200 rounded hover:bg-gray-100 transition">
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium text-gray-900">{item.entityType} · {item.operation}</div>
                        <div className="text-xs text-gray-600 truncate">ID: {item.entityId} • Retries: {item.retries}</div>
                        {item.lastError && <div className="text-xs text-red-600 mt-1 truncate">⚠️ {item.lastError}</div>}
                      </div>
                      <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                        <button
                          onClick={async () => {
                            setIsProcessingQueue(true);
                            try {
                              await processSyncQueue(1);
                              window.dispatchEvent(new CustomEvent('sync-complete'));
                            } finally {
                              setIsProcessingQueue(false);
                            }
                          }}
                          className="px-2 py-1 bg-primary-100 text-primary-800 rounded text-xs hover:bg-primary-200 transition"
                        >
                          Retry
                        </button>
                        <button
                          onClick={async () => {
                            await updateItemStatus(item.id, 'failed', 'Marked failed via UI');
                            window.dispatchEvent(new CustomEvent('sync-complete'));
                          }}
                          className="px-2 py-1 border border-gray-300 rounded text-xs hover:bg-red-50 transition"
                        >
                          Mark Failed
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {pendingItems.length > 10 && (
                  <div className="text-xs text-gray-500 text-center pt-2">
                    Showing 10 of {pendingItems.length} pending items
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
