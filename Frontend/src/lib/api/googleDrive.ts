/**
 * Google Drive Integration Module
 * Handles OAuth authentication, file selection, and document import
 */

import { supabase } from '../supabase';
import { logger, handleApiError, retryAsync } from '../errorHandler';
import type { Database } from '../database.types';

type Document = Database['public']['Tables']['documents']['Row'];

// Google Drive OAuth Configuration
// Note: VITE_GOOGLE_CLIENT_ID should be set in .env.local
export const GOOGLE_DRIVE_CONFIG = {
  clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
  scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
};

const GOOGLE_REDIRECT_URI = import.meta.env.VITE_GOOGLE_REDIRECT_URI || `${window.location.origin}/oauth/callback`;

/**
 * Check if Google OAuth is properly configured
 */
export function isGoogleDriveConfigured(): boolean {
  return !!GOOGLE_DRIVE_CONFIG.clientId;
}

export function getGoogleDriveAuthUrl(state: string = 'google-drive-connection'): string {
  const params = new URLSearchParams({
    client_id: GOOGLE_DRIVE_CONFIG.clientId,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: GOOGLE_DRIVE_CONFIG.scopes.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Store Google Drive OAuth token in database
 */
export const saveGoogleDriveToken = async (
  userId: string,
  accessToken: string,
  refreshToken?: string,
  expiresAt?: number
): Promise<{ success: boolean; error?: string }> => {
  try {
    const { error } = await supabase.from('google_drive_tokens').upsert(
      {
        user_id: userId,
        access_token: accessToken,
        refresh_token: refreshToken || null,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

    if (error) {
      const appError = handleApiError(error, {
        component: 'saveGoogleDriveToken',
        userId,
      });
      return { success: false, error: appError.message };
    }

    logger.info('Google Drive token saved', {
      component: 'saveGoogleDriveToken',
      userId,
    });
    return { success: true };
  } catch (error) {
    const appError = handleApiError(error, {
      component: 'saveGoogleDriveToken',
    });
    return { success: false, error: appError.message };
  }
};

/**
 * Retrieve Google Drive OAuth token from database
 */
export const getGoogleDriveToken = async (
  userId: string
): Promise<{ success: boolean; token?: string; refreshToken?: string; error?: string }> => {
  try {
    const { data, error } = await supabase
      .from('google_drive_tokens')
      .select('access_token, refresh_token, expires_at')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No token found (not necessarily an error)
        logger.debug('No Google Drive token found', { userId });
        return { success: true };
      }
      const appError = handleApiError(error, {
        component: 'getGoogleDriveToken',
        userId,
      });
      return { success: false, error: appError.message };
    }

    // Check if token is expired
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      logger.warn('Google Drive token expired', { userId });
      return { success: true }; // Token exists but is expired
    }

    return {
      success: true,
      token: data.access_token,
      refreshToken: data.refresh_token || undefined,
    };
  } catch (error) {
    const appError = handleApiError(error, {
      component: 'getGoogleDriveToken',
    });
    return { success: false, error: appError.message };
  }
};

/**
 * List files from Google Drive with pagination
 */
export const listGoogleDriveFiles = async (
  accessToken: string,
  pageSize: number = 10,
  pageToken?: string
): Promise<{
  success: boolean;
  files?: Array<{ id: string; name: string; mimeType: string; size: number }>;
  nextPageToken?: string;
  error?: string;
}> => {
  try {
    const query = new URLSearchParams({
      q: "mimeType='application/vnd.openxmlformats-officedocument.wordprocessingml.document' or mimeType='application/msword' or mimeType='application/pdf'",
      spaces: 'drive',
      pageSize: String(pageSize),
      fields:
        'files(id,name,mimeType,size,webViewLink,owners(displayName,emailAddress)),nextPageToken',
    });

    if (pageToken) {
      query.append('pageToken', pageToken);
    }

    const response = await retryAsync(
      async () =>
        fetch(`https://www.googleapis.com/drive/v3/files?${query}`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }),
      {
        maxAttempts: 3,
        initialDelayMs: 200,
      }
    );

    if (!response.ok) {
      if (response.status === 401) {
        return {
          success: false,
          error: 'Google Drive token expired. Please reconnect.',
        };
      }
      throw new Error(`Google Drive API error: ${response.status}`);
    }

    const data = await response.json() as {
      files: Array<{ id: string; name: string; mimeType: string; size: number }>;
      nextPageToken?: string;
    };

    return {
      success: true,
      files: data.files,
      nextPageToken: data.nextPageToken,
    };
  } catch (error) {
    const appError = handleApiError(error, {
      component: 'listGoogleDriveFiles',
      action: 'list_files',
    });
    return { success: false, error: appError.message };
  }
};

/**
 * Download file from Google Drive and save to Supabase
 */
export const downloadGoogleDriveFile = async (
  fileId: string,
  fileName: string,
  accessToken: string,
  userId: string
): Promise<{ success: boolean; document?: Document; error?: string }> => {
  try {
    // Download file from Google Drive
    const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

    const fileResponse = await retryAsync(
      async () =>
        fetch(downloadUrl, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }),
      {
        maxAttempts: 2,
        initialDelayMs: 200,
        onRetry: (attempt) =>
          logger.warn(`Google Drive download retry ${attempt}`, {
            fileId,
            fileName,
          }),
      }
    );

    if (!fileResponse.ok) {
      if (fileResponse.status === 401) {
        return {
          success: false,
          error: 'Google Drive access token expired',
        };
      }
      throw new Error(`Failed to download file: ${fileResponse.status}`);
    }

    const blob = await fileResponse.blob();

    // Create File object
    const file = new File([blob], fileName, {
      type: blob.type,
    });

    // Upload to Supabase (use existing uploadDocument logic)
    const { uploadDocument } = await import('./documents');
    const uploadResult = await uploadDocument(file, userId, 'google_drive', fileId);

    if (!uploadResult.success) {
      return {
        success: false,
        error: uploadResult.error || 'Failed to save document',
      };
    }

    logger.info('Google Drive file imported successfully', {
      component: 'downloadGoogleDriveFile',
      fileId,
      fileName,
    });

    return {
      success: true,
      document: uploadResult.document,
    };
  } catch (error) {
    const appError = handleApiError(error, {
      component: 'downloadGoogleDriveFile',
      action: 'download_file',
      resource: fileId,
    });
    return { success: false, error: appError.message };
  }
};

