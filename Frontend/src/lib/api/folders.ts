import { supabase } from '../supabase';
import type { Database } from '../database.types';
import { logger, handleApiError } from '../errorHandler';
import { isSafeStoragePath } from '../utils';

type Folder = Database['public']['Tables']['folders']['Row'];

export type FolderItemCounts = Record<string, { subfolders: number; documents: number }>;

/**
 * Get all folders for a user, optionally filtered by parent folder
 */
export const getFolders = async (
  userId: string,
  parentFolderId: string | null = null
): Promise<{ success: boolean; folders?: Folder[]; error?: string }> => {
  try {
    if (!userId) {
      return { success: false, error: 'User is required' };
    }

    let query = supabase
      .from('folders')
      .select('*');

    query = query.eq('is_deleted', false);

    if (parentFolderId === undefined || parentFolderId === null) {
      query = query.is('parent_folder_id', null);
    } else {
      query = query.eq('parent_folder_id', parentFolderId);
    }

    const { data, error } = await query.order('name', { ascending: true });

    if (error) {
      const appError = handleApiError(error, {
        component: 'getFolders',
        action: 'fetch_folders',
        resource: userId,
      });
      return { success: false, error: appError.message };
    }

    return { success: true, folders: data || [] };
  } catch (error) {
    const appError = handleApiError(error, {
      component: 'getFolders',
      action: 'fetch_folders',
    });
    return { success: false, error: appError.message };
  }
};

export const getAllFolders = async (
  userId: string
): Promise<{ success: boolean; folders?: Folder[]; error?: string }> => {
  try {
    if (!userId) {
      return { success: false, error: 'User is required' };
    }

    const { data, error } = await supabase
      .from('folders')
      .select('*')
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .order('name', { ascending: true });

    if (error) {
      const appError = handleApiError(error, {
        component: 'getAllFolders',
        action: 'fetch_all_folders',
        resource: userId,
      });
      return { success: false, error: appError.message };
    }

    return { success: true, folders: data || [] };
  } catch (error) {
    const appError = handleApiError(error, {
      component: 'getAllFolders',
      action: 'fetch_all_folders',
    });
    return { success: false, error: appError.message };
  }
};

/**
 * Get folder hierarchy for breadcrumb navigation
 * BUG FIX #3: Add max depth limit and circular reference detection
 */
export const getFolderPath = async (
  folderId: string,
  userId: string
): Promise<{ success: boolean; path?: Folder[]; error?: string }> => {
  try {
    if (!userId) {
      return { success: false, error: 'User is required' };
    }

    const MAX_BREADCRUMB_DEPTH = 100;
    const visitedIds = new Set<string>();
    const path: Folder[] = [];
    let currentId: string | null = folderId;
    let depth = 0;

    while (currentId && depth < MAX_BREADCRUMB_DEPTH) {
      // Detect circular references (BUG #3)
      if (visitedIds.has(currentId)) {
        logger.error('Circular folder reference detected in breadcrumb', {
          component: 'getFolderPath',
          folderId,
          circularAt: currentId,
        });
        return { success: false, error: 'Corrupted folder hierarchy detected. Contact support.' };
      }
      visitedIds.add(currentId);

      const { data, error }: { data: Folder | null; error: any } = await supabase
        .from('folders')
        .select('id, parent_folder_id, name')
        .eq('id', currentId)
        .single();

      if (error || !data) {
        return { success: false, error: 'Folder not found' };
      }

      path.unshift(data);
      currentId = data.parent_folder_id;
      depth++;
    }

    if (depth >= MAX_BREADCRUMB_DEPTH) {
      logger.warn('Folder nesting exceeds safe depth limit', {
        component: 'getFolderPath',
        depth,
        folderId,
      });
      return { success: false, error: 'Folder structure too deeply nested. Simplify hierarchy.' };
    }

    return { success: true, path };
  } catch (error) {
    const appError = handleApiError(error, {
      component: 'getFolderPath',
      action: 'fetch_folder_path',
    });
    return { success: false, error: appError.message };
  }
};

