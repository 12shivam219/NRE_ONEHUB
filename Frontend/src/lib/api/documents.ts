import { supabase } from '../supabase';
import type { Database } from '../database.types';
import { logger, handleApiError, retryAsync } from '../errorHandler';
import { sanitizePathComponent, isSafeStoragePath } from '../utils';
import { logActivity } from './audit';

type Document = Database['public']['Tables']['documents']['Row'];

type SaveDocumentCopyOptions = {
  blob?: Blob;
  folderId?: string | null;
};

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const DOC_MIME = 'application/msword';
const PDF_MIME = 'application/pdf';

const normalizeDocumentMimeType = (filename: string, fallbackMimeType?: string, blob?: Blob): string => {
  const lowerName = filename.toLowerCase();
  const blobType = blob?.type?.trim();

  if (lowerName.endsWith('.pdf')) {
    return PDF_MIME;
  }

  if (lowerName.endsWith('.doc')) {
    return DOC_MIME;
  }

  if (lowerName.endsWith('.docx')) {
    return DOCX_MIME;
  }

  return blobType || fallbackMimeType || DOCX_MIME;
};

const getSourceBlobForCopy = async (
  document: Document,
  options?: SaveDocumentCopyOptions
): Promise<{ success: boolean; blob?: Blob; error?: string }> => {
  let sourceBlob = options?.blob;

  if (!sourceBlob) {
    const { data: downloadData, error: downloadError } = await supabase.storage
      .from('documents')
      .download(document.storage_path);

    if (downloadError || !downloadData) {
      const appError = handleApiError(downloadError || new Error('Download failed'), {
        component: 'saveDocumentCopy',
        action: 'download_file',
        resource: document.id,
      });
      return { success: false, error: appError.message };
    }

    sourceBlob = downloadData;
  }

  return { success: true, blob: sourceBlob };
};

const createDocumentCopy = async (
  document: Document,
  userId: string,
  blob: Blob,
  folderId: string | null
): Promise<{ success: boolean; document?: Document; error?: string }> => {
  const sanitizedUserId = sanitizePathComponent(userId);
  const sanitizedFilename = sanitizePathComponent(document.original_filename || 'document.docx');
  const copyStoragePath = `${sanitizedUserId}/${Date.now()}_${sanitizedFilename}`;
  const nextMimeType = normalizeDocumentMimeType(
    document.original_filename || document.filename || 'document.docx',
    document.mime_type,
    blob
  );

  const { error: uploadError } = await retryAsync(
    async () => {
      if (!isSafeStoragePath(copyStoragePath)) {
        throw new Error('Invalid storage path');
      }
      return supabase.storage.from('documents').upload(copyStoragePath, blob, { upsert: false });
    },
    {
      maxAttempts: 3,
      initialDelayMs: 200,
    }
  );

  if (uploadError) {
    const appError = handleApiError(uploadError, {
      component: 'createDocumentCopy',
      action: 'storage_upload',
      resource: document.id,
    });
    return { success: false, error: appError.message };
  }

  const copyName = document.original_filename || document.filename || 'document.docx';
  const { data: copiedDocument, error: insertError } = await retryAsync(
    async () => {
      console.log('📝 [createDocumentCopy] Inserting document record:', { folderId, documentName: copyName, storagePath: copyStoragePath });
      return supabase
        .from('documents')
        .insert({
          user_id: userId,
          filename: sanitizePathComponent(copyName),
          original_filename: copyName,
          file_size: blob.size,
          mime_type: nextMimeType,
          storage_path: copyStoragePath,
          version: 1,
          parent_id: document.id,
          folder_id: folderId,
          source: document.source || 'local',
          google_drive_id: null,
        })
        .select()
        .single();
    },
    {
      maxAttempts: 2,
      initialDelayMs: 100,
    }
  );

  if (insertError) {
    const appError = handleApiError(insertError, {
      component: 'createDocumentCopy',
      action: 'db_insert',
      resource: document.id,
    });

    try {
      if (isSafeStoragePath(copyStoragePath)) {
        await supabase.storage.from('documents').remove([copyStoragePath]);
      }
    } catch (cleanupError) {
      logger.warn('Failed to clean up copied storage file after DB insert failure', {
        component: 'createDocumentCopy',
        resource: document.id,
        error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
      });
    }

    console.error('❌ [createDocumentCopy] Database insert failed:', { error: insertError.message, folderId });
    return { success: false, error: appError.message };
  }

  console.log('✅ [createDocumentCopy] Document successfully created:', { 
    documentId: copiedDocument?.id, 
    folderId: copiedDocument?.folder_id,
    fileName: copiedDocument?.original_filename 
  });

  return { success: true, document: copiedDocument };
};

