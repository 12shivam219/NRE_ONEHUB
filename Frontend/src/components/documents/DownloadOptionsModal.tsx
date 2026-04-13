import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Check, ChevronDown, Download, FolderPlus, HardDrive, Loader, Search, X } from 'lucide-react';
import { Modal } from '../common/Modal';
import { useAuth } from '../../hooks/useAuth';
import { createFolder, getAllFolders } from '../../lib/api/folders';
import type { Database } from '../../lib/database.types';

type Folder = Database['public']['Tables']['folders']['Row'];

interface DownloadOptionsModalProps {
  isOpen: boolean;
  fileName: string;
  onClose: () => void;
  onDownloadLocal: () => Promise<void>;
  onSaveToApp: () => Promise<void>;
  onSaveToAppFolder: (folderId: string | null) => Promise<void>;
}

export const DownloadOptionsModal = ({
  isOpen,
  fileName,
  onClose,
  onDownloadLocal,
  onSaveToApp,
  onSaveToAppFolder,
}: DownloadOptionsModalProps) => {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState<'local' | 'app' | 'folder' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string>('');
  const [folderQuery, setFolderQuery] = useState('');
  const [showFolderDropdown, setShowFolderDropdown] = useState(false);
  const [highlightedFolderIndex, setHighlightedFolderIndex] = useState(0);
  const [showCreateFolderForm, setShowCreateFolderForm] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const folderDropdownRef = useRef<HTMLDivElement | null>(null);
  const folderSearchInputRef = useRef<HTMLInputElement | null>(null);

  const filteredFolders = useMemo(() => {
    const query = folderQuery.trim().toLowerCase();
    if (!query) return folders;
    return folders.filter((folder) => folder.name.toLowerCase().includes(query));
  }, [folderQuery, folders]);

  const selectedFolder = useMemo(
    () => folders.find((folder) => folder.id === selectedFolderId) || null,
    [folders, selectedFolderId]
  );

  useEffect(() => {
    if (!showFolderDropdown) return;
    const selectedIndex = filteredFolders.findIndex((folder) => folder.id === selectedFolderId);
    setHighlightedFolderIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [filteredFolders, selectedFolderId, showFolderDropdown]);

  const loadFolders = useCallback(async () => {
    if (!user?.id) return;
    const result = await getAllFolders(user.id);

    if (result.success) {
      const allFolders = result.folders || [];
      setFolders(allFolders);
      setSelectedFolderId((prev) => prev || allFolders[0]?.id || '');
    } else {
      setFolders([]);
    }
  }, [user?.id]);

  useEffect(() => {
    let mounted = true;

    const loadFoldersForModal = async () => {
      if (!isOpen || !user?.id) return;
      const result = await getAllFolders(user.id);
      if (!mounted) return;

      if (result.success) {
        const allFolders = result.folders || [];
        setFolders(allFolders);
        setSelectedFolderId((prev) => prev || allFolders[0]?.id || '');
      } else {
        setFolders([]);
      }
    };

    void loadFoldersForModal();

    return () => {
      mounted = false;
    };
  }, [isOpen, user?.id]);

  useEffect(() => {
    if (!isOpen) {
      setFolderQuery('');
      setShowFolderDropdown(false);
      setHighlightedFolderIndex(0);
      setShowCreateFolderForm(false);
      setIsCreatingFolder(false);
      setNewFolderName('');
      setError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!showFolderDropdown) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (folderDropdownRef.current?.contains(target)) return;
      setShowFolderDropdown(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [showFolderDropdown]);

  useEffect(() => {
    if (!showFolderDropdown) return;
    queueMicrotask(() => {
      folderSearchInputRef.current?.focus();
    });
  }, [showFolderDropdown]);

  const handleDownloadLocal = useCallback(async () => {
    try {
      setError(null);
      setIsLoading('local');
      await onDownloadLocal();
      setError(null); // Clear error on success (Bug #19)
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download');
    } finally {
      setIsLoading(null);
    }
  }, [onDownloadLocal, onClose]);

  const handleSaveToApp = useCallback(async () => {
    try {
      setError(null);
      setIsLoading('app');
      await onSaveToApp();
      setError(null); // Clear error on success (Bug #19)
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save to app');
    } finally {
      setIsLoading(null);
    }
  }, [onSaveToApp, onClose]);

  const handleSaveToAppFolder = useCallback(async () => {
    try {
      setError(null);
      setIsLoading('folder');
      await onSaveToAppFolder(selectedFolderId || null);
      setError(null); // Clear error on success (Bug #19)
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save to folder');
    } finally {
      setIsLoading(null);
    }
  }, [onSaveToAppFolder, onClose, selectedFolderId]);

  const handleCreateFolder = useCallback(async () => {
    if (!user?.id) {
      setError('You must be signed in to create a folder.');
      return;
    }

    const name = newFolderName.trim();
    if (!name) {
      setError('Folder name cannot be empty.');
      return;
    }

    try {
      setError(null);
      setIsCreatingFolder(true);
      const result = await createFolder(user.id, name, null);

      if (!result.success || !result.folder) {
        setError(result.error || 'Failed to create folder');
        return;
      }

      await loadFolders();
      setSelectedFolderId(result.folder.id);
      setFolderQuery('');
      setShowFolderDropdown(false);
      setNewFolderName('');
      setShowCreateFolderForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create folder');
    } finally {
      setIsCreatingFolder(false);
    }
  }, [loadFolders, newFolderName, user?.id]);

  const selectFolder = useCallback((folder: Folder) => {
    setSelectedFolderId(folder.id);
    setShowFolderDropdown(false);
    setFolderQuery('');
  }, []);

  const handleFolderDropdownKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!showFolderDropdown || filteredFolders.length === 0) {
      if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        setShowFolderDropdown(true);
      }
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedFolderIndex((prev) => (prev + 1) % filteredFolders.length);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedFolderIndex((prev) => (prev - 1 + filteredFolders.length) % filteredFolders.length);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const highlightedFolder = filteredFolders[highlightedFolderIndex];
      if (highlightedFolder) {
        selectFolder(highlightedFolder);
      }
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      setShowFolderDropdown(false);
      setFolderQuery('');
    }
  }, [filteredFolders, highlightedFolderIndex, selectFolder, showFolderDropdown]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Choose Destination"
      size="md"
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          <span className="font-medium">File:</span> {fileName}
        </p>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <X className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="space-y-3">
          {/* Download to Local Machine */}
          <button
            onClick={handleDownloadLocal}
            disabled={isLoading !== null}
            className="w-full p-4 border-2 border-gray-200 rounded-xl hover:border-primary-600 hover:bg-primary-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-left"
          >
            <div className="flex items-start gap-3">
              <div className="mt-1">
                {isLoading === 'local' ? (
                  <Loader className="w-5 h-5 text-primary-600 animate-spin" />
                ) : (
                  <Download className="w-5 h-5 text-primary-600" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900">Download to Computer</p>
                <p className="text-xs text-gray-500 mt-1">
                  Save the file directly to your Downloads folder or chosen location
                </p>
              </div>
            </div>
          </button>

          {/* Save to Application */}
          <button
            onClick={handleSaveToApp}
            disabled={isLoading !== null}
            className="w-full p-4 border-2 border-gray-200 rounded-xl hover:border-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-left"
          >
            <div className="flex items-start gap-3">
              <div className="mt-1">
                {isLoading === 'app' ? (
                  <Loader className="w-5 h-5 text-emerald-600 animate-spin" />
                ) : (
                  <HardDrive className="w-5 h-5 text-emerald-600" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900">Save to App Storage</p>
                <p className="text-xs text-gray-500 mt-1">
                  Store a snapshot in your app library. Access it anytime without re-downloading
                </p>
              </div>
            </div>
          </button>

          {/* Save to Application Folder */}
          <div className="space-y-2 rounded-xl border border-blue-100 bg-blue-50/50 p-3">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="app-folder-select" className="text-xs font-semibold uppercase tracking-wide text-blue-800">
                Target Folder
              </label>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setShowCreateFolderForm((prev) => !prev);
                }}
                disabled={isLoading !== null || isCreatingFolder}
                className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <FolderPlus className="h-3.5 w-3.5" />
                Create New
              </button>
            </div>
            <div
              ref={folderDropdownRef}
              className="relative"
              onKeyDown={handleFolderDropdownKeyDown}
            >
              <button
                id="app-folder-select"
                type="button"
                onClick={() => {
                  if (isLoading !== null || folders.length === 0) return;
                  setShowFolderDropdown((prev) => !prev);
                }}
                disabled={isLoading !== null || folders.length === 0}
                className="flex w-full items-center justify-between rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm transition hover:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
                aria-haspopup="listbox"
                aria-expanded={showFolderDropdown}
                aria-controls={showFolderDropdown ? 'folder-command-menu' : undefined}
              >
                <span className={`truncate ${selectedFolder ? 'text-slate-800' : 'text-slate-400'}`}>
                  {selectedFolder?.name || 'No folders available'}
                </span>
                <ChevronDown className={`h-4 w-4 text-slate-500 transition ${showFolderDropdown ? 'rotate-180' : ''}`} />
              </button>

              {showFolderDropdown && folders.length > 0 && (
                <div className="absolute z-20 mt-2 w-full rounded-xl border border-blue-200 bg-white p-2 shadow-xl">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      ref={folderSearchInputRef}
                      value={folderQuery}
                      onChange={(e) => {
                        setFolderQuery(e.target.value);
                        setHighlightedFolderIndex(0);
                      }}
                      placeholder="Search folders..."
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-700 focus:border-blue-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                  </div>

                  <div className="mt-2 max-h-56 overflow-auto rounded-lg border border-slate-100">
                    {filteredFolders.length === 0 ? (
                      <div className="px-3 py-4 text-sm text-slate-500">
                        No folders match your search.
                      </div>
                    ) : (
                      <div id="folder-command-menu" role="listbox" className="py-1">
                        {filteredFolders.map((folder) => {
                          const isSelected = folder.id === selectedFolderId;
                          const isHighlighted = filteredFolders[highlightedFolderIndex]?.id === folder.id;
                          return (
                            <button
                              key={folder.id}
                              type="button"
                              onMouseEnter={() => setHighlightedFolderIndex(filteredFolders.findIndex((item) => item.id === folder.id))}
                              onClick={() => selectFolder(folder)}
                              className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition ${
                                isHighlighted
                                  ? 'bg-slate-100 text-slate-900'
                                  : isSelected
                                    ? 'bg-blue-50 text-blue-700'
                                    : 'text-slate-700 hover:bg-slate-50'
                              }`}
                              aria-selected={isSelected}
                            >
                              <span className="truncate">{folder.name}</span>
                              {isSelected && <Check className="h-4 w-4 flex-shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <p className="text-xs text-blue-700">
              Choose which app folder should receive the copied document.
            </p>

            {showCreateFolderForm && (
              <div className="space-y-2 rounded-lg border border-blue-200 bg-white p-3">
                <label htmlFor="new-folder-name" className="text-xs font-medium text-slate-700">
                  New Folder Name
                </label>
                <div className="flex gap-2">
                  <input
                    id="new-folder-name"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="Enter folder name"
                    disabled={isCreatingFolder}
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                  <button
                    type="button"
                    onClick={handleCreateFolder}
                    disabled={isCreatingFolder || newFolderName.trim().length === 0}
                    className="inline-flex min-w-[96px] items-center justify-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isCreatingFolder ? <Loader className="h-4 w-4 animate-spin" /> : 'Create'}
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={handleSaveToAppFolder}
            disabled={isLoading !== null || folders.length === 0}
            className="w-full p-4 border-2 border-gray-200 rounded-xl hover:border-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-left"
          >
            <div className="flex items-start gap-3">
              <div className="mt-1">
                {isLoading === 'folder' ? (
                  <Loader className="w-5 h-5 text-blue-600 animate-spin" />
                ) : (
                  <FolderPlus className="w-5 h-5 text-blue-600" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900">Save to Application Folder</p>
                <p className="text-xs text-gray-500 mt-1">
                  Organize files in custom folders within your app. Access from "My Files" section
                </p>
              </div>
            </div>
          </button>
        </div>

        <div className="pt-2 border-t border-gray-200 text-xs text-gray-500">
          <p>💡 <strong>Tip:</strong> Use <strong>Download to Computer</strong> for immediate use, <strong>Save to App</strong> for cloud storage, or <strong>Application Folder</strong> to keep organized files in your app.</p>
        </div>
      </div>
    </Modal>
  );
};