/**
 * Create a new folder
 * BUG FIX #13: Add depth check, #11: Better character validation, #9: Verify ownership
 */
export const createFolder = async (
  userId: string,
  name: string,
  parentFolderId: string | null = null,
  description?: string
): Promise<{ success: boolean; folder?: Folder; error?: string }> => {
  try {
    if (!userId) {
      return { success: false, error: 'User is required' };
    }

    // Validate folder name
    if (!name || name.trim().length === 0) {
      return { success: false, error: 'Folder name cannot be empty' };
    }

    if (name.trim().length > 255) {
      return {
        success: false,
        error: 'Folder name cannot exceed 255 characters',
      };
    }

    // BUG FIX #11: Improved character validation - block control characters
    if (/[\x00-\x1f\x7f]/.test(name)) { // eslint-disable-line no-control-regex
      return {
        success: false,
        error: 'Folder name contains invalid control characters',
      };
    }

    // Block OS-reserved names
    if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(name.trim())) {
      return {
        success: false,
        error: 'Folder name is reserved by the system',
      };
    }

    // Block leading/trailing whitespace
    if (name !== name.trim()) {
      return {
        success: false,
        error: 'Folder name cannot start or end with whitespace',
      };
    }

    if (parentFolderId) {
      const { data: parentFolder, error: parentError } = await supabase
        .from('folders')
        .select('id, user_id')
        .eq('id', parentFolderId)
        .single();

      if (parentError || !parentFolder) {
        return { success: false, error: 'Parent folder not found' };
      }

      // BUG FIX #9: Verify ownership of parent
      if (parentFolder.user_id !== userId) {
        return { success: false, error: 'You do not have permission to create folders here' };
      }

      // BUG FIX #13: Check nesting depth using single query instead of N+1
      const MAX_FOLDER_DEPTH = 50;
      let depth = 0;
      let currentParentId: string | null = parentFolderId;
      const visited = new Set<string>();

      // Fetch all ancestors in one query by traversing parent_folder_id chain
      while (currentParentId && depth < MAX_FOLDER_DEPTH) {
        if (visited.has(currentParentId)) {
          return { success: false, error: 'Circular folder reference detected' };
        }
        visited.add(currentParentId);

        const { data: parent } = await supabase
          .from('folders')
          .select('parent_folder_id')
          .eq('id', currentParentId)
          .single() as { data: { parent_folder_id: string | null } | null };

        currentParentId = parent?.parent_folder_id || null;
        depth++;
      }

      if (depth >= MAX_FOLDER_DEPTH) {
        return {
          success: false,
          error: `Cannot nest folders more than ${MAX_FOLDER_DEPTH} levels deep`,
        };
      }
    }

    // Validate description if provided
    if (description && /[\x00-\x1f\x7f]/.test(description)) { // eslint-disable-line no-control-regex
      return {
        success: false,
        error: 'Description contains invalid control characters',
      };
    }

    const { data, error } = await supabase
      .from('folders')
      .insert({
        user_id: userId,
        name: name.trim(),
        parent_folder_id: parentFolderId,
        description: description?.trim() || null,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        // Unique constraint violation
        return {
          success: false,
          error: 'A folder with this name already exists in this location',
        };
      }
      const appError = handleApiError(error, {
        component: 'createFolder',
        action: 'create_folder',
        resource: name,
      });
      return { success: false, error: appError.message };
    }

    logger.info('Folder created successfully', {
      component: 'createFolder',
      resource: data.id,
      data: { name, parentFolderId },
    });

    return { success: true, folder: data };
  } catch (error) {
    const appError = handleApiError(error, {
      component: 'createFolder',
      action: 'create_folder',
    });
    return { success: false, error: appError.message };
  }
};

/**
 * Rename a folder
 * BUG FIX #14: Add character validation like createFolder, #9: Verify ownership
 */
