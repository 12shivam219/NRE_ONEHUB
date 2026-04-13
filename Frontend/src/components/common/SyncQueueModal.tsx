import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, CloudLightning, AlertCircle } from 'lucide-react';
import { Modal } from './Modal';
import { useSyncQueue, useSyncStatus } from '../../hooks/useSyncStatus';
import { processSyncQueue } from '../../lib/offlineDB';

export const SyncQueueModal = () => {
  const { syncStatus, refresh } = useSyncStatus();
  const { pendingItems, pendingCount, clearSynced, updateItemStatus } = useSyncQueue();

  const [isOpen, setIsOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const openHandler = () => setIsOpen(true);
    window.addEventListener('open-sync-queue', openHandler);
    return () => window.removeEventListener('open-sync-queue', openHandler);
  }, []);

  const failedCount = useMemo(
    () => pendingItems.filter((it) => it.status === 'failed').length,
    [pendingItems]
  );

  const handleClose = useCallback(() => setIsOpen(false), []);

  const handleProcess = useCallback(async () => {
    if (pendingCount === 0) return;
    setIsProcessing(true);
    try {
      await processSyncQueue(50);
      window.dispatchEvent(new CustomEvent('sync-complete'));
      await refresh();
    } finally {
      setIsProcessing(false);
    }
  }, [pendingCount, refresh]);

  const handleClear = useCallback(async () => {
    await clearSynced();
    window.dispatchEvent(new CustomEvent('sync-complete'));
    await refresh();
  }, [clearSynced, refresh]);

  const handleRetryFailed = useCallback(async () => {
    const failed = pendingItems.filter((it) => it.status === 'failed');
    if (failed.length === 0) return;

    setIsProcessing(true);
    try {
      for (const item of failed) {
        await updateItemStatus(item.id, 'pending');
      }
      window.dispatchEvent(new CustomEvent('sync-queue-changed'));
      await refresh();
    } finally {
      setIsProcessing(false);
    }
  }, [pendingItems, updateItemStatus, refresh]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Sync Queue"
      size="lg"
    >
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="text-xs font-body text-[color:var(--text)]">
            <div>
              Pending items: <span className="font-heading font-bold">{pendingCount}</span>
            </div>
            <div>
              Status:{' '}
              <span className="font-heading font-bold">
                {syncStatus?.isSyncing ? 'Syncing…' : 'Idle'}
              </span>
              {failedCount > 0 && (
                <span className="ml-2 text-xs text-red-600">
                  {failedCount} failed
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleProcess}
              disabled={isProcessing || pendingCount === 0}
              className="px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-600 disabled:bg-opacity-30 disabled:text-slate-500 transition flex items-center gap-2 font-heading font-bold"
            >
              <CloudLightning className="w-4 h-4" />
              {isProcessing ? 'Processing…' : 'Process'}
            </button>

            <button
              onClick={handleClear}
              className="px-3 py-2 rounded-lg bg-white text-slate-900 hover:bg-slate-50 transition flex items-center gap-2 border border-gray-200 font-heading font-bold"
            >
              <RefreshCw className="w-4 h-4" />
              Clear
            </button>

            <button
              onClick={handleRetryFailed}
              disabled={isProcessing || failedCount === 0}
              className="px-3 py-2 rounded-lg bg-red-500 bg-opacity-10 text-red-600 hover:bg-opacity-20 disabled:bg-slate-100 disabled:bg-opacity-100 disabled:text-slate-500 transition flex items-center gap-2 font-heading font-bold border border-red-500 border-opacity-20"
            >
              <AlertCircle className="w-4 h-4" />
              Retry failed
            </button>
          </div>
        </div>

        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="max-h-[50vh] overflow-y-auto bg-slate-50 bg-opacity-50">
            {pendingItems.length === 0 ? (
              <div className="p-4 text-xs font-body text-slate-500">No items in queue.</div>
            ) : (
              pendingItems.slice(0, 100).map((item) => (
                <div key={item.id} className="p-3 border-b border-gray-200">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-heading font-bold text-[color:var(--text)]">
                        {item.entityType} · {item.operation}
                      </div>
                      <div className="text-xs font-body text-[color:var(--text-secondary)] truncate">
                        {item.entityId}
                      </div>
                      <div className="text-xs font-body text-[color:var(--text-secondary)] mt-1">
                        Status: {item.status} · Retries: {item.retries}
                        {item.nextAttempt ? ` · Next: ${new Date(item.nextAttempt).toLocaleString()}` : ''}
                      </div>
                      {item.lastError && (
                        <div className="text-xs font-body text-red-600 mt-1 break-words">
                          {item.lastError}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          {pendingItems.length > 100 && (
            <div className="p-3 text-xs font-body text-[color:var(--text-secondary)] bg-[color:var(--darkbg-surface-light)]">
              Showing 100 of {pendingItems.length} items.
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