/**
 * Verify Google Drive token validity
 */
export const verifyGoogleDriveToken = async (
  accessToken: string
): Promise<{ success: boolean; valid: boolean; error?: string }> => {
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v1/tokeninfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (response.ok) {
      return { success: true, valid: true };
    }

    if (response.status === 401) {
      return { success: true, valid: false }; // Token is invalid/expired
    }

    throw new Error(`Token verification failed: ${response.status}`);
  } catch (error) {
    const appError = handleApiError(error, {
      component: 'verifyGoogleDriveToken',
    });
    return { success: false, valid: false, error: appError.message };
  }
};

/**
 * Revoke Google Drive access
 */
export const revokeGoogleDriveAccess = async (
  userId: string,
  accessToken?: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    // Revoke token on Google side if we have the access token
    if (accessToken) {
      try {
        await fetch('https://oauth2.googleapis.com/revoke', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: `token=${accessToken}`,
        });
      } catch {
        logger.warn('Failed to revoke token on Google side', {
          userId,
        });
        // Continue with database deletion
      }
    }

    // Delete token from database
    const { error } = await supabase
      .from('google_drive_tokens')
      .delete()
      .eq('user_id', userId);

    if (error) {
      const appError = handleApiError(error, {
        component: 'revokeGoogleDriveAccess',
        userId,
      });
      return { success: false, error: appError.message };
    }

    logger.info('Google Drive access revoked', {
      component: 'revokeGoogleDriveAccess',
      userId,
    });
    return { success: true };
  } catch (error) {
    const appError = handleApiError(error, {
      component: 'revokeGoogleDriveAccess',
    });
    return { success: false, error: appError.message };
  }
};