export const renameFolder = async (
  userId: string,
  folderId: string,
  newName: string
): Promise<{ success: boolean; folder?: Folder; error?: string }> => {
  try {
    if (!userId) {
      return { success: false, error: 'User is required' };
    }

    if (!newName || newName.trim().length === 0) {
      return { success: false, error: 'Folder name cannot be empty' };
    }

    if (newName.trim().length > 255) {
      return {
        success: false,
        error: 'Folder name cannot exceed 255 characters',
      };
    }

    // BUG FIX #14: Add same validation as createFolder
    if (/[\x00-\x1f\x7f]/.test(newName)) { // eslint-disable-line no-control-regex
      return {
        success: false,
        error: 'Folder name contains invalid control characters',
      };
    }

    if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(newName.trim())) {
      return {
        success: false,
        error: 'Folder name is reserved by the system',
      };
    }

    if (newName !== newName.trim()) {
      return {
        success: false,
        error: 'Folder name cannot start or end with whitespace',
      };
    }

    // Verify folder exists and verify ownership
    const { data: folder, error: fetchError } = await supabase
      .from('folders')
      .select('id, parent_folder_id, user_id')
      .eq('id', folderId)
      .single();

    if (fetchError || !folder) {
      return { success: false, error: 'Folder not found' };
    }

    // BUG FIX #9: Verify ownership
    if (folder.user_id !== userId) {
      return { success: false, error: 'You do not have permission to rename this folder' };
    }

    const { data, error } = await supabase
      .from('folders')
      .update({ name: newName.trim() })
      .eq('id', folderId)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return {
          success: false,
          error: 'A folder with this name already exists in this location',
        };
      }
      const appError = handleApiError(error, {
        component: 'renameFolder',
        action: 'rename_folder',
        resource: folderId,
      });
      return { success: false, error: appError.message };
    }

    return { success: true, folder: data };
  } catch (error) {
    const appError = handleApiError(error, {
      component: 'renameFolder',
      action: 'rename_folder',
    });
    return { success: false, error: appError.message };
  }
};

/**
 * Move a folder or document to another folder
 * BUG FIX #4: Add circular reference with depth limit, #9: Verify ownership
 */
export const moveToFolder = async (
  userId: string,
  itemId: string,
  itemType: 'folder' | 'document',
  targetFolderId: string | null
): Promise<{ success: boolean; error?: string }> => {
  try {
    if (!userId) {
      return { success: false, error: 'User is required' };
    }

    // BUG FIX #9: Verify target folder ownership
    if (targetFolderId) {
      const { data: targetFolder, error: targetError } = await supabase
        .from('folders')
        .select('id, user_id')
        .eq('id', targetFolderId)
        .single();

      if (targetError || !targetFolder) {
        return { success: false, error: 'Target folder not found' };
      }

      if (targetFolder.user_id !== userId) {
        return { success: false, error: 'You do not have permission to move items there' };
      }
    }

    // Prevent circular references (folder cannot be moved to its own subfolder)
    if (itemType === 'folder' && targetFolderId) {
      if (itemId === targetFolderId) {
        return { success: false, error: 'Cannot move a folder into itself' };
      }

      // BUG FIX #9: Verify source folder ownership
      const { data: sourceFolder, error: sourceError } = await supabase
        .from('folders')
        .select('id, user_id, parent_folder_id')
        .eq('id', itemId)
        .single();

      if (sourceError || !sourceFolder) {
        return { success: false, error: 'Folder not found' };
      }

      if (sourceFolder.user_id !== userId) {
        return { success: false, error: 'You do not have permission to move this folder' };
      }

      // BUG FIX #4: Check for circular reference with depth limit and visited tracking
      let current = targetFolderId;
      let depth = 0;
      const MAX_DEPTH = 100;
      const visitedIds = new Set<string>();

      while (current && depth < MAX_DEPTH) {
        if (visitedIds.has(current)) {
          return { success: false, error: 'Circular reference detected' };
        }
        visitedIds.add(current);

        if (current === itemId) {
          return {
            success: false,
            error: 'Cannot move folder to its own subfolder',
          };
        }

        const { data: parent } = await supabase
          .from('folders')
          .select('parent_folder_id, user_id')
          .eq('id', current)
          .single();

        if (!parent || parent.user_id !== userId) {
          break;
        }

        current = parent.parent_folder_id;
        depth++;
      }
    } else if (itemType === 'document') {
      // BUG FIX #9: Verify document ownership
      const { data: doc, error: docError } = await supabase
        .from('documents')
        .select('id, user_id')
        .eq('id', itemId)
        .single();

      if (docError || !doc) {
        return { success: false, error: 'Document not found' };
      }

      if (doc.user_id !== userId) {
        return { success: false, error: 'You do not have permission to move this document' };
      }
    }

    if (itemType === 'folder') {
      const { error } = await supabase
        .from('folders')
        .update({ parent_folder_id: targetFolderId })
        .eq('id', itemId);

      if (error) {
        const appError = handleApiError(error, {
          component: 'moveToFolder',
          action: 'move_folder',
          resource: itemId,
        });
        return { success: false, error: appError.message };
      }
    } else {
      const { error } = await supabase
        .from('documents')
        .update({ folder_id: targetFolderId })
        .eq('id', itemId);

      if (error) {
        const appError = handleApiError(error, {
          component: 'moveToFolder',
          action: 'move_document',
          resource: itemId,
        });
        return { success: false, error: appError.message };
      }
    }

    return { success: true };
  } catch (error) {
    const appError = handleApiError(error, {
      component: 'moveToFolder',
      action: 'move_item',
    });
    return { success: false, error: appError.message };
  }
};

