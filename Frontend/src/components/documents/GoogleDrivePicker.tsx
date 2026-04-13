import { useState, useCallback, useEffect } from 'react';
import { Cloud, Plus, X, Check } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../contexts/ToastContext';
import { LogoLoader } from '../common/LogoLoader';
import {
  listGoogleDriveFiles,
  downloadGoogleDriveFile,
  getGoogleDriveToken,
  isGoogleDriveConfigured,
  getGoogleDriveAuthUrl,
} from '../../lib/api/googleDrive';
import type { Database } from '../../lib/database.types';

type Document = Database['public']['Tables']['documents']['Row'];

interface GoogleDrivePickerProps {
  onFilesImported?: (documents: Document[]) => void;
  onClose?: () => void;
}

/**
 * Google Drive File Picker and Importer Component
 * Allows users to authenticate with Google Drive and import documents
 */
export const GoogleDrivePicker = ({
  onFilesImported,
  onClose,
}: GoogleDrivePickerProps) => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [authenticated, setAuthenticated] = useState(false);
  const [files, setFiles] = useState<
    Array<{ id: string; name: string; mimeType: string; size: number }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>();
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());

  // HOOKS MUST BE DEFINED BEFORE EARLY RETURNS

  const handleAuthenticate = useCallback(async () => {
    if (!isGoogleDriveConfigured()) {
      showToast({
        type: 'error',
        message: 'Google Drive OAuth is not configured. Please contact support.',
      });
      return;
    }

    showToast({
      type: 'info',
      message: 'Redirecting to Google Drive authorization...',
    });

    const ok = (await import('../../lib/safeRedirect')).safeOpenUrl(getGoogleDriveAuthUrl(), '_self');
    if (!ok) {
      showToast({
        type: 'error',
        message: 'Blocked unsafe redirect to Google OAuth.',
      });
    }
  }, [showToast]);

  useEffect(() => {
    if (!user) return;

    let isActive = true;

    const loadTokenState = async () => {
      const tokenResult = await getGoogleDriveToken(user.id);
      if (!isActive) return;
      setAuthenticated(!!tokenResult.success && !!tokenResult.token);
    };

    void loadTokenState();

    return () => {
      isActive = false;
    };
  }, [user]);

  const handleLoadFiles = useCallback(async () => {
    if (!user) return; // Guard clause for type safety
    
    if (!authenticated) {
      showToast({
        type: 'error',
        message: 'Please authenticate with Google Drive first',
      });
      return;
    }

    const tokenResult = await getGoogleDriveToken(user.id);
    if (!tokenResult.success || !tokenResult.token) {
      showToast({
        type: 'error',
        message: 'Failed to load Google Drive token',
      });
      return;
    }

    setLoading(true);
    const result = await listGoogleDriveFiles(tokenResult.token, 20, nextPageToken);

    if (result.success && result.files) {
      setFiles(result.files);
      setNextPageToken(result.nextPageToken);
    } else {
      showToast({
        type: 'error',
        message: result.error || 'Failed to load files from Google Drive',
      });
    }
    setLoading(false);
  }, [authenticated, user, nextPageToken, showToast]);

  const handleImportFile = useCallback(
    async (fileId: string, fileName: string) => {
      if (!user) return; // Guard clause

      setImporting(fileId);

      const tokenResult = await getGoogleDriveToken(user.id);
      if (!tokenResult.success || !tokenResult.token) {
        showToast({
          type: 'error',
          message: 'Failed to load Google Drive token',
        });
        setImporting(null);
        return;
      }

      const result = await downloadGoogleDriveFile(
        fileId,
        fileName,
        tokenResult.token,
        user.id
      );

      if (result.success && result.document) {
        showToast({
          type: 'success',
          message: `${fileName} imported successfully`,
        });

        setSelectedFiles((prev) => {
          const next = new Set(prev);
          next.delete(fileId);
          return next;
        });

        if (onFilesImported && result.document) {
          onFilesImported([result.document]);
        }
      } else {
        showToast({
          type: 'error',
          message: result.error || 'Failed to import file',
        });
      }

      setImporting(null);
    },
    [user, showToast, onFilesImported]
  );

  const handleBatchImport = useCallback(async () => {
    if (!user) return; // Guard clause

    if (selectedFiles.size === 0) {
      showToast({
        type: 'warning',
        message: 'Please select files to import',
      });
      return;
    }

    const tokenResult = await getGoogleDriveToken(user.id);
    if (!tokenResult.success || !tokenResult.token) {
      showToast({
        type: 'error',
        message: 'Failed to load Google Drive token',
      });
      return;
    }

    const importedDocs: Document[] = [];

    for (const fileId of selectedFiles) {
      const file = files.find((f) => f.id === fileId);
      if (!file) continue;

      setImporting(fileId);
      const result = await downloadGoogleDriveFile(
        fileId,
        file.name,
        tokenResult.token,
        user.id
      );

      if (result.success && result.document) {
        importedDocs.push(result.document);
      }
      setImporting(null);
    }

    if (importedDocs.length > 0) {
      showToast({
        type: 'success',
        message: `${importedDocs.length} file(s) imported successfully`,
      });

      if (onFilesImported) {
        onFilesImported(importedDocs);
      }

      setSelectedFiles(new Set());
    }
  }, [selectedFiles, files, user, showToast, onFilesImported]);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  // CONDITIONAL RENDERING MOVED HERE (AFTER HOOKS)

  if (!user) {
    return (
      <div className="text-center p-8 text-gray-600">
        Please sign in to use Google Drive integration
      </div>
    );
  }

  if (!isGoogleDriveConfigured()) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
        <Cloud className="w-12 h-12 text-blue-600 mx-auto mb-3" />
        <h3 className="text-xs font-semibold text-gray-900 mb-2">
          Google Drive Integration Not Configured
        </h3>
        <p className="text-gray-700 mb-4">
          Your administrator needs to set up Google OAuth. Contact support for assistance.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-4xl w-full max-h-[90vh] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Cloud className="w-6 h-6 text-blue-600" />
          <h2 className="text-xs font-bold text-gray-900">Import from Google Drive</h2>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
            aria-label="Close"
          >
            <X className="w-6 h-6 text-gray-600" />
          </button>
        )}
      </div>

      {/* Authentication Section */}
      {!authenticated && (
        <div className="bg-primary-50 border border-primary-200 rounded-lg p-4 mb-6">
          <p className="text-gray-700 mb-4">
            Connect your Google Drive account to import documents
          </p>
          <button
            onClick={handleAuthenticate}
            className="flex items-center gap-2 px-4 py-2 bg-primary-800 text-white rounded-lg hover:bg-primary-900 transition"
          >
            <Cloud className="w-4 h-4" />
            Connect Google Drive
          </button>
        </div>
      )}

      {/* Files List */}
      {authenticated && files.length === 0 && !loading && (
        <button
          onClick={handleLoadFiles}
          className="flex items-center gap-2 px-4 py-3 bg-primary-800 text-white rounded-lg hover:bg-primary-900 transition mb-6"
        >
          <Plus className="w-4 h-4" />
          Load Files from Google Drive
        </button>
      )}

      {loading && (
        <div className="flex justify-center items-center py-12">
          <LogoLoader size="md" />
        </div>
      )}

      {files.length > 0 && (
        <>
          <div className="flex-1 overflow-y-auto mb-4">
            <div className="space-y-2">
              {files.map((file) => {
                const isSelected = selectedFiles.has(file.id);
                const isImporting = importing === file.id;

                return (
                  <div
                    key={file.id}
                    className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        const next = new Set(selectedFiles);
                        if (e.target.checked) {
                          next.add(file.id);
                        } else {
                          next.delete(file.id);
                        }
                        setSelectedFiles(next);
                      }}
                      disabled={isImporting}
                      className="w-4 h-4 rounded"
                      aria-label={`Select ${file.name}`}
                    />

                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{file.name}</p>
                      <p className="text-xs text-gray-600">
                        {formatFileSize(file.size)} • {file.mimeType}
                      </p>
                    </div>

                    <button
                      onClick={() => handleImportFile(file.id, file.name)}
                      disabled={isImporting || selectedFiles.size > 0}
                      className="flex items-center gap-2 px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                      aria-label={`Import ${file.name}`}
                    >
                      {isImporting ? (
                        <span className="w-4 h-4"><LogoLoader size="sm" /></span>
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                      {isImporting ? 'Importing...' : 'Import'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Batch Actions */}
          {selectedFiles.size > 0 && (
            <div className="flex gap-3 pt-4 border-t">
              <button
                onClick={handleBatchImport}
                disabled={importing !== null}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition"
              >
                {importing ? (
                  <>
                    <span className="w-4 h-4"><LogoLoader size="sm" /></span>
                    Importing...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Import {selectedFiles.size} File(s)
                  </>
                )}
              </button>
              <button
                onClick={() => setSelectedFiles(new Set())}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                Clear Selection
              </button>
            </div>
          )}

          {/* Load More */}
          {nextPageToken && (
            <button
              onClick={handleLoadFiles}
              className="w-full mt-4 px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
            >
              Load More Files
            </button>
          )}
        </>
      )}
    </div>
  );
};
