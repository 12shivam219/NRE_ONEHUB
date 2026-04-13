import { useCallback, useState, useEffect, useTransition } from 'react';
import { useAuth } from './useAuth';
import { useToast } from '../contexts/ToastContext';
import {
  getFolders,
  createFolder,
  renameFolder,
  deleteFolder,
  moveToFolder,
  getFolderPath,
} from '../lib/api/folders';
import type { Database } from '../lib/database.types';

type Folder = Database['public']['Tables']['folders']['Row'];

export function useFolders(currentFolderId: string | null = null) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [_isPending, startTransition] = useTransition();

  const [folders, setFolders] = useState<Folder[]>([]);
  const [breadcrumb, setBreadcrumb] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load folders for current directory
  const loadFolders = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    setError(null);

    const result = await getFolders(user.id, currentFolderId);

    if (result.success) {
      setFolders(result.folders || []);
    } else {
      setError(result.error || 'Failed to load folders');
      showToast({
        type: 'error',
        title: 'Error',
        message: result.error || 'Failed to load folders',
      });
    }

    setLoading(false);
  }, [user, currentFolderId, showToast]);

  // Load breadcrumb path
  const loadBreadcrumb = useCallback(async () => {
    if (!user || !currentFolderId) {
      setBreadcrumb([]);
      return;
    }

    const result = await getFolderPath(currentFolderId, user.id);

    if (result.success) {
      setBreadcrumb(result.path || []);
    } else {
      showToast({
        type: 'error',
        title: 'Error',
        message: result.error || 'Failed to load breadcrumb',
      });
    }
  }, [user, currentFolderId, showToast]);

  // Load both folders and breadcrumb on mount or when currentFolderId changes
  useEffect(() => {
    startTransition(() => {
      void loadFolders();
      void loadBreadcrumb();
    });
  }, [loadFolders, loadBreadcrumb, startTransition]);

  // Create new folder
  const createNewFolder = useCallback(
    async (name: string, description?: string) => {
      if (!user) return { success: false, error: 'Not authenticated' };

      const result = await createFolder(user.id, name, currentFolderId, description);

      if (result.success) {
        showToast({
          type: 'success',
          title: 'Folder created',
          message: `"${name}" created successfully`,
        });
        await loadFolders();
        return { success: true, folder: result.folder };
      } else {
        showToast({
          type: 'error',
          title: 'Create failed',
          message: result.error || 'Failed to create folder',
        });
        return { success: false, error: result.error };
      }
    },
    [user, currentFolderId, showToast, loadFolders]
  );

  // Rename folder
  const renameFolderAction = useCallback(
    async (folderId: string, newName: string) => {
      if (!user) return { success: false, error: 'Not authenticated' };

      const result = await renameFolder(user.id, folderId, newName);

      if (result.success) {
        showToast({
          type: 'success',
          title: 'Folder renamed',
          message: `Renamed to "${newName}"`,
        });
        await loadFolders();
        return { success: true, folder: result.folder };
      } else {
        showToast({
          type: 'error',
          title: 'Rename failed',
          message: result.error || 'Failed to rename folder',
        });
        return { success: false, error: result.error };
      }
    },
    [user, showToast, loadFolders]
  );

  // Delete folder
  const deleteFolderAction = useCallback(
    async (folderId: string, deleteContents: boolean = false) => {
      if (!user) return { success: false, error: 'Not authenticated' };

      const result = await deleteFolder(user.id, folderId, deleteContents);

      if (result.success) {
        showToast({
          type: 'success',
          title: 'Folder deleted',
          message: 'Folder removed successfully',
        });
        await loadFolders();
        return { success: true };
      } else {
        showToast({
          type: 'error',
          title: 'Delete failed',
          message: result.error || 'Failed to delete folder',
        });
        return { success: false, error: result.error };
      }
    },
    [user, showToast, loadFolders]
  );

  // Move item to folder
  const moveItem = useCallback(
    async (itemId: string, itemType: 'folder' | 'document', targetFolderId: string | null) => {
      if (!user) return { success: false, error: 'Not authenticated' };

      const result = await moveToFolder(user.id, itemId, itemType, targetFolderId);

      if (result.success) {
        showToast({
          type: 'success',
          title: 'Item moved',
          message: 'Item moved successfully',
        });
        // Refresh both source and target folders
        await loadFolders();
        return { success: true };
      } else {
        showToast({
          type: 'error',
          title: 'Move failed',
          message: result.error || 'Failed to move item',
        });
        return { success: false, error: result.error };
      }
    },
    [user, showToast, loadFolders]
  );

  return {
    folders,
    breadcrumb,
    loading,
    error,
    createNewFolder,
    renameFolderAction,
    deleteFolderAction,
    moveItem,
    refresh: loadFolders,
  };
}