/**
 * Delete a folder and optionally its contents
 */
export const deleteFolder = async (
  userId: string,
  folderId: string,
  deleteContents: boolean = false
): Promise<{ success: boolean; error?: string }> => {
  try {
    if (!userId) {
      return { success: false, error: 'User is required' };
    }

    // Verify folder exists
    const { data: folder, error: fetchError } = await supabase
      .from('folders')
      .select('id, user_id')
      .eq('id', folderId)
      .single();

    if (fetchError || !folder) {
      return { success: false, error: 'Folder not found' };
    }

    if (folder.user_id !== userId) {
      return { success: false, error: 'You do not have permission to delete this folder' };
    }

    if (deleteContents) {
      // Delete all files in this folder and subfolders recursively, including storage objects.
      const folderIdsToDelete: string[] = [];
      const queue: string[] = [folderId];

      while (queue.length > 0) {
        const currentFolderId = queue.shift() as string;
        folderIdsToDelete.push(currentFolderId);

        const { data: children, error: childError } = await supabase
          .from('folders')
          .select('id')
          .eq('parent_folder_id', currentFolderId);

        if (childError) {
          const appError = handleApiError(childError, {
            component: 'deleteFolder',
            action: 'fetch_subfolders_for_delete',
            resource: currentFolderId,
          });
          return { success: false, error: appError.message };
        }

        for (const child of children || []) {
          queue.push(child.id);
        }
      }

      const { data: docsToDelete, error: docsFetchError } = await supabase
        .from('documents')
        .select('id, storage_path')
        .in('folder_id', folderIdsToDelete);

      if (docsFetchError) {
        const appError = handleApiError(docsFetchError, {
          component: 'deleteFolder',
          action: 'fetch_documents_for_delete',
          resource: folderId,
        });
        return { success: false, error: appError.message };
      }

      const storagePaths = (docsToDelete || [])
        .map((doc: any) => doc.storage_path)
        .filter((path: any): path is string => Boolean(path) && isSafeStoragePath(path));

      // BUG FIX #2 & #10: Soft delete database first, then delete storage to prevent orphaning
      // This way if storage deletion fails, documents are still recoverable
      if ((docsToDelete || []).length > 0) {
        const { error: softDeleteError } = await supabase
          .from('documents')
          .update({
            is_deleted: true,
            deleted_at: new Date().toISOString(),
          })
          .in('folder_id', folderIdsToDelete);

        if (softDeleteError) {
          logger.error('Failed to soft delete documents - aborting folder deletion', {
            component: 'deleteFolder',
            resource: folderId,
            error: softDeleteError.message,
          });
          const appError = handleApiError(softDeleteError, {
            component: 'deleteFolder',
            action: 'soft_delete_documents',
            resource: folderId,
          });
          return { success: false, error: appError.message };
        }
      }

      // Now delete storage objects (safe to proceed since DB is already updated)
      if (storagePaths.length > 0) {
        const { error: storageDeleteError } = await supabase.storage
          .from('documents')
          .remove(storagePaths);

        if (storageDeleteError) {
          logger.warn('Failed to delete storage objects - will be cleaned up later', {
            component: 'deleteFolder',
            resource: folderId,
            storagePaths: storagePaths.length,
            error: storageDeleteError.message,
          });
          // Don't fail the operation - storage will be cleaned up by background job
        }
      }

      // Finally hard delete the soft-deleted documents
      if ((docsToDelete || []).length > 0) {
        const { error: hardDeleteError } = await supabase
          .from('documents')
          .delete()
          .in('folder_id', folderIdsToDelete);

        if (hardDeleteError) {
          logger.error('Failed to hard delete documents after soft delete', {
            component: 'deleteFolder',
            storagePaths: storagePaths.length,
          });
          return {
            success: false,
            error: 'Partial deletion failure - contact support for remediation',
          };
        }
      }

      const { error } = await supabase
        .from('folders')
        .delete()
        .in('id', folderIdsToDelete);

      if (error) {
        const appError = handleApiError(error, {
          component: 'deleteFolder',
          action: 'delete_folder_cascade',
          resource: folderId,
        });
        return { success: false, error: appError.message };
      }
    } else {
      // BUG FIX #6 & #7: Combine queries to check if folder is empty
      const [{ count: subfolderCount }, { count: documentCount }, { count: softDeletedCount }] =
        await Promise.all([
          supabase
            .from('folders')
            .select('id', { count: 'exact' })
            .eq('parent_folder_id', folderId),
          supabase
            .from('documents')
            .select('id', { count: 'exact' })
            .eq('folder_id', folderId)
            .eq('is_deleted', false),
          supabase
            .from('documents')
            .select('id', { count: 'exact' })
            .eq('folder_id', folderId)
            .eq('is_deleted', true),
        ]);

      if ((subfolderCount ?? 0) > 0 || (documentCount ?? 0) > 0 || (softDeletedCount ?? 0) > 0) {
        return {
          success: false,
          error: 'Folder is not empty. Move or delete contents first.',
        };
      }

      const { error } = await supabase
        .from('folders')
        .delete()
        .eq('id', folderId);

      if (error) {
        const appError = handleApiError(error, {
          component: 'deleteFolder',
          action: 'delete_folder',
          resource: folderId,
        });
        return { success: false, error: appError.message };
      }
    }

    return { success: true };
  } catch (error) {
    const appError = handleApiError(error, {
      component: 'deleteFolder',
      action: 'delete_folder',
    });
    return { success: false, error: appError.message };
  }
};

