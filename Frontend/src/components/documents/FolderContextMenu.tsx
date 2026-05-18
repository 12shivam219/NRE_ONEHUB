import { memo, useRef, useEffect } from 'react';
import { Pencil, Trash2, FolderPlus, Move } from 'lucide-react';

interface FolderContextMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  onClose: () => void;
  onRename: () => void;
  onDelete: () => void;
  onMove: () => void;
  onCreateSubfolder: () => void;
  disabled?: boolean;
}

export const FolderContextMenu = memo(
  ({
    isOpen,
    position,
    onClose,
    onRename,
    onDelete,
    onMove,
    onCreateSubfolder,
    disabled = false,
  }: FolderContextMenuProps) => {
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      if (!isOpen) return;

      const handleClickOutside = (event: MouseEvent) => {
        if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
          onClose();
        }
      };

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          onClose();
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);

      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
      <div
        ref={menuRef}
        className="fixed bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] py-1 w-48 overflow-hidden"
        style={{
          top: `${position.y}px`,
          left: `${position.x}px`,
        }}
        role="menu"
      >
        {/* Create Subfolder */}
        <button
          onClick={() => {
            onCreateSubfolder();
            onClose();
          }}
          disabled={disabled}
          className="w-full px-4 py-2 text-sm text-left text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
          role="menuitem"
        >
          <FolderPlus className="w-4 h-4" />
          Create Subfolder
        </button>

        {/* Move */}
        <button
          onClick={() => {
            onMove();
            onClose();
          }}
          disabled={disabled}
          className="w-full px-4 py-2 text-sm text-left text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed border-t border-gray-100"
          role="menuitem"
        >
          <Move className="w-4 h-4" />
          Move
        </button>

        {/* Rename */}
        <button
          onClick={() => {
            onRename();
            onClose();
          }}
          disabled={disabled}
          className="w-full px-4 py-2 text-sm text-left text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed border-t border-gray-100"
          role="menuitem"
        >
          <Pencil className="w-4 h-4" />
          Rename
        </button>

        {/* Delete */}
        <button
          onClick={() => {
            onDelete();
            onClose();
          }}
          disabled={disabled}
          className="w-full px-4 py-2 text-sm text-left text-red-700 hover:bg-red-50 transition-colors flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed border-t border-gray-100"
          role="menuitem"
        >
          <Trash2 className="w-4 h-4" />
          Delete
        </button>
      </div>
    );
  }
);

FolderContextMenu.displayName = 'FolderContextMenu';
