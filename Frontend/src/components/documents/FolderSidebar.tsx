import { memo, useState, useCallback, useEffect, useTransition, useMemo, type Dispatch, type SetStateAction } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderPlus, Loader2, Pencil, Check, X, Trash2 } from 'lucide-react';
import { useFolders } from '../../hooks/useFolders';
import { deleteFolder, renameFolder, moveToFolder, createFolder, getFolderItemCounts, type FolderItemCounts } from '../../lib/api/folders';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../contexts/ToastContext';
import { FolderContextMenu } from './FolderContextMenu';
import { MoveFolderModal } from './MoveFolderModal';
import { CreateSubfolderModal } from './CreateSubfolderModal';
import type { Database } from '../../lib/database.types';

type Folder = Database['public']['Tables']['folders']['Row'];

interface FolderSidebarProps {
  currentFolderId: string | null;
  onFolderSelect: (folderId: string | null) => void;
  onCreateFolder?: () => void;
  onFolderDeleted?: () => void;
  onFolderCreated?: () => void;
  onDocumentDrop?: (documentId: string, targetFolderId: string | null) => Promise<void>;
  onTrashClick?: () => void;
  onFolderMetadata?: (folder: Folder | null) => void;
}

interface FolderNodeState {
  isExpanded: boolean;
  isLoading: boolean;
}