/**
 * Get folder contents (files and subfolders)
 */
export const getFolderContents = async (
  userId: string,
  folderId: string | null
): Promise<{
  success: boolean;
  folders?: Folder[];
  documents?: any[];
  error?: string;
}> => {
  try {
    if (!userId) {
      return { success: false, error: 'User is required' };
    }

    // Get subfolders
    let folderQuery = supabase
      .from('folders')
      .select('*')
      .eq('user_id', userId);

    if (folderId === null) {
      folderQuery = folderQuery.is('parent_folder_id', null);
    } else {
      folderQuery = folderQuery.eq('parent_folder_id', folderId);
    }

    // CRITICAL FIX: Filter out soft-deleted folders
    folderQuery = folderQuery.eq('is_deleted', false);

    const { data: folders, error: folderError } = await folderQuery.order(
      'name',
      { ascending: true }
    );

    if (folderError) {
      const appError = handleApiError(folderError, {
        component: 'getFolderContents',
        action: 'fetch_subfolders',
      });
      return { success: false, error: appError.message };
    }

    // Get documents in this folder
    let docQuery = supabase
      .from('documents')
      .select('*')
      .eq('user_id', userId);

    if (folderId === null) {
      docQuery = docQuery.is('folder_id', null);
    } else {
      docQuery = docQuery.eq('folder_id', folderId);
    }

    // CRITICAL FIX: Filter out soft-deleted documents
    docQuery = docQuery.eq('is_deleted', false);

    const { data: documents, error: docError } = await docQuery.order(
      'created_at',
      { ascending: false }
    );

    if (docError) {
      const appError = handleApiError(docError, {
        component: 'getFolderContents',
        action: 'fetch_documents',
      });
      return { success: false, error: appError.message };
    }

    return { success: true, folders: folders || [], documents: documents || [] };
  } catch (error) {
    const appError = handleApiError(error, {
      component: 'getFolderContents',
      action: 'fetch_folder_contents',
    });
    return { success: false, error: appError.message };
  }
};

