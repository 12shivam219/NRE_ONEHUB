import { useEffect, useState } from 'react';
import { useOfflineCache } from '../../hooks/useOfflineCache';

export function UnsyncedDraftsPanel(): JSX.Element | null {
  const { getAllDrafts, forceSync, hasPendingSync } = useOfflineCache();
  const [drafts, setDrafts] = useState<Array<{ key: string; value: string; updatedAt: number }>>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const all = await getAllDrafts();
        if (mounted) setDrafts(all);
      } catch (err) {
        console.error('Failed to load drafts for panel', err);
      }
    })();
    return () => { mounted = false; };
  }, [getAllDrafts, hasPendingSync]);

  if (drafts.length === 0) return null;

  return (
    <div className="fixed bottom-6 left-6 z-[1400] w-80 bg-white border rounded shadow p-3">
      <div className="flex items-center justify-between mb-2">
        <strong>Unsynced Drafts</strong>
        <button
          className="text-sm px-2 py-1 bg-sky-600 text-white rounded"
          onClick={async () => { await forceSync(); }}
        >
          Force sync
        </button>
      </div>
      <div className="text-xs text-slate-600">
        {drafts.map(d => (
          <div key={d.key} className="mb-1 truncate">
            • {d.key}
          </div>
        ))}
      </div>
    </div>
  );
}

export default UnsyncedDraftsPanel;
