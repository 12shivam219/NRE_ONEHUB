import { memo, useState, useCallback, useMemo, useId } from 'react';
import { X, Loader2, ChevronDown } from 'lucide-react';
import type { Database } from '../../lib/database.types';

type Folder = Database['public']['Tables']['folders']['Row'];

interface MoveFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMove: (targetFolderId: string | null) => Promise<{ success: boolean } | void>;
  currentFolderId: string;
  allFolders: Folder[];
  folderHierarchy: Record<string, Folder[]>;
  isLoading?: boolean;
}

export const MoveFolderModal = memo(
  ({
    isOpen,
    onClose,
    onMove,
    currentFolderId,
    allFolders,
    folderHierarchy,
    isLoading = false,
  }: MoveFolderModalProps) => {
    const [isMoving, setIsMoving] = useState(false);
    const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
    const titleId = useId();
    const descriptionId = useId();

    // Get the current folder to show its name
    const currentFolder = useMemo(
      () => allFolders.find((f) => f.id === currentFolderId),
      [allFolders, currentFolderId]
    );

    // Build a tree structure for the folders, excluding the current folder and its children
    const getValidDestinations = useCallback(
      (folders: Folder[], excludeIds: Set<string>): Folder[] => {
        return folders.filter((f) => !excludeIds.has(f.id));
      },
      []
    );

    // Get all descendant folder IDs to prevent moving to a subfolder
    const getDescendantIds = useCallback((folderId: string): Set<string> => {
      const descendants = new Set<string>([folderId]);
      const queue = [folderId];

      while (queue.length > 0) {
        const id = queue.shift()!;
        const children = folderHierarchy[id] || [];
        children.forEach((child) => {
          descendants.add(child.id);
          queue.push(child.id);
        });
      }

      return descendants;
    }, [folderHierarchy]);

    const descendantIds = useMemo(() => getDescendantIds(currentFolderId), [currentFolderId, getDescendantIds]);
    const validDestinations = useMemo(() => getValidDestinations(allFolders, descendantIds), [allFolders, descendantIds, getValidDestinations]);

    // Group folders by parent
    const rootFolders = useMemo(
      () => validDestinations.filter((f) => !f.parent_folder_id),
      [validDestinations]
    );

    const handleMove = async () => {
      try {
        setIsMoving(true);
        const result = await onMove(selectedFolderId);
        if (!result || result.success !== false) {
          onClose();
        }
      } finally {
        setIsMoving(false);
      }
    };

    const toggleExpanded = (folderId: string) => {
      setExpandedFolders((prev) => {
        const next = new Set(prev);
        if (next.has(folderId)) {
          next.delete(folderId);
        } else {
          next.add(folderId);
        }
        return next;
      });
    };

    const FolderOption = memo(
      ({
        folder,
        level = 0,
      }: {
        folder: Folder;
        level?: number;
      }) => {
        const children = folderHierarchy[folder.id]?.filter((f) => validDestinations.find((vf) => vf.id === f.id)) || [];
        const isExpanded = expandedFolders.has(folder.id);
        const hasChildren = children.length > 0;
        const isSelected = selectedFolderId === folder.id;

        return (
          <div
            key={folder.id}
            role="treeitem"
            aria-expanded={hasChildren ? isExpanded : undefined}
            aria-selected={isSelected}
          >
            <div
              className={`w-full px-3 py-2 text-sm flex items-center gap-2 transition-colors rounded ${
                isSelected ? 'bg-blue-100 text-blue-900 font-medium' : 'text-gray-700 hover:bg-gray-50'
              }`}
              style={{ paddingLeft: `${level * 16 + 12}px` }}
            >
              {hasChildren && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleExpanded(folder.id);
                  }}
                  className="p-0 hover:bg-gray-200 rounded transition-colors flex-shrink-0"
                  aria-label={isExpanded ? `Collapse ${folder.name}` : `Expand ${folder.name}`}
                  aria-expanded={isExpanded}
                >
                  <ChevronDown
                    className={`w-4 h-4 transition-transform ${isExpanded ? '' : '-rotate-90'}`}
                  />
                </button>
              )}
              {!hasChildren && <div className="w-4" />}
              <button
                type="button"
                onClick={() => setSelectedFolderId(folder.id)}
                className="flex-1 truncate text-left"
                aria-pressed={isSelected}
              >
                {folder.name}
              </button>
            </div>

            {hasChildren && isExpanded && (
              <div role="group">
                {children.map((child) => (
                  <FolderOption key={child.id} folder={child} level={level + 1} />
                ))}
              </div>
            )}
          </div>
        );
      }
    );

    FolderOption.displayName = 'FolderOption';

    if (!isOpen) return null;

    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div
          className="bg-white rounded-lg shadow-lg max-w-md w-full max-h-96 flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 flex-shrink-0">
            <h2 id={titleId} className="text-lg font-semibold text-gray-900">
              Move "{currentFolder?.name || 'Folder'}"
            </h2>
            <button
              type="button"
              onClick={onClose}
              disabled={isMoving || isLoading}
              className="text-gray-500 hover:text-gray-700 disabled:opacity-50"
              aria-label="Close move folder dialog"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <p id={descriptionId} className="px-4 pt-3 text-sm text-gray-500">
            Select a destination folder or choose Root Documents to move this folder out of its current parent.
          </p>

          {/* Destinations */}
          <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2" role="tree" aria-label="Available folder destinations">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                  <span>Loading folder destinations...</span>
                </div>
              </div>
            ) : rootFolders.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">
                No valid destinations available
              </p>
            ) : (
              <>
                {/* Root option (move to root level) */}
                <button
                  type="button"
                  onClick={() => setSelectedFolderId(null)}
                  className={`w-full px-3 py-2 text-sm text-left flex items-center gap-2 transition-colors rounded ${
                    selectedFolderId === null
                      ? 'bg-blue-100 text-blue-900 font-medium'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                  aria-pressed={selectedFolderId === null}
                >
                  <div className="w-4" />
                  <span className="truncate font-medium">Root Documents</span>
                </button>

                {/* Folder tree */}
                {rootFolders.map((folder) => (
                  <FolderOption key={folder.id} folder={folder} level={0} />
                ))}
              </>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 p-4 border-t border-gray-200 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isMoving || isLoading}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleMove}
              disabled={isMoving || isLoading || selectedFolderId === currentFolderId}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isMoving && <Loader2 className="w-4 h-4 animate-spin" />}
              {isMoving ? 'Moving...' : 'Move'}
            </button>
          </div>
        </div>
      </div>
    );
  }
);

MoveFolderModal.displayName = 'MoveFolderModal';