/**
 * Get per-folder direct child counts (subfolders + documents).
 * BUG FIX #4: Optimized to only fetch counts instead of all items
 */
export const getFolderItemCounts = async (
  userId: string
): Promise<{ success: boolean; counts?: FolderItemCounts; error?: string }> => {
  try {
    if (!userId) {
      return { success: false, error: 'User is required' };
    }

    // BUG FIX #4: Fetch only the folder IDs and their parent relationships
    // This is much faster than loading all documents
    const { data: allFolders, error: folderError } = await supabase
      .from('folders')
      .select('id,parent_folder_id')
      .eq('user_id', userId)
      .eq('is_deleted', false);

    if (folderError) {
      const appError = handleApiError(folderError, {
        component: 'getFolderItemCounts',
        action: 'fetch_folders_for_counts',
      });
      return { success: false, error: appError.message };
    }

    // Initialize counts for all folders
    const counts: FolderItemCounts = {};
    const folders = (allFolders || []) as Pick<Folder, 'id' | 'parent_folder_id'>[];

    for (const folder of folders) {
      counts[folder.id] = { subfolders: 0, documents: 0 };
    }

    // Count subfolders efficiently
    for (const folder of folders) {
      if (folder.parent_folder_id && counts[folder.parent_folder_id]) {
        counts[folder.parent_folder_id].subfolders += 1;
      }
    }

    // Get document counts per folder using aggregation
    // This fetches only the count data, not full document records
    const { data: docCounts, error: docError } = await supabase
      .from('documents')
      .select('folder_id', { count: 'exact' })
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .in('folder_id', Object.keys(counts));

    if (docError) {
      const appError = handleApiError(docError, {
        component: 'getFolderItemCounts',
        action: 'fetch_documents_for_counts',
      });
      return { success: false, error: appError.message };
    }

    // Build document count map
    const docCountMap: Record<string, number> = {};
    if (docCounts) {
      for (const doc of docCounts) {
        if (doc.folder_id) {
          docCountMap[doc.folder_id] = (docCountMap[doc.folder_id] || 0) + 1;
        }
      }
    }

    // Apply document counts
    for (const [folderId, count] of Object.entries(docCountMap)) {
      if (counts[folderId]) {
        counts[folderId].documents = count;
      }
    }

    return { success: true, counts };
  } catch (error) {
    const appError = handleApiError(error, {
      component: 'getFolderItemCounts',
      action: 'compute_counts_failed',
    });
    return { success: false, error: appError.message };
  }
};

/**
 * Batch move multiple documents to a folder
 */