/**
 * Upload a document with retry logic and comprehensive error handling
 */
export const uploadDocument = async (
  file: File,
  userId: string,
  source: 'local' | 'google_drive' = 'local',
  googleDriveId?: string,
  folderId?: string | null
): Promise<{ success: boolean; document?: Document; error?: string }> => {
  try {
    // Check storage quota before uploading
    const quotaCheckResponse = await fetch('/api/check-storage-quota', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ''}`,
      },
      body: JSON.stringify({ file_size_bytes: file.size }),
    });

    if (quotaCheckResponse.ok) {
      const quotaData = await quotaCheckResponse.json();
      if (!quotaData.allowed) {
        return {
          success: false,
          error: quotaData.error || 'Storage quota exceeded. Please upgrade your plan.',
        };
      }
    } else {
      logger.warn('Failed to check quota, proceeding with upload at risk', {
        component: 'uploadDocument',
        resource: file.name,
      });
    }

    const sanitizedFilename = sanitizePathComponent(file.name);
    const sanitizedUserId = sanitizePathComponent(userId);
    const storagePath = `${sanitizedUserId}/${Date.now()}_${sanitizedFilename}`;

    // Retry storage upload with exponential backoff
    const { error: uploadError } = await retryAsync(
      async () => {
        if (!isSafeStoragePath(storagePath)) {
          throw new Error('Invalid storage path');
        }
        return supabase.storage.from('documents').upload(storagePath, file);
      },
      {
        maxAttempts: 3,
        initialDelayMs: 200,
        onRetry: (attempt) =>
          logger.warn(`Upload retry attempt ${attempt}`, {
            component: 'uploadDocument',
            resource: file.name,
          }),
      }
    );

    if (uploadError) {
      const appError = handleApiError(uploadError, {
        component: 'uploadDocument',
        action: 'storage_upload',
        resource: file.name,
      });
      return { success: false, error: appError.message };
    }

    // Insert into database with retry
    const { data: document, error: dbError } = await retryAsync(
      async () =>
        supabase
          .from('documents')
          .insert({
            user_id: userId,
            filename: sanitizedFilename,
            original_filename: file.name,
            file_size: file.size,
            mime_type: file.type,
            storage_path: storagePath,
            source,
            google_drive_id: googleDriveId,
            folder_id: folderId,
          })
          .select()
          .single(),
      {
        maxAttempts: 2,
        initialDelayMs: 100,
      }
    );

    if (dbError) {
      const appError = handleApiError(dbError, {
        component: 'uploadDocument',
        action: 'db_insert',
        resource: file.name,
      });

      // Cleanup uploaded storage object when metadata insert fails to avoid orphaned files.
      try {
        if (isSafeStoragePath(storagePath)) {
          await supabase.storage.from('documents').remove([storagePath]);
        }
      } catch (cleanupError) {
        logger.warn('Failed to clean up uploaded file after DB insert failure', {
          component: 'uploadDocument',
          resource: file.name,
          error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        });
      }

      return { success: false, error: appError.message };
    }

    // Audit log document upload
    await logActivity({
      action: 'document_uploaded',
      actorId: userId,
      resourceType: 'document',
      resourceId: document.id,
      description: `Uploaded document "${file.name}" (${(file.size / 1024 / 1024).toFixed(2)}MB)`,
      details: {
        filename: file.name,
        fileSize: file.size,
        mimeType: file.type,
        source,
      },
    }).catch(() => {
      // Log failure silently - don't block operation
    });

    logger.info('Document uploaded successfully', {
      component: 'uploadDocument',
      resource: file.name,
    });
    return { success: true, document };
  } catch (error) {
    const appError = handleApiError(error, {
      component: 'uploadDocument',
      action: 'upload_failed',
    });
    return { success: false, error: appError.message };
  }
};

/**
 * Fetch all documents for a user with retry logic
 */
export const getDocumentsCount = async (
  _userId: string
): Promise<{ success: boolean; count: number; error?: string }> => {
  try {
    const { count, error } = await retryAsync(
      async () =>
        supabase
          .from('documents')
          .select('*', { count: 'exact', head: true }),
      {
        maxAttempts: 2,
        initialDelayMs: 100,
      }
    );

    if (error) {
      const appError = handleApiError(error, {
        component: 'getDocumentsCount',
        action: 'fetch_count',
        userId: _userId,
      });
      return { success: false, count: 0, error: appError.message };
    }

    return { success: true, count: count || 0 };
  } catch (error) {
    const appError = handleApiError(error, {
      component: 'getDocumentsCount',
    });
    return { success: false, count: 0, error: appError.message };
  }
};

export const getDocuments = async (
  _userId: string
): Promise<{ success: boolean; documents?: Document[]; error?: string }> => {
  try {
    const { data, error } = await retryAsync(
      async () =>
        supabase
          .from('documents')
          .select('*')
          .order('created_at', { ascending: false }),
      {
        maxAttempts: 2,
        initialDelayMs: 100,
      }
    );

    if (error) {
      const appError = handleApiError(error, {
        component: 'getDocuments',
        action: 'fetch_all',
        userId: _userId,
      });
      return { success: false, error: appError.message };
    }

    return { success: true, documents: data || [] };
  } catch (error) {
    const appError = handleApiError(error, {
      component: 'getDocuments',
    });
    return { success: false, error: appError.message };
  }
};

export const getDocumentsPage = async (options: {
  userId?: string;
  limit?: number;
  offset?: number;
  cursor?: { created_at: string; direction?: 'after' | 'before' };
  includeCount?: boolean;
  search?: string;
  folderId?: string | null;
  orderBy?: 'created_at' | 'updated_at';
  orderDir?: 'asc' | 'desc';
}): Promise<{ success: boolean; documents?: Document[]; total?: number; error?: string }> => {
  const {
    limit = 50,
    offset = 0,
    cursor,
    includeCount = false,
    search,
    folderId,
    orderBy = 'created_at',
    orderDir = 'desc',
  } = options;

  try {
    const countMode = includeCount ? 'exact' : undefined;

    const { data, count, error } = await retryAsync(
      async () => {
        let query = supabase
          .from('documents')
          .select('*', { count: countMode as 'exact' | undefined });

        // Filter by folder (Bug #14: clarify the confusing logic)
        // folderId === undefined: not passed, so filter to root (folder_id = null)
        // folderId === null (explicitly): show ALL documents across all folders
        // folderId === (string): show documents in that specific folder
        if (folderId === undefined) {
          // Will be treated as null (root)
          query = query.is('folder_id', null);
        } else if (folderId !== null) {
          query = query.eq('folder_id', folderId);
        }
        // If folderId is null and not undefined, show all documents (no folder filter)

        // CRITICAL FIX: Filter out soft-deleted documents
        query = query.eq('is_deleted', false);

        query = query.order(orderBy, { ascending: orderDir === 'asc' });

        if (typeof search === 'string' && search.trim()) {
          const term = `%${search.trim()}%`;
          query = query.or(`original_filename.ilike.${term},filename.ilike.${term}`);
        }

        if (cursor?.created_at) {
          if (orderDir === 'desc') {
            if (cursor.direction === 'before') {
              query = query.gt(orderBy, cursor.created_at);
            } else {
              query = query.lt(orderBy, cursor.created_at);
            }
          } else {
            if (cursor.direction === 'before') {
              query = query.lt(orderBy, cursor.created_at);
            } else {
              query = query.gt(orderBy, cursor.created_at);
            }
          }
          query = query.limit(limit);
        } else {
          const start = offset;
          const end = offset + limit - 1;
          query = query.range(start, end);
        }

        return query;
      },
      {
        maxAttempts: 2,
        initialDelayMs: 100,
      }
    );

    if (error) {
        const appError = handleApiError(error, {
        component: 'getDocumentsPage',
        action: 'fetch_page',
          userId: options.userId,
      });
      return { success: false, error: appError.message };
    }

    return { success: true, documents: data || [], total: count ?? 0 };
  } catch (err) {
    const appError = handleApiError(err, {
      component: 'getDocumentsPage',
      action: 'exception',
      userId: options.userId,
    });
    return { success: false, error: appError.message };
  }
};

/**
 * Fetch a single document by ID
 */
export const getDocument = async (
  documentId: string
): Promise<{ success: boolean; document?: Document; error?: string }> => {
  try {
    const { data, error } = await retryAsync(
      async () =>
        supabase
          .from('documents')
          .select('*')
          .eq('id', documentId)
          .single(),
      {
        maxAttempts: 2,
        initialDelayMs: 100,
      }
    );

    if (error) {
      const appError = handleApiError(error, {
        component: 'getDocument',
        resource: documentId,
      });
      return { success: false, error: appError.message };
    }

    return { success: true, document: data };
  } catch (error) {
    const appError = handleApiError(error, {
      component: 'getDocument',
      resource: documentId,
    });
    return { success: false, error: appError.message };
  }
};

/**
 * Soft delete a document - move to trash (with 30-day recovery window)
 */
export const deleteDocument = async (
  documentId: string,
  userId?: string
): Promise<{ success: boolean; trashId?: string; error?: string }> => {
  try {
    const { data: document } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (!document) {
      return { success: false, error: 'Document not found' };
    }

    // Move to trash table
    const trashEntry = {
      user_id: document.user_id,
      resource_type: 'document',
      resource_id: documentId,
      resource_name: document.original_filename || document.filename,
      size_bytes: document.file_size || 0,
      original_path_json: { storage_path: document.storage_path },
    };

    const { data: trashData, error: trashError } = await supabase
      .from('trash')
      .insert([trashEntry])
      .select()
      .single();

    if (trashError) {
      const appError = handleApiError(trashError, {
        component: 'deleteDocument',
        action: 'trash_insert',
        resource: documentId,
      });
      return { success: false, error: appError.message };
    }

    // Mark document as deleted (soft delete)
    const { error: updateError } = await supabase
      .from('documents')
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
      })
      .eq('id', documentId);

    if (updateError) {
      const appError = handleApiError(updateError, {
        component: 'deleteDocument',
        action: 'soft_delete',
        resource: documentId,
      });
      return { success: false, error: appError.message };
    }

    // Audit log
    await logActivity({
      action: 'document_deleted',
      actorId: userId,
      resourceType: 'document',
      resourceId: documentId,
      description: `Moved "${document.filename || 'document'}" to trash`,
      details: {
        filename: document.filename,
        fileSize: document.file_size,
        trashId: trashData?.id,
      },
    }).catch(() => {
      // Log failure silently
    });

    logger.info('Document moved to trash', {
      component: 'deleteDocument',
      resource: documentId,
      trashId: trashData?.id,
    });

    return { success: true, trashId: trashData?.id };
  } catch (error) {
    const appError = handleApiError(error, {
      component: 'deleteDocument',
      resource: documentId,
    });
    return { success: false, error: appError.message };
  }
};

/**
 * Permanently delete a document from trash
 */
export const permanentlyDeleteDocument = async (
  documentId: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const { data: document } = await supabase
      .from('documents')
      .select('storage_path')
      .eq('id', documentId)
      .single();

    if (document && isSafeStoragePath(document.storage_path)) {
      try {
        await supabase.storage
          .from('documents')
          .remove([document.storage_path]);
      } catch {
        logger.warn('Failed to delete storage file during permanent delete', {
          component: 'permanentlyDeleteDocument',
          resource: documentId,
        });
        // Continue with database deletion
      }
    }

    // Hard delete from database
    await supabase.from('documents').delete().eq('id', documentId);

    // Remove from trash
    await supabase.from('trash').delete().eq('resource_id', documentId);

    return { success: true };
  } catch (error) {
    const appError = handleApiError(error, {
      component: 'permanentlyDeleteDocument',
      resource: documentId,
    });
    return { success: false, error: appError.message };
  }
};

/**
 * Restore document from trash
 */
export const restoreFromTrash = async (
  trashId: string
): Promise<{ success: boolean; documentId?: string; error?: string }> => {
  try {
    const { data: trashItem } = await supabase
      .from('trash')
      .select('*')
      .eq('id', trashId)
      .single();

    if (!trashItem) {
      return { success: false, error: 'Trash item not found' };
    }

    // Restore document
    const { error: restoreError } = await supabase
      .from('documents')
      .update({
        is_deleted: false,
        deleted_at: null,
      })
      .eq('id', trashItem.resource_id);

    if (restoreError) {
      const appError = handleApiError(restoreError, {
        component: 'restoreFromTrash',
        resource: trashId,
      });
      return { success: false, error: appError.message };
    }

    // Remove from trash
    await supabase.from('trash').delete().eq('id', trashId);

    return { success: true, documentId: trashItem.resource_id };
  } catch (error) {
    const appError = handleApiError(error, {
      component: 'restoreFromTrash',
      resource: trashId,
    });
    return { success: false, error: appError.message };
  }
};

/**
 * Get user's trash
 */
export const getUserTrash = async (): Promise<{ success: boolean; trash?: any[]; error?: string }> => {
  try {
    const { data, error } = await supabase
      .from('trash')
      .select('*')
      .gte('expires_at', new Date().toISOString())
      .order('deleted_at', { ascending: false });

    if (error) {
      const appError = handleApiError(error, {
        component: 'getUserTrash',
      });
      return { success: false, error: appError.message };
    }

    return { success: true, trash: data || [] };
  } catch (error) {
    const appError = handleApiError(error, {
      component: 'getUserTrash',
    });
    return { success: false, error: appError.message };
  }
};

/**
 * Get storage usage for current user
 */
export const getStorageUsage = async (): Promise<{
  success: boolean;
  usage?: {
    used_gb: number;
    quota_gb: number;
    usage_percent: number;
    document_count: number;
    remaining_gb: number;
  };
  error?: string;
}> => {
  try {
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'User not authenticated' };
    }

    // Get from user_storage_usage table (filtered by current user)
    // Use maybeSingle() to handle case where user has no storage usage yet
    const { data: usage, error: usageError } = await supabase
      .from('user_storage_usage')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    // Get quota from profiles
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('storage_quota_bytes')
      .eq('id', user.id)
      .maybeSingle();

    if (usageError || profileError) {
      return { success: false, error: 'Failed to load storage usage' };
    }

    const quota = profile?.storage_quota_bytes || 5 * 1024 * 1024 * 1024;
    const used = usage?.total_bytes || 0;

    return {
      success: true,
      usage: {
        used_gb: Math.round((used / (1024 ** 3)) * 100) / 100,
        quota_gb: Math.round((quota / (1024 ** 3)) * 100) / 100,
        usage_percent: Math.round((used / quota) * 1000) / 10,
        document_count: usage?.document_count || 0,
        remaining_gb: Math.round(((quota - used) / (1024 ** 3)) * 100) / 100,
      },
    };
  } catch (error) {
    const appError = handleApiError(error, {
      component: 'getStorageUsage',
    });
    return { success: false, error: appError.message };
  }
};

/**
 * Update/save an edited document back to Supabase storage
 */
export const updateDocument = async (
  documentId: string,
  blob: Blob,
  userId: string
): Promise<{ success: boolean; document?: Document; error?: string }> => {
  try {
    const { data: document, error: fetchError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (fetchError || !document) {
      const appError = handleApiError(fetchError || new Error('Document not found'), {
        component: 'updateDocument',
        action: 'fetch_document',
        resource: documentId,
      });
      return { success: false, error: appError.message };
    }

    const sanitizedUserId = sanitizePathComponent(userId);
    const sanitizedFilename = sanitizePathComponent(document.original_filename || 'document.docx');
    const newStoragePath = `${sanitizedUserId}/${Date.now()}_${sanitizedFilename}`;
    const nextMimeType = normalizeDocumentMimeType(
      document.original_filename || document.filename || 'document.docx',
      document.mime_type,
      blob
    );

    const { error: uploadError } = await retryAsync(
      async () => {
        if (!isSafeStoragePath(newStoragePath)) {
          throw new Error('Invalid storage path');
        }
        return supabase.storage.from('documents').upload(newStoragePath, blob);
      },
      {
        maxAttempts: 3,
        initialDelayMs: 200,
      }
    );

    if (uploadError) {
      const appError = handleApiError(uploadError, {
        component: 'updateDocument',
        action: 'storage_upload',
        resource: documentId,
      });
      return { success: false, error: appError.message };
    }

    const { data: updatedDoc, error: updateError } = await retryAsync(
      async () =>
        supabase
          .from('documents')
          .update({
            storage_path: newStoragePath,
            file_size: blob.size,
            mime_type: nextMimeType,
            version: document.version + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', documentId)
          .select()
          .single(),
      {
        maxAttempts: 2,
        initialDelayMs: 100,
      }
    );

    if (updateError) {
      const appError = handleApiError(updateError, {
        component: 'updateDocument',
        action: 'db_update',
        resource: documentId,
      });

      try {
        if (isSafeStoragePath(newStoragePath)) {
          await supabase.storage.from('documents').remove([newStoragePath]);
        }
      } catch (cleanupError) {
        logger.warn('Failed to clean up newly uploaded storage file after DB update failure', {
          component: 'updateDocument',
          resource: documentId,
          error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        });
      }

      return { success: false, error: appError.message };
    }

    try {
      if (isSafeStoragePath(document.storage_path)) {
        const { error: deleteError } = await supabase.storage
          .from('documents')
          .remove([document.storage_path]);

        if (deleteError) {
          logger.warn('Failed to delete old storage file after successful update', {
            component: 'updateDocument',
            resource: documentId,
            error: deleteError.message,
          });
        }
      }
    } catch (error) {
      logger.warn('Failed to delete old storage file after successful update', {
        component: 'updateDocument',
        resource: documentId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    logger.info('Document updated successfully', {
      component: 'updateDocument',
      resource: documentId,
    });

    // Audit log document update
    await logActivity({
      action: 'document_updated',
      actorId: userId,
      resourceType: 'document',
      resourceId: documentId,
      description: `Updated document "${document.filename}" to version ${updatedDoc.version}`,
      details: {
        filename: document.filename,
        oldFileSize: document.file_size,
        newFileSize: blob.size,
        oldVersion: document.version,
        newVersion: updatedDoc.version,
      },
    }).catch(() => {
      // Log failure silently - don't block operation
    });

    return { success: true, document: updatedDoc };
  } catch (error) {
    const appError = handleApiError(error, {
      component: 'updateDocument',
      action: 'update_failed',
    });
    return { success: false, error: appError.message };
  }
};

/**
 * Download a document with a signed URL and retry logic
 */
export const downloadDocument = async (
  storagePath: string
): Promise<{ success: boolean; url?: string; error?: string }> => {
  try {
    if (!isSafeStoragePath(storagePath)) {
      return { success: false, error: 'Invalid storage path' };
    }
    const { data, error } = await retryAsync(
      async () =>
        supabase.storage
          .from('documents')
          .createSignedUrl(storagePath, 60 * 60), // 1 hour expiry
      {
        maxAttempts: 2,
        initialDelayMs: 100,
      }
    );

    if (error) {
      const appError = handleApiError(error, {
        component: 'downloadDocument',
        action: 'create_signed_url',
        resource: storagePath,
      });
      return { success: false, error: appError.message };
    }

    logger.debug('Download URL created', {
      component: 'downloadDocument',
      resource: storagePath,
    });
    return { success: true, url: data.signedUrl };
  } catch (error) {
    const appError = handleApiError(error, {
      component: 'downloadDocument',
      resource: storagePath,
    });
    return { success: false, error: appError.message };
  }
};

/**
 * Save a document snapshot to app storage (creates a copy for offline access/versioning)
 */
export const saveDocumentToApp = async (
  documentId: string,
  userId: string,
  options?: SaveDocumentCopyOptions
): Promise<{ success: boolean; snapshotId?: string; document?: Document; error?: string }> => {
  try {
    // Get the current document
    const { data: document, error: fetchError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (fetchError || !document) {
      const appError = handleApiError(fetchError || new Error('Document not found'), {
        component: 'saveDocumentToApp',
        action: 'fetch_document',
        resource: documentId,
      });
      return { success: false, error: appError.message };
    }

    const snapshotId = `snapshot_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const sourceResult = await getSourceBlobForCopy(document, options);
    if (!sourceResult.success || !sourceResult.blob) {
      return { success: false, error: sourceResult.error || 'Failed to prepare document copy' };
    }

    const copyResult = await createDocumentCopy(document, userId, sourceResult.blob, options?.folderId ?? null);
    if (!copyResult.success || !copyResult.document) {
      return { success: false, error: copyResult.error || 'Failed to save document to app' };
    }

    logger.info('Document saved to app storage', {
      component: 'saveDocumentToApp',
      resource: documentId,
      snapshotId,
    });

    return { success: true, snapshotId, document: copyResult.document };
  } catch (error) {
    const appError = handleApiError(error, {
      component: 'saveDocumentToApp',
      action: 'save_failed',
    });
    return { success: false, error: appError.message };
  }
};

