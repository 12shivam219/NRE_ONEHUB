import { useState } from 'react';
import { Database, HardDrive, Lock, RefreshCw } from 'lucide-react';
import { useCachePreferences } from '../../hooks/useCachePreferences';

/**
 * Feature 8: Cache Preferences Settings Component
 * Allows users to control offline caching behavior
 */
export const OfflineCacheSettings = () => {
  const {
    preferences,
    updatePreferences,
    reloadPreferences,
    cacheSize,
    cacheQuota,
    cachePercentage,
    isPersistent,
    requestPersistence,
    isLoading,
  } = useCachePreferences();

  const [showDetails, setShowDetails] = useState(false);

  if (isLoading) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <p className="text-gray-500">Loading cache settings...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Storage Status */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-primary-600" />
            <h3 className="font-medium text-gray-900">Storage Usage</h3>
          </div>
          <div className="flex items-center gap-2">
            {isPersistent && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                <Lock className="w-3 h-3" />
                Persistent
              </span>
            )}
            <button
              onClick={reloadPreferences}
              className="p-2 hover:bg-gray-100 rounded transition text-gray-600 hover:text-gray-900"
              title="Reload preferences from database"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-gray-600">Used:</span>
            <span className="font-medium text-gray-900">{cacheSize} MB</span>
          </div>
          <div className="flex justify-between text-xs mb-2">
            <span className="text-gray-600">Available:</span>
            <span className="font-medium text-gray-900">{cacheQuota} MB</span>
          </div>

          {/* Storage Progress Bar */}
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${
                cachePercentage > 80 ? 'bg-red-500' : cachePercentage > 50 ? 'bg-yellow-500' : 'bg-green-500'
              }`}
              style={{ width: `${Math.min(cachePercentage, 100)}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 text-right">{cachePercentage}% used</p>
        </div>

        {!isPersistent && (
          <button
            onClick={requestPersistence}
            className="mt-4 w-full px-4 py-2 bg-primary-50 text-primary-700 rounded-lg text-xs font-medium hover:bg-primary-100 transition"
          >
            Enable Persistent Storage
          </button>
        )}
      </div>

      {/* Cache Preferences */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <Database className="w-5 h-5 text-primary-600" />
          <h3 className="font-medium text-gray-900">Cache Preferences</h3>
        </div>

        <div className="space-y-4">
          {/* Requirements */}
          <label className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 cursor-pointer">
            <input
              type="checkbox"
              checked={preferences.cacheRequirements}
              onChange={(e) =>
                updatePreferences({ cacheRequirements: e.target.checked })
              }
              className="w-4 h-4 rounded border-gray-300"
            />
            <div>
              <p className="font-medium text-gray-900">Cache Requirements</p>
              <p className="text-xs text-gray-500">Store requirements for offline access</p>
            </div>
          </label>

          {/* Consultants */}
          <label className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 cursor-pointer">
            <input
              type="checkbox"
              checked={preferences.cacheConsultants}
              onChange={(e) =>
                updatePreferences({ cacheConsultants: e.target.checked })
              }
              className="w-4 h-4 rounded border-gray-300"
            />
            <div>
              <p className="font-medium text-gray-900">Cache Consultants</p>
              <p className="text-xs text-gray-500">Store consultant profiles for offline access</p>
            </div>
          </label>

          {/* Interviews */}
          <label className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 cursor-pointer">
            <input
              type="checkbox"
              checked={preferences.cacheInterviews}
              onChange={(e) =>
                updatePreferences({ cacheInterviews: e.target.checked })
              }
              className="w-4 h-4 rounded border-gray-300"
            />
            <div>
              <p className="font-medium text-gray-900">Cache Interviews</p>
              <p className="text-xs text-gray-500">Store interview data for offline access</p>
            </div>
          </label>

          {/* Documents */}
          <label className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 cursor-pointer">
            <input
              type="checkbox"
              checked={preferences.cacheDocuments}
              onChange={(e) =>
                updatePreferences({ cacheDocuments: e.target.checked })
              }
              className="w-4 h-4 rounded border-gray-300"
            />
            <div>
              <p className="font-medium text-gray-900">Cache Documents</p>
              <p className="text-xs text-gray-500">Store documents for offline access</p>
            </div>
          </label>

          {/* Emails */}
          <label className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 cursor-pointer">
            <input
              type="checkbox"
              checked={preferences.cacheEmails}
              onChange={(e) =>
                updatePreferences({ cacheEmails: e.target.checked })
              }
              className="w-4 h-4 rounded border-gray-300"
            />
            <div>
              <p className="font-medium text-gray-900">Cache Emails</p>
              <p className="text-xs text-gray-500">Store emails for offline access</p>
            </div>
          </label>

          {/* WiFi Only Sync */}
          <label className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 cursor-pointer border-t pt-4">
            <input
              type="checkbox"
              checked={preferences.syncOnWiFiOnly}
              onChange={(e) =>
                updatePreferences({ syncOnWiFiOnly: e.target.checked })
              }
              className="w-4 h-4 rounded border-gray-300"
            />
            <div>
              <p className="font-medium text-gray-900">Sync on WiFi Only</p>
              <p className="text-xs text-gray-500">Only sync large files when connected to WiFi</p>
            </div>
          </label>
        </div>

        {/* Max Cache Size */}
        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <label className="block mb-2">
            <p className="text-xs font-medium text-gray-900">Maximum Cache Size</p>
            <p className="text-xs text-gray-500">Current: {preferences.maxCacheSize} MB</p>
          </label>
          <input
            type="range"
            min="10"
            max="200"
            step="10"
            value={preferences.maxCacheSize}
            onChange={(e) =>
              updatePreferences({ maxCacheSize: parseInt(e.target.value) })
            }
            className="w-full"
          />
          <p className="text-xs text-gray-500 mt-2">
            Larger cache = better offline support, but uses more device storage
          </p>
        </div>
      </div>

      {/* Details Toggle */}
      <button
        onClick={() => setShowDetails(!showDetails)}
        className="text-xs text-primary-600 hover:text-primary-700 font-medium"
      >
        {showDetails ? 'Hide' : 'Show'} technical details
      </button>

      {showDetails && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs font-mono space-y-2">
          <p>
            <span className="text-gray-600">Cache Quota:</span> {cacheQuota} MB
          </p>
          <p>
            <span className="text-gray-600">Storage Usage:</span> {cacheSize} MB
          </p>
          <p>
            <span className="text-gray-600">Persistent:</span> {isPersistent ? 'Yes' : 'No'}
          </p>
          <p>
            <span className="text-gray-600">Online:</span> {navigator.onLine ? 'Yes' : 'No'}
          </p>
        </div>
      )}
    </div>
  );
};