export const batchMoveDocuments = async (
  documentIds: string[],
  targetFolderId: string | null,
  userId: string
): Promise<{ success: boolean; movedCount?: number; error?: string }> => {
  try {
    if (!documentIds || documentIds.length === 0) {
      return { success: false, error: 'No documents selected' };
    }

    if (!userId) {
      return { success: false, error: 'User is required' };
    }

    // BUG FIX #8: Verify ownership of all documents being moved
    const { data: docs, error: docsError } = await supabase
      .from('documents')
      .select('id, user_id')
      .in('id', documentIds);

    if (docsError) {
      const appError = handleApiError(docsError, {
        component: 'batchMoveDocuments',
        action: 'fetch_documents_for_verification',
      });
      return { success: false, error: appError.message };
    }

    if (!docs || docs.length === 0) {
      return { success: false, error: 'No documents found' };
    }

    // Verify all documents belong to the user
    if (docs.some((d: any) => d.user_id !== userId)) {
      return { success: false, error: 'You do not have permission to move these documents' };
    }

    // Verify target folder exists and belongs to user if specified
    if (targetFolderId) {
      const { data: targetExists, error: targetError } = await supabase
        .from('folders')
        .select('id, user_id')
        .eq('id', targetFolderId)
        .single();

      if (targetError || !targetExists) {
        return { success: false, error: 'Target folder not found' };
      }

      // BUG FIX #9: Verify target folder ownership
      if (targetExists.user_id !== userId) {
        return { success: false, error: 'You do not have permission to move items there' };
      }
    }

    // Update all documents at once
    const { data: updated, error } = await supabase
      .from('documents')
      .update({ folder_id: targetFolderId })
      .in('id', documentIds)
      .select('id');

    if (error) {
      const appError = handleApiError(error, {
        component: 'batchMoveDocuments',
        action: 'batch_move',
      });
      return { success: false, error: appError.message };
    }

    return { success: true, movedCount: updated?.length || 0 };
  } catch (error) {
    const appError = handleApiError(error, {
      component: 'batchMoveDocuments',
      action: 'batch_move',
    });
    return { success: false, error: appError.message };
  }
};

/**
 * Batch delete multiple documents (soft delete to trash)
 */
export const batchDeleteDocuments = async (
  documentIds: string[]
): Promise<{ success: boolean; trashedCount?: number; error?: string }> => {
  try {
    if (!documentIds || documentIds.length === 0) {
      return { success: false, error: 'No documents selected' };
    }

    // Get all documents to move to trash
    const { data: docs, error: fetchError } = await supabase
      .from('documents')
      .select('*')
      .in('id', documentIds);

    if (fetchError) {
      const appError = handleApiError(fetchError, {
        component: 'batchDeleteDocuments',
        action: 'fetch_documents',
      });
      return { success: false, error: appError.message };
    }

    if (!docs || docs.length === 0) {
      return { success: false, error: 'Documents not found' };
    }

    // Create trash entries for all
    const trashEntries = docs.map((doc: any) => ({
      user_id: doc.user_id,
      resource_type: 'document',
      resource_id: doc.id,
      resource_name: doc.original_filename || doc.filename,
      size_bytes: doc.file_size || 0,
      original_path_json: { storage_path: doc.storage_path },
    }));

    const { error: trashError } = await supabase
      .from('trash')
      .insert(trashEntries);

    if (trashError) {
      const appError = handleApiError(trashError, {
        component: 'batchDeleteDocuments',
        action: 'trash_insert',
      });
      return { success: false, error: appError.message };
    }

    // Soft delete all documents
    const { error: deleteError } = await supabase
      .from('documents')
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
      })
      .in('id', documentIds);

    if (deleteError) {
      const appError = handleApiError(deleteError, {
        component: 'batchDeleteDocuments',
        action: 'soft_delete',
      });
      return { success: false, error: appError.message };
    }

    return { success: true, trashedCount: docs.length };
  } catch (error) {
    const appError = handleApiError(error, {
      component: 'batchDeleteDocuments',
      action: 'batch_delete',
    });
    return { success: false, error: appError.message };
  }
};