/**
 * Save a document to application folder with metadata for organization
 */
export const saveDocumentToAppFolder = async (
  documentId: string,
  userId: string,
  folderId: string | null = null,
  options?: SaveDocumentCopyOptions
): Promise<{ success: boolean; fileId?: string; document?: Document; error?: string }> => {
  try {
    if (!userId) {
      return { success: false, error: 'User is required' };
    }

    const targetFolderId = options?.folderId ?? folderId ?? null;
    console.log('📁 [saveDocumentToAppFolder] Starting save:', { documentId, userId, targetFolderId, providedFolderId: folderId, optionsFolderId: options?.folderId });

    // Validate folder ownership if folderId is provided
    if (targetFolderId) {
      const { data: folder, error: folderError } = await supabase
        .from('folders')
        .select('id, user_id, name')
        .eq('id', targetFolderId)
        .single();

      if (folderError || !folder) {
        console.error('❌ [saveDocumentToAppFolder] Folder not found:', targetFolderId);
        return { success: false, error: 'Target folder not found' };
      }

      if (folder.user_id !== userId) {
        console.error('❌ [saveDocumentToAppFolder] Unauthorized folder access:', { targetFolderId, folderOwner: folder.user_id, requestedBy: userId });
        return { success: false, error: 'You do not have permission to save to this folder' };
      }
      
      console.log('✅ [saveDocumentToAppFolder] Folder verified:', { folderId: folder.id, folderName: folder.name, userId });
    }

    // Get the current document
    const { data: document, error: fetchError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (fetchError || !document) {
      const appError = handleApiError(fetchError || new Error('Document not found'), {
        component: 'saveDocumentToAppFolder',
        action: 'fetch_document',
        resource: documentId,
      });
      return { success: false, error: appError.message };
    }

    // Shared workspace: do not require folder ownership checks.

    const fileId = `file_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const sourceResult = await getSourceBlobForCopy(document, options);
    if (!sourceResult.success || !sourceResult.blob) {
      return { success: false, error: sourceResult.error || 'Failed to prepare document copy' };
    }

    const copyResult = await createDocumentCopy(
      document,
      userId,
      sourceResult.blob,
      options?.folderId ?? folderId ?? null
    );
    if (!copyResult.success || !copyResult.document) {
      return { success: false, error: copyResult.error || 'Failed to save document to folder' };
    }

    logger.info('Document saved to app folder', {
      component: 'saveDocumentToAppFolder',
      resource: documentId,
      fileId,
      folderId: options?.folderId ?? folderId ?? null,
    });

    return { success: true, fileId, document: copyResult.document };
  } catch (error) {
    const appError = handleApiError(error, {
      component: 'saveDocumentToAppFolder',
      action: 'save_failed',
    });
    return { success: false, error: appError.message };
  }
};

export const duplicateDocumentToFolder = async (
  documentId: string,
  userId: string,
  targetFolderId: string | null = null
): Promise<{ success: boolean; document?: Document; error?: string }> => {
  try {
    const { data: document, error: fetchError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (fetchError || !document) {
      const appError = handleApiError(fetchError || new Error('Document not found'), {
        component: 'duplicateDocumentToFolder',
        action: 'fetch_document',
        resource: documentId,
      });
      return { success: false, error: appError.message };
    }

    // Shared workspace: do not require folder ownership checks.

    const sourceResult = await getSourceBlobForCopy(document);
    if (!sourceResult.success || !sourceResult.blob) {
      return { success: false, error: sourceResult.error || 'Failed to prepare document copy' };
    }

    const copyResult = await createDocumentCopy(document, userId, sourceResult.blob, targetFolderId);
    if (!copyResult.success || !copyResult.document) {
      return { success: false, error: copyResult.error || 'Failed to duplicate document' };
    }

    logger.info('Document duplicated to folder', {
      component: 'duplicateDocumentToFolder',
      resource: documentId,
      targetFolderId,
      duplicatedDocumentId: copyResult.document.id,
    });

    return { success: true, document: copyResult.document };
  } catch (error) {
    const appError = handleApiError(error, {
      component: 'duplicateDocumentToFolder',
      action: 'duplicate_failed',
    });
    return { success: false, error: appError.message };
  }
};