const FolderTreeNode = memo(
  ({
    folder,
    currentFolderId,
    onSelectFolder,
    level = 0,
    onExpandChange,
    expandedState,
    folderHierarchy,
    userId,
    onDelete,
    onRename,
    onMove,
    onCreateSubfolder,
    counts,
    dragOverFolderId,
    setDragOverFolderId,
    onDocumentDrop,
    onFolderMetadata,
  }: {
    folder: Folder;
    currentFolderId: string | null;
    onSelectFolder: (folder: Folder) => void;
    level?: number;
    onExpandChange: (folderId: string, isExpanded: boolean, isLoading?: boolean) => void;
    expandedState: Record<string, FolderNodeState>;
    folderHierarchy: Record<string, Folder[]>;
    userId?: string;
    onDelete?: (folderId: string, folderName: string) => Promise<void>;
    onRename?: (folderId: string, nextName: string) => Promise<void>;
    onMove?: (folderId: string) => void;
    onCreateSubfolder?: (folderId: string) => void;
    counts: FolderItemCounts;
    dragOverFolderId: string | null;
    setDragOverFolderId: Dispatch<SetStateAction<string | null>>;
    onDocumentDrop?: (documentId: string, targetFolderId: string | null) => Promise<void>;
    onFolderMetadata?: (folder: Folder | null) => void;
  }) => {
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
    
    const nodeState = expandedState[folder.id] || { isExpanded: false, isLoading: false };
    const isSelected = currentFolderId === folder.id;
    const isDragOver = dragOverFolderId === folder.id;
    const [isRenaming, setIsRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState(folder.name);
    const visibleSubfolders = folderHierarchy[folder.id] || [];
    const childCount = visibleSubfolders.length;
    const documentCount = counts[folder.id]?.documents ?? 0;
    const hasChildren = childCount > 0;
    const indent = level * 18 + 10;

    useEffect(() => {
      setRenameValue(folder.name);
    }, [folder.name]);

    const handleDeleteClick = async () => {
      if (!onDelete) return;
      try {
        setIsDeleting(true);
        await onDelete(folder.id, folder.name);
        setShowDeleteConfirm(false);
      } finally {
        setIsDeleting(false);
      }
    };

    const handleRename = async () => {
      const nextName = renameValue.trim();
      if (!nextName || nextName === folder.name || !onRename) {
        setIsRenaming(false);
        setRenameValue(folder.name);
        return;
      }
      await onRename(folder.id, nextName);
      setIsRenaming(false);
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
      if (!onDocumentDrop) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDragOverFolderId(folder.id);
    };

    const handleDragLeave = () => {
      if (!onDocumentDrop) return;
      if (dragOverFolderId === folder.id) {
        setDragOverFolderId(null);
      }
    };

    const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
      if (!onDocumentDrop) return;
      e.preventDefault();
      setDragOverFolderId(null);
      try {
        const payloadRaw = e.dataTransfer.getData('application/json') || e.dataTransfer.getData('text/plain');
        if (!payloadRaw) return;
        const payload = JSON.parse(payloadRaw) as { type?: string; id?: string };
        if (payload.type !== 'document' || !payload.id) return;
        await onDocumentDrop(payload.id, folder.id);
      } catch {
        // Ignore malformed drag payloads
      }
    };

    const handleToggleExpand = async () => {
      const currentState = expandedState[folder.id] || { isExpanded: false, isLoading: false };
      
      if (currentState.isExpanded) {
        onExpandChange(folder.id, false, false);
        return;
      }

      onExpandChange(folder.id, true, false);
    };

    return (
      <div className="relative">
        {level > 0 && (
          <div
            className="absolute top-0 bottom-0 w-px bg-slate-200/80"
            style={{ left: `${indent - 10}px` }}
            aria-hidden="true"
          />
        )}
        <div
          className={`group relative flex items-center gap-2 rounded-xl border px-2.5 py-2 transition-colors ${
            isSelected
              ? 'border-blue-200 bg-blue-50 text-blue-700 shadow-sm'
              : 'border-transparent text-gray-700 hover:border-slate-200 hover:bg-slate-50'
          } ${isDragOver ? 'ring-2 ring-blue-400 bg-blue-50' : ''}`}
          style={{ marginLeft: `${indent}px` }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={(e) => {
            void handleDrop(e);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setContextMenu({ x: e.clientX, y: e.clientY });
          }}
        >
          {/* Expand/Collapse Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void handleToggleExpand();
            }}
            className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md transition-colors ${
              hasChildren ? 'hover:bg-slate-200/80' : 'opacity-40'
            }`}
            title={nodeState.isExpanded ? 'Collapse' : 'Expand'}
            aria-label={nodeState.isExpanded ? 'Collapse folder' : 'Expand folder'}
            aria-expanded={nodeState.isExpanded}
            disabled={!hasChildren && !nodeState.isLoading}
          >
            {nodeState.isLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : nodeState.isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Folder Icon */}
          <div
            className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${
              isSelected ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
            }`}
          >
            <Folder className="w-4 h-4" />
          </div>

          {/* Folder Name - Clickable to navigate */}
          {isRenaming ? (
            <input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="flex-1 min-w-0 text-sm px-2 py-1 border border-blue-300 rounded"
              autoFocus
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleRename();
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setIsRenaming(false);
                  setRenameValue(folder.name);
                }
              }}
            />
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelectFolder(folder);
              }}
              className={`min-w-0 flex-1 text-left transition-all ${
                isSelected ? 'font-semibold' : ''
              }`}
              title={folder.name}
              aria-current={isSelected ? 'page' : undefined}
            >
              <div className="truncate text-sm">{folder.name}</div>
              <div className="mt-0.5 text-[11px] text-slate-500">
                {childCount} folder{childCount === 1 ? '' : 's'} • {documentCount} file{documentCount === 1 ? '' : 's'}
              </div>
            </button>
          )}

          <span
            className={`hidden rounded-full px-2 py-1 text-[10px] font-medium md:inline-flex ${
              isSelected ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
            }`}
            aria-label={`${childCount} subfolders and ${documentCount} documents`}
          >
            {childCount + documentCount}
          </span>

          {onRename && (
            isRenaming ? (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleRename();
                  }}
                  className="p-1 hover:bg-green-100 rounded text-green-600 transition-colors flex-shrink-0"
                  title="Save rename"
                  aria-label="Save rename"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsRenaming(false);
                    setRenameValue(folder.name);
                  }}
                  className="p-1 hover:bg-gray-100 rounded text-gray-500 transition-colors flex-shrink-0"
                  title="Cancel rename"
                  aria-label="Cancel rename"
                >
                  <X className="w-4 h-4" />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsRenaming(true);
                }}
                className="hidden flex-shrink-0 rounded-md p-1 text-gray-400 transition-colors hover:bg-blue-100 hover:text-blue-600 group-hover:inline-flex"
                title="Rename folder"
                aria-label="Rename folder"
              >
                <Pencil className="w-4 h-4" />
              </button>
            )
          )}

          {/* Delete Button */}
          {onDelete && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowDeleteConfirm(true);
              }}
              className="hidden flex-shrink-0 rounded-md p-1 text-gray-400 transition-colors hover:bg-red-100 hover:text-red-600 group-hover:inline-flex"
              title="Delete folder"
              aria-label="Delete folder"
              disabled={isDeleting}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}

          {/* Context Menu Trigger */}
          {!isRenaming && (onMove || onCreateSubfolder || onRename || onDelete) && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setContextMenu({ x: e.currentTarget.getBoundingClientRect().right, y: e.currentTarget.getBoundingClientRect().top });
              }}
              className="ml-auto flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600"
              title="Folder options"
              aria-label="Folder options"
            >
              <span className="text-lg leading-none">⋯</span>
            </button>
          )}
        </div>

        {/* Context Menu */}
        {contextMenu && (
          <FolderContextMenu
            isOpen={true}
            position={contextMenu}
            onClose={() => setContextMenu(null)}
            onRename={() => {
              setIsRenaming(true);
            }}
            onDelete={() => {
              setShowDeleteConfirm(true);
            }}
            onMove={() => {
              onMove?.(folder.id);
            }}
            onCreateSubfolder={() => {
              onCreateSubfolder?.(folder.id);
            }}
            disabled={isDeleting}
          />
        )}

        {/* Delete Confirmation Dialog */}
        {showDeleteConfirm && (
          <div className="mx-2 mt-1 p-2 bg-red-50 border border-red-200 rounded text-xs">
            <p className="text-red-800 font-medium mb-2">
              Delete "{folder.name}"?
            </p>
            {/* BUG FIX #8: Show item counts and details about what will be deleted */}
            <div className="text-red-700 mb-2 space-y-1 text-xs">
              <p>This folder contains:</p>
              <ul className="ml-4 list-disc">
                <li>{counts[folder.id]?.subfolders ?? 0} subfolder{(counts[folder.id]?.subfolders ?? 0) !== 1 ? 's' : ''}</li>
                <li>{counts[folder.id]?.documents ?? 0} document{(counts[folder.id]?.documents ?? 0) !== 1 ? 's' : ''}</li>
              </ul>
              <p className="font-medium mt-1">All nested items will be permanently deleted. This action cannot be undone.</p>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="px-2 py-1 text-xs bg-white text-gray-700 border border-gray-200 rounded hover:bg-gray-50"
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteClick}
                className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        )}

        {/* Subfolders - Show if expanded */}
        {nodeState.isExpanded && visibleSubfolders.length > 0 && (
          <div>
            {visibleSubfolders.map((subfolder) => (
              <FolderTreeNode
                key={subfolder.id}
                folder={subfolder}
                currentFolderId={currentFolderId}
                onSelectFolder={onSelectFolder}
                level={level + 1}
                onExpandChange={onExpandChange}
                expandedState={expandedState}
                folderHierarchy={folderHierarchy}
                userId={userId}
                onDelete={onDelete}
                onRename={onRename}
                onMove={onMove}
                onCreateSubfolder={onCreateSubfolder}
                counts={counts}
                dragOverFolderId={dragOverFolderId}
                setDragOverFolderId={setDragOverFolderId}
                onDocumentDrop={onDocumentDrop}
                onFolderMetadata={onFolderMetadata}
              />
            ))}
          </div>
        )}

        {/* Empty subfolders message */}
        {nodeState.isExpanded && visibleSubfolders.length === 0 && (
          <div
            className="rounded-lg px-3 py-1.5 text-xs italic text-gray-500"
            style={{ marginLeft: `${indent + 22}px` }}
          >
            No subfolders
          </div>
        )}
      </div>
    );
  }
);

FolderTreeNode.displayName = 'FolderTreeNode';

export const FolderSidebar = memo(
  ({ currentFolderId, onFolderSelect, onCreateFolder, onFolderDeleted, onFolderCreated, onDocumentDrop, onTrashClick, onFolderMetadata }: FolderSidebarProps) => {
    const { user } = useAuth();
    const { folders: allFolders, loading, refresh } = useFolders(null, 'all');
    const { showToast } = useToast();
    const [expandedFolders, setExpandedFolders] = useState<Record<string, FolderNodeState>>({});
    const [folderCounts, setFolderCounts] = useState<FolderItemCounts>({});
    const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
    const [_isPending, startTransition] = useTransition();
    const [isMovingFolder, setIsMovingFolder] = useState(false);
    const [isCreatingSubfolder, setIsCreatingSubfolder] = useState(false);
    
    // Modal states
    const [showMoveModal, setShowMoveModal] = useState(false);
    const [folderToMove, setFolderToMove] = useState<string | null>(null);
    const [showCreateSubfolderModal, setShowCreateSubfolderModal] = useState(false);
    const [parentFolderId, setParentFolderId] = useState<string | null>(null);
    const rootFolders = useMemo(
      () => allFolders.filter((folder) => folder.parent_folder_id === null),
      [allFolders]
    );

    // Preload root folders and update expanded state
    useEffect(() => {
      if (loading || rootFolders.length === 0) return;

      // Initialize expanded state for root folders (default to collapsed)
      const initialState: Record<string, FolderNodeState> = {};
      rootFolders.forEach((folder) => {
        if (!initialState[folder.id]) {
          initialState[folder.id] = { isExpanded: false, isLoading: false };
        }
      });
      startTransition(() => {
        setExpandedFolders((prev) => ({ ...initialState, ...prev }));
      });
    }, [rootFolders, loading, startTransition]);

    const handleExpandChange = useCallback(
      (folderId: string, isExpanded: boolean, isLoading: boolean = false) => {
        setExpandedFolders((prev) => {
          const updated = { ...prev };
          updated[folderId] = {
            isExpanded,
            isLoading,
          };
          return updated;
        });
      },
      []
    );

    const handleDeleteFolder = useCallback(
      async (folderId: string, folderName: string) => {
        if (!user?.id) {
          showToast({
            type: 'error',
            title: 'Delete failed',
            message: 'User not authenticated',
          });
          return;
        }

        try {
          const result = await deleteFolder(user.id, folderId, true);
          if (result.success) {
            showToast({
              type: 'success',
              title: 'Folder deleted',
              message: `"${folderName}" has been deleted.`,
            });
            
            // If the deleted folder was selected, switch to All Documents
            if (currentFolderId === folderId) {
              onFolderSelect(null);
            }
            
            // BUG FIX #12: Preserve expansion state instead of clearing all
            // Only remove the deleted folder from expanded state
            setExpandedFolders((prev) => {
              const next = { ...prev };
              delete next[folderId];
              return next;
            });
            
            // Refresh the root folder structure
            await refresh();
            const countsResult = await getFolderItemCounts(user.id);
            if (countsResult.success && countsResult.counts) {
              setFolderCounts(countsResult.counts);
            }
            
            // Notify parent component
            onFolderDeleted?.();
          } else {
            showToast({
              type: 'error',
              title: 'Delete failed',
              message: result.error || 'Failed to delete folder',
            });
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Unknown error';
          showToast({
            type: 'error',
            title: 'Delete failed',
            message: msg,
          });
        }
      },
      [user, currentFolderId, onFolderSelect, showToast, onFolderDeleted, refresh]
    );

    const handleRenameFolder = useCallback(
      async (folderId: string, nextName: string) => {
        if (!user?.id) return;
        const result = await renameFolder(user.id, folderId, nextName);
        if (!result.success) {
          showToast({
            type: 'error',
            title: 'Rename failed',
            message: result.error || 'Unable to rename folder',
          });
          return;
        }
        showToast({
          type: 'success',
          title: 'Folder renamed',
          message: `Renamed to "${nextName}"`,
        });
        await refresh();
      },
      [user, showToast, refresh]
    );

    const handleCreateFolder = useCallback(() => {
      if (onCreateFolder) {
        onCreateFolder();
      }
    }, [onCreateFolder]);

    const handleMoveFolder = useCallback((folderId: string) => {
      setFolderToMove(folderId);
      setShowMoveModal(true);
    }, []);

    const handleCreateSubfolder = useCallback((folderId: string) => {
      setParentFolderId(folderId);
      setShowCreateSubfolderModal(true);
    }, []);

    const handleMoveSubmit = useCallback(
      async (targetFolderId: string | null) => {
        if (!user?.id || !folderToMove) return;

        try {
          setIsMovingFolder(true);
          const result = await moveToFolder(user.id, folderToMove, 'folder', targetFolderId);
          if (result.success) {
            showToast({
              type: 'success',
              title: 'Folder moved',
              message: 'Folder moved successfully',
            });
            await refresh();
            const countsResult = await getFolderItemCounts(user.id);
            if (countsResult.success && countsResult.counts) {
              setFolderCounts(countsResult.counts);
            }
            setShowMoveModal(false);
            return { success: true };
          } else {
            showToast({
              type: 'error',
              title: 'Move failed',
              message: result.error || 'Failed to move folder',
            });
            return { success: false };
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Unknown error';
          showToast({
            type: 'error',
            title: 'Move failed',
            message: msg,
          });
          return { success: false };
        } finally {
          setIsMovingFolder(false);
        }
      },
      [user?.id, folderToMove, showToast, refresh]
    );

    const handleCreateSubfolderSubmit = useCallback(
      async (name: string, description?: string) => {
        if (!user?.id || !parentFolderId) return;

        try {
          setIsCreatingSubfolder(true);
          const result = await createFolder(user.id, name, parentFolderId, description);
          if (result.success) {
            showToast({
              type: 'success',
              title: 'Subfolder created',
              message: `"${name}" created successfully`,
            });
            await refresh();
            const countsResult = await getFolderItemCounts(user.id);
            if (countsResult.success && countsResult.counts) {
              setFolderCounts(countsResult.counts);
            }
            setShowCreateSubfolderModal(false);
            onFolderCreated?.();
            return { success: true };
          } else {
            showToast({
              type: 'error',
              title: 'Create failed',
              message: result.error || 'Failed to create subfolder',
            });
            return { success: false };
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Unknown error';
          showToast({
            type: 'error',
            title: 'Create failed',
            message: msg,
          });
          return { success: false };
        } finally {
          setIsCreatingSubfolder(false);
        }
      },
      [user?.id, parentFolderId, showToast, refresh, onFolderCreated]
    );

    // Build folder hierarchy for the move modal
    const folderHierarchy = useMemo(() => {
      const hierarchy: Record<string, Folder[]> = {};
      if (!allFolders) return hierarchy;

      allFolders.forEach((folder) => {
        const parentId = folder.parent_folder_id || '__root__';
        if (!hierarchy[parentId]) {
          hierarchy[parentId] = [];
        }
        hierarchy[parentId].push(folder);
      });

      return hierarchy;
    }, [allFolders]);

    const ensureFolderPathExpanded = useCallback(
      (folderId: string) => {
        if (!folderId || allFolders.length === 0) return;

        const nextExpandedIds: string[] = [];
        const visited = new Set<string>();
        let current = allFolders.find((folder) => folder.id === folderId) || null;

        while (current && !visited.has(current.id)) {
          visited.add(current.id);
          nextExpandedIds.unshift(current.id);
          current = current.parent_folder_id
            ? allFolders.find((folder) => folder.id === current?.parent_folder_id) || null
            : null;
        }

        setExpandedFolders((prev) => {
          const next = { ...prev };

        nextExpandedIds.forEach((expandedId) => {
          next[expandedId] = {
            isExpanded: true,
            isLoading: false,
          };
        });

          return next;
        });
      },
      [allFolders]
    );

    const handleSelectFolder = useCallback(
      (folder: Folder) => {
        ensureFolderPathExpanded(folder.id);
        onFolderSelect(folder.id);
        onFolderMetadata?.(folder);
      },
      [ensureFolderPathExpanded, onFolderSelect, onFolderMetadata]
    );

    useEffect(() => {
      if (!currentFolderId || allFolders.length === 0) return;

      const nextPathIds: string[] = [];
      const visited = new Set<string>();
      let current = allFolders.find((folder) => folder.id === currentFolderId) || null;

      while (current && current.parent_folder_id && !visited.has(current.id)) {
        visited.add(current.id);
        nextPathIds.unshift(current.parent_folder_id);
        current = allFolders.find((folder) => folder.id === current?.parent_folder_id) || null;
      }

      if (nextPathIds.length === 0) return;

      setExpandedFolders((prev) => {
        const next = { ...prev };

        nextPathIds.forEach((folderId) => {
          next[folderId] = {
            isExpanded: true,
            isLoading: false,
          };
        });

        return next;
      });
    }, [currentFolderId, allFolders, folderHierarchy]);

    useEffect(() => {
      if (!user?.id) return;
      const run = async () => {
        const result = await getFolderItemCounts(user.id);
        if (result.success && result.counts) {
          setFolderCounts(result.counts);
        }
      };
      void run();
    }, [user?.id, allFolders, refresh]);

    return (
      <div className="flex flex-col h-full bg-white overflow-hidden">
        {/* Root Documents */}
        <div
          className={`flex-shrink-0 flex items-center justify-between gap-2 px-2 py-2 mx-2 mt-2 rounded transition-colors ${
            currentFolderId === null
              ? 'bg-blue-100 text-blue-700'
              : 'text-gray-700 hover:bg-gray-100'
          } ${dragOverFolderId === '__root__' ? 'ring-2 ring-blue-400 bg-blue-50' : ''}`}
          onDragOver={(e) => {
            if (!onDocumentDrop) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            setDragOverFolderId('__root__');
          }}
          onDragLeave={() => {
            setDragOverFolderId((current) => (current === '__root__' ? null : current));
          }}
          onDrop={(e) => {
            if (!onDocumentDrop) return;
            e.preventDefault();
            setDragOverFolderId(null);
            try {
              const payloadRaw = e.dataTransfer.getData('application/json') || e.dataTransfer.getData('text/plain');
              if (!payloadRaw) return;
              const payload = JSON.parse(payloadRaw) as { type?: string; id?: string };
              if (payload.type !== 'document' || !payload.id) return;
              void onDocumentDrop(payload.id, null);
            } catch {
              // Ignore malformed drag payloads
            }
          }}
        >
          <button
            type="button"
            onClick={() => onFolderSelect(null)}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
            aria-current={currentFolderId === null ? 'page' : undefined}
          >
            <Folder className="w-4 h-4 flex-shrink-0" />
            <div className="min-w-0">
              <div className="truncate">Root Documents</div>
              <div className="text-[11px] font-normal text-gray-500 truncate">
                Files not currently inside a folder
              </div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => {
              if (currentFolderId) {
                handleCreateSubfolder(currentFolderId);
              } else {
                handleCreateFolder();
              }
            }}
            className="p-1 hover:bg-white/20 rounded text-gray-600 hover:text-gray-900 transition-colors flex-shrink-0"
            title={currentFolderId ? "Create subfolder" : "Create new folder"}
            aria-label={currentFolderId ? "Create subfolder" : "Create new folder"}
          >
            <FolderPlus className="w-4 h-4" />
          </button>
        </div>

        {/* Trash */}
        {onTrashClick && (
          <button
            type="button"
            className="flex-shrink-0 flex items-center justify-between gap-2 px-4 py-2 text-sm font-medium rounded mx-2 text-gray-700 hover:bg-red-50 transition-colors text-left"
            onClick={onTrashClick}
          >
            <div className="flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-red-600" />
              <span>Trash</span>
            </div>
          </button>
        )}

        {/* Folder Tree */}
        <div 
          className="flex-1 min-h-0 overflow-y-auto px-2 py-2"
          style={{ overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}
        >
          {loading && rootFolders.length > 0 && (
            <div className="flex items-center gap-2 px-2 py-2 text-xs text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
              <span>Refreshing folders...</span>
            </div>
          )}
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                <span>Loading folders...</span>
              </div>
            </div>
          ) : rootFolders.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-4">
              No folders yet. Create one to get started.
            </p>
          ) : (
            rootFolders.map((folder) => (
              <FolderTreeNode
                key={folder.id}
                folder={folder}
                currentFolderId={currentFolderId}
                onSelectFolder={handleSelectFolder}
                onExpandChange={handleExpandChange}
                expandedState={expandedFolders}
                folderHierarchy={folderHierarchy}
                userId={user?.id}
                onDelete={handleDeleteFolder}
                onRename={handleRenameFolder}
                onMove={handleMoveFolder}
                onCreateSubfolder={handleCreateSubfolder}
                counts={folderCounts}
                dragOverFolderId={dragOverFolderId}
                setDragOverFolderId={setDragOverFolderId}
                onDocumentDrop={onDocumentDrop}
                onFolderMetadata={onFolderMetadata}
              />
            ))
          )}
        </div>

        {/* Move Folder Modal */}
        {showMoveModal && folderToMove && (
          <MoveFolderModal
            isOpen={showMoveModal}
            onClose={() => {
              setShowMoveModal(false);
              setFolderToMove(null);
            }}
            onMove={handleMoveSubmit}
            currentFolderId={folderToMove}
            allFolders={allFolders}
            folderHierarchy={folderHierarchy}
            isLoading={loading || isMovingFolder}
          />
        )}

        {/* Create Subfolder Modal */}
        {showCreateSubfolderModal && parentFolderId && (
          <CreateSubfolderModal
            isOpen={showCreateSubfolderModal}
            onClose={() => {
              setShowCreateSubfolderModal(false);
              setParentFolderId(null);
            }}
            onCreate={handleCreateSubfolderSubmit}
            parentFolderName={allFolders.find((f) => f.id === parentFolderId)?.name || 'Folder'}
            isLoading={loading || isCreatingSubfolder}
          />
        )}
      </div>
    );
  }
);

FolderSidebar.displayName = 'FolderSidebar';
