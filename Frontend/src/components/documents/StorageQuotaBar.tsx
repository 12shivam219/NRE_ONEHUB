import { useEffect, useState, useCallback } from 'react';
import { AlertCircle, HardDrive, TrendingUp } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { getStorageUsage } from '../../lib/api/documents';

interface StorageInfo {
  used_gb: number;
  quota_gb: number;
  usage_percent: number;
  document_count: number;
  remaining_gb: number;
}

export function StorageQuotaBar() {
  const { user } = useAuth();
  const [usage, setUsage] = useState<StorageInfo | null>(null);
  const [loading, setLoading] = useState(false);

  const loadStorageUsage = useCallback(async () => {
    setLoading(true);
    const result = await getStorageUsage();
    if (result.success && result.usage) {
      setUsage(result.usage);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (user?.id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadStorageUsage();
    }
  }, [user?.id, loadStorageUsage, user]);

  if (!usage || loading) return null;

  const isWarning = usage.usage_percent >= 80 && usage.usage_percent < 95;
  const isCritical = usage.usage_percent >= 95;

  return (
    <div className={`p-4 rounded-lg border-2 ${
      isCritical ? 'bg-red-50 border-red-200' :
      isWarning ? 'bg-yellow-50 border-yellow-200' :
      'bg-blue-50 border-blue-200'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <HardDrive className={`w-5 h-5 ${
            isCritical ? 'text-red-600' :
            isWarning ? 'text-yellow-600' :
            'text-blue-600'
          }`} />
          <div>
            <p className="text-sm font-semibold text-gray-900">Storage Usage</p>
            <p className="text-xs text-gray-600">{usage.document_count} documents</p>
          </div>
        </div>
        <span className={`text-lg font-bold ${
          isCritical ? 'text-red-600' :
          isWarning ? 'text-yellow-600' :
          'text-blue-600'
        }`}>
          {usage.usage_percent.toFixed(0)}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-300 rounded-full h-2.5 overflow-hidden mb-2">
        <div
          className={`h-full transition-all ${
            isCritical ? 'bg-red-600' :
            isWarning ? 'bg-yellow-600' :
            'bg-blue-600'
          }`}
          style={{ width: `${Math.min(usage.usage_percent, 100)}%` }}
        />
      </div>

      {/* Stats */}
      <div className="flex items-center justify-between text-xs mb-3">
        <span className="text-gray-600">
          {usage.used_gb} GB of {usage.quota_gb} GB
        </span>
        <span className="text-gray-600">
          {usage.remaining_gb} GB remaining
        </span>
      </div>

      {/* Warnings */}
      {isCritical && (
        <div className="flex items-start gap-2 p-3 bg-red-100 rounded-md">
          <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-semibold text-red-800">Storage Full</p>
            <p className="text-red-700 text-xs">You've reached 95% of your storage. Delete files or upgrade your plan.</p>
          </div>
        </div>
      )}
      
      {isWarning && (
        <div className="flex items-start gap-2 p-3 bg-yellow-100 rounded-md">
          <AlertCircle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-semibold text-yellow-800">Storage Running Low</p>
            <p className="text-yellow-700 text-xs">Consider upgrading your plan to get more storage space.</p>
          </div>
        </div>
      )}

      {/* Info */}
      {!isWarning && !isCritical && (
        <div className="flex items-start gap-2 p-3 bg-blue-100 rounded-md">
          <TrendingUp className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-semibold text-blue-800">Storage Status Good</p>
            <p className="text-blue-700 text-xs">You're using {usage.usage_percent.toFixed(0)}% of your available storage.</p>
          </div>
        </div>
      )}
    </div>
  );
}
