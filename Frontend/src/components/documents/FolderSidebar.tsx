import { memo, useState, useCallback, useEffect, useTransition } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderPlus, Loader2, Trash2 } from 'lucide-react';
import { useFolders } from '../../hooks/useFolders';
import { getFolders, deleteFolder } from '../../lib/api/folders';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../contexts/ToastContext';
import type { Database } from '../../lib/database.types';

type Folder = Database['public']['Tables']['folders']['Row'];

interface FolderSidebarProps {
  currentFolderId: string | null;
  onFolderSelect: (folderId: string | null) => void;
  onCreateFolder?: () => void;
  onFolderDeleted?: () => void;
  onFolderCreated?: () => void;
}

interface FolderNodeState {
  isExpanded: boolean;
  isLoading: boolean;
  subfolders?: Folder[];
}

const FolderTreeNode = memo(
  ({
    folder,
    currentFolderId,
    onSelect,
    level = 0,
    onExpandChange,
    expandedState,
    userId,
    onDelete,
  }: {
    folder: Folder;
    currentFolderId: string | null;
    onSelect: (folderId: string) => void;
    level?: number;
    onExpandChange: (folderId: string, isExpanded: boolean, subfolders?: Folder[]) => void;
    expandedState: Record<string, FolderNodeState>;
    userId?: string;
    onDelete?: (folderId: string, folderName: string) => Promise<void>;
  }) => {
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    
    const nodeState = expandedState[folder.id] || { isExpanded: false, isLoading: false };
    const isSelected = currentFolderId === folder.id;

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

    const handleToggleExpand = async () => {
      const currentState = expandedState[folder.id] || { isExpanded: false, isLoading: false };
      console.log(`Toggle expand for folder (${folder.id}):`, { currently: currentState.isExpanded, toBecome: !currentState.isExpanded });
      
      if (currentState.isExpanded) {
        // Collapse
        console.log(`Collapsing folder`);
        onExpandChange(folder.id, false, currentState.subfolders);
        return;
      }

      // Expand - set loading state first
      console.log(`Expanding folder, fetching subfolders...`);
      onExpandChange(folder.id, true, currentState.subfolders);

      // Then load subfolders
      if (!userId) {
        console.log('No userId, skipping subfolder fetch');
        return;
      }
      try {
        const result = await getFolders(userId, folder.id);
        console.log(`Subfolder fetch result:`, result);
        if (result.success && result.folders) {
          // Update with loaded subfolders
          console.log(`Got ${result.folders.length} subfolders`);
          onExpandChange(folder.id, true, result.folders);
        } else {
          // Collapse on error
          console.error(`Failed to load subfolders: ${result.error}`);
          onExpandChange(folder.id, false, undefined);
        }
      } catch (error) {
        console.error('Failed to load subfolders:', error);
        // Collapse on error
        onExpandChange(folder.id, false, undefined);
      }
    };

    return (
      <div>
        <div
          className={`flex items-center gap-2 px-2 py-2 rounded transition-colors ${
            isSelected
              ? 'bg-blue-100 text-blue-700'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
        >
          {/* Expand/Collapse Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              void handleToggleExpand();
            }}
            className="p-0 hover:bg-gray-200 rounded transition-colors flex-shrink-0"
            title={nodeState.isExpanded ? 'Collapse' : 'Expand'}
            aria-label={nodeState.isExpanded ? 'Collapse folder' : 'Expand folder'}
          >
            {nodeState.isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : nodeState.isExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>

          {/* Folder Icon */}
          <Folder className="w-4 h-4 flex-shrink-0" />

          {/* Folder Name - Clickable to navigate */}
          <button
            onClick={() => onSelect(folder.id)}
            className={`flex-1 text-left truncate text-sm font-medium hover:underline transition-all ${
              isSelected ? 'font-semibold' : ''
            }`}
            title={folder.name}
          >
            {folder.name}
          </button>

          {/* Delete Button */}
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowDeleteConfirm(true);
              }}
              className="p-1 hover:bg-red-100 rounded text-gray-400 hover:text-red-600 transition-colors flex-shrink-0"
              title="Delete folder"
              aria-label="Delete folder"
              disabled={isDeleting}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Delete Confirmation Dialog */}
        {showDeleteConfirm && (
          <div className="mx-2 mt-1 p-2 bg-red-50 border border-red-200 rounded text-xs">
            <p className="text-red-800 mb-2">
              Delete "{folder.name}"? This will delete the folder and all its contents.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-2 py-1 text-xs bg-white text-gray-700 border border-gray-200 rounded hover:bg-gray-50"
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
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
        {nodeState.isExpanded && nodeState.subfolders && nodeState.subfolders.length > 0 && (
          <div>
            {nodeState.subfolders.map((subfolder) => (
              <FolderTreeNode
                key={subfolder.id}
                folder={subfolder}
                currentFolderId={currentFolderId}
                onSelect={onSelect}
                level={level + 1}
                onExpandChange={onExpandChange}
                expandedState={expandedState}
                userId={userId}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}

        {/* Empty subfolders message */}
        {nodeState.isExpanded && nodeState.subfolders && nodeState.subfolders.length === 0 && (
          <div
            className="text-xs text-gray-500 italic px-2 py-1"
            style={{ paddingLeft: `${(level + 1) * 16 + 16}px` }}
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
  ({ currentFolderId, onFolderSelect, onCreateFolder, onFolderDeleted, onFolderCreated }: FolderSidebarProps) => {
    const { user } = useAuth();
    const { folders, loading, refresh } = useFolders(null); // Load root folders
    const { showToast } = useToast();
    const [expandedFolders, setExpandedFolders] = useState<Record<string, FolderNodeState>>({});
    const [_isPending, startTransition] = useTransition();

    // Preload root folders and update expanded state
    useEffect(() => {
      if (loading || !folders || folders.length === 0) return;

      // Initialize expanded state for root folders (default to collapsed)
      const initialState: Record<string, FolderNodeState> = {};
      folders.forEach((folder) => {
        if (!initialState[folder.id]) {
          initialState[folder.id] = { isExpanded: false, isLoading: false };
        }
      });
      startTransition(() => {
        setExpandedFolders((prev) => ({ ...prev, ...initialState }));
      });
    }, [folders, loading, startTransition]);

    const handleExpandChange = useCallback(
      (folderId: string, isExpanded: boolean, subfolders?: Folder[]) => {
        console.log(`handleExpandChange called:`, { folderId, isExpanded, subfoldersCount: subfolders?.length || 0 });
        setExpandedFolders((prev) => {
          const updated = { ...prev };
          updated[folderId] = {
            isExpanded,
            isLoading: false,
            subfolders,
          };
          console.log(`Updated expanded folders state:`, updated[folderId]);
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
          const result = await deleteFolder(user.id, folderId);
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
            
            // Clear expanded folders state to force UI refresh
            setExpandedFolders({});
            
            // Refresh the root folder structure
            await refresh();
            
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
          console.error('Error deleting folder:', error);
          showToast({
            type: 'error',
            title: 'Delete failed',
            message: msg,
          });
        }
      },
      [user, currentFolderId, onFolderSelect, showToast, onFolderDeleted, refresh]
    );

    const handleCreateFolder = useCallback(() => {
      if (onCreateFolder) {
        onCreateFolder();
      }
    }, [onCreateFolder]);

    // Refresh when a folder is created to show new subfolders
    useEffect(() => {
      if (!onFolderCreated) return;
      
      // Use setTimeout to avoid setting state synchronously in effect
      // This invalidates cached subfolder lists without cascading renders
      const timer = setTimeout(() => {
        setExpandedFolders({});
        void refresh();
      }, 0);
      
      return () => clearTimeout(timer);
    }, [onFolderCreated, refresh]);

    return (
      <div className="flex flex-col h-full bg-white overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-200 bg-white">
          <h3 className="text-sm font-semibold text-gray-900">Folders</h3>
          <button
            onClick={handleCreateFolder}
            className="p-1 hover:bg-gray-100 rounded text-gray-600 hover:text-gray-900 transition-colors"
            title="Create new folder"
            aria-label="Create new folder"
          >
            <FolderPlus className="w-4 h-4" />
          </button>
        </div>

        {/* All Documents / Root */}
        <div
          className={`flex-shrink-0 flex items-center gap-2 px-4 py-2 text-sm font-medium rounded cursor-pointer mx-2 mt-2 transition-colors ${
            currentFolderId === null
              ? 'bg-blue-100 text-blue-700'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
          onClick={() => onFolderSelect(null)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              onFolderSelect(null);
            }
          }}
        >
          <Folder className="w-4 h-4" />
          <span>All Documents</span>
        </div>

        {/* Folder Tree */}
        <div 
          className="flex-1 min-h-0 overflow-y-auto px-2 py-2"
          style={{ overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}
        >
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
            </div>
          ) : folders.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-4">
              No folders yet. Create one to get started.
            </p>
          ) : (
            folders.map((folder) => (
              <FolderTreeNode
                key={folder.id}
                folder={folder}
                currentFolderId={currentFolderId}
                onSelect={(folderId) => onFolderSelect(folderId)}
                onExpandChange={handleExpandChange}
                expandedState={expandedFolders}
                userId={user?.id}
                onDelete={handleDeleteFolder}
              />
            ))
          )}
        </div>
      </div>
    );
  }
);

FolderSidebar.displayName = 'FolderSidebar';
