import { supabase } from '../supabase';
import type { Database } from '../database.types';
import { logger, handleApiError } from '../errorHandler';

type Folder = Database['public']['Tables']['folders']['Row'];

/**
 * Get all folders for a user, optionally filtered by parent folder
 */
export const getFolders = async (
  userId: string,
  parentFolderId: string | null = null
): Promise<{ success: boolean; folders?: Folder[]; error?: string }> => {
  try {
    let query = supabase
      .from('folders')
      .select('*')
      .eq('user_id', userId);

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
    const { data, error } = await supabase
      .from('folders')
      .select('*')
      .eq('user_id', userId)
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
 */
export const getFolderPath = async (
  folderId: string,
  userId: string
): Promise<{ success: boolean; path?: Folder[]; error?: string }> => {
  try {
    const path: Folder[] = [];
    let currentId: string | null = folderId;

    while (currentId) {
      const { data, error }: { data: Folder | null; error: any } = await supabase
        .from('folders')
        .select('*')
        .eq('id', currentId)
        .eq('user_id', userId)
        .single();

      if (error || !data) {
        return { success: false, error: 'Folder not found' };
      }

      path.unshift(data);
      currentId = data.parent_folder_id;
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
 */
export const createFolder = async (
  userId: string,
  name: string,
  parentFolderId: string | null = null,
  description?: string
): Promise<{ success: boolean; folder?: Folder; error?: string }> => {
  try {
    // Validate folder name
    if (!name || name.trim().length === 0) {
      return { success: false, error: 'Folder name cannot be empty' };
    }

    if (name.length > 255) {
      return {
        success: false,
        error: 'Folder name cannot exceed 255 characters',
      };
    }

    // Check for invalid characters
    if (/[<>:"|?*]/.test(name)) {
      return {
        success: false,
        error: 'Folder name contains invalid characters',
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
 */
export const renameFolder = async (
  userId: string,
  folderId: string,
  newName: string
): Promise<{ success: boolean; folder?: Folder; error?: string }> => {
  try {
    if (!newName || newName.trim().length === 0) {
      return { success: false, error: 'Folder name cannot be empty' };
    }

    if (newName.length > 255) {
      return {
        success: false,
        error: 'Folder name cannot exceed 255 characters',
      };
    }

    // Verify ownership
    const { data: folder, error: fetchError } = await supabase
      .from('folders')
      .select('user_id, parent_folder_id')
      .eq('id', folderId)
      .single();

    if (fetchError || !folder) {
      return { success: false, error: 'Folder not found' };
    }

    if (folder.user_id !== userId) {
      return { success: false, error: 'Access denied' };
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
 */
export const moveToFolder = async (
  userId: string,
  itemId: string,
  itemType: 'folder' | 'document',
  targetFolderId: string | null
): Promise<{ success: boolean; error?: string }> => {
  try {
    // Prevent circular references (folder cannot be moved to its own subfolder)
    if (itemType === 'folder' && targetFolderId) {
      // Check if targetFolder is a subfolder of itemId
      const { data: targetFolder } = await supabase
        .from('folders')
        .select('parent_folder_id')
        .eq('id', targetFolderId)
        .eq('user_id', userId)
        .single();

      if (!targetFolder) {
        return { success: false, error: 'Target folder not found' };
      }

      // Walk up the tree to check for circular reference
      let current = targetFolder.parent_folder_id;
      while (current) {
        if (current === itemId) {
          return {
            success: false,
            error: 'Cannot move folder to its own subfolder',
          };
        }
        const { data: parent } = await supabase
          .from('folders')
          .select('parent_folder_id')
          .eq('id', current)
          .eq('user_id', userId)
          .single();
        current = parent?.parent_folder_id || null;
      }
    }

    if (itemType === 'folder') {
      const { error } = await supabase
        .from('folders')
        .update({ parent_folder_id: targetFolderId })
        .eq('id', itemId)
        .eq('user_id', userId);

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
        .eq('id', itemId)
        .eq('user_id', userId);

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
    // Verify ownership
    const { data: folder, error: fetchError } = await supabase
      .from('folders')
      .select('id')
      .eq('id', folderId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !folder) {
      return { success: false, error: 'Folder not found' };
    }

    if (deleteContents) {
      // Delete all files in this folder and subfolders recursively
      // For simplicity, we'll move them to parent folder first if desired
      // Or we can use a cascade delete via the migration

      const { error } = await supabase
        .from('folders')
        .delete()
        .eq('id', folderId)
        .eq('user_id', userId);

      if (error) {
        const appError = handleApiError(error, {
          component: 'deleteFolder',
          action: 'delete_folder_cascade',
          resource: folderId,
        });
        return { success: false, error: appError.message };
      }
    } else {
      // Check if folder is empty
      const { data: subfolders } = await supabase
        .from('folders')
        .select('id', { count: 'exact' })
        .eq('parent_folder_id', folderId);

      const { data: documents } = await supabase
        .from('documents')
        .select('id', { count: 'exact' })
        .eq('folder_id', folderId);

      if ((subfolders?.length ?? 0) > 0 || (documents?.length ?? 0) > 0) {
        return {
          success: false,
          error: 'Folder is not empty. Move or delete contents first.',
        };
      }

      const { error } = await supabase
        .from('folders')
        .delete()
        .eq('id', folderId)
        .eq('user_id', userId);

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
