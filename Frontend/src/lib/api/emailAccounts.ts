/**
 * Email Accounts Management API
 * Handles CRUD operations for user email accounts
 */

import { supabase } from '../supabase';
import { logger, handleApiError, retryAsync } from '../errorHandler';
import { encryptData } from '../encryption';
import { EMAIL_SERVER_URL, getEmailServerAuthHeaders } from '../emailServer';

interface EmailAccount {
  id: string;
  user_id: string;
  email_address: string;
  app_password_encrypted: string;
  email_limit_per_rotation: number;
  is_active: boolean;
  order_index: number;
  created_at: string;
  updated_at: string;
}

/**
 * Get all email accounts for a user
 */
export const getEmailAccounts = async (
  userId: string
): Promise<{ success: boolean; accounts?: EmailAccount[]; error?: string }> => {
  try {
    const { data, error } = await retryAsync(
      async () =>
        supabase
          .from('email_accounts')
          .select('*')
          .eq('user_id', userId)
          .eq('is_active', true)
          .order('order_index', { ascending: true }),
      {
        maxAttempts: 2,
        initialDelayMs: 100,
      }
    );

    if (error) {
      const appError = handleApiError(error, {
        component: 'getEmailAccounts',
        userId,
      });
      return { success: false, error: appError.message };
    }

    return { success: true, accounts: data || [] };
  } catch (error) {
    const appError = handleApiError(error, {
      component: 'getEmailAccounts',
    });
    return { success: false, error: appError.message };
  }
};

/**
 * Add a new email account
 */
export const addEmailAccount = async (
  userId: string,
  emailAddress: string,
  appPassword: string,
  emailLimitPerRotation?: number
): Promise<{ success: boolean; account?: EmailAccount; error?: string }> => {
  try {
    // Basic validation
    if (!emailAddress || !appPassword) {
      return {
        success: false,
        error: 'Email address and app password are required',
      };
    }

    // SECURITY: Encrypt the app password before storing in database
    let encryptedPassword: string;
    try {
      encryptedPassword = await encryptData(appPassword);
    } catch (encryptError) {
      const appError = handleApiError(encryptError, {
        component: 'addEmailAccount',
        resource: 'password encryption',
      });
      return { success: false, error: `Encryption failed: ${appError.message}` };
    }

    const { data, error } = await retryAsync(
      async () =>
        supabase
          .from('email_accounts')
          .insert({
            user_id: userId,
            email_address: emailAddress,
            app_password_encrypted: encryptedPassword,
            email_limit_per_rotation: emailLimitPerRotation || 5,
            is_active: true,
            order_index: 0,
          })
          .select()
          .single(),
      {
        maxAttempts: 2,
        initialDelayMs: 100,
      }
    );

    if (error) {
      const appError = handleApiError(error, {
        component: 'addEmailAccount',
        userId,
        resource: emailAddress,
      });
      return { success: false, error: appError.message };
    }

    logger.info('Email account added', {
      component: 'addEmailAccount',
      resource: emailAddress,
    });

    return { success: true, account: data };
  } catch (error) {
    const appError = handleApiError(error, {
      component: 'addEmailAccount',
    });
    return { success: false, error: appError.message };
  }
};

/**
 * Update an email account
 */
export const updateEmailAccount = async (
  accountId: string,
  updates: Partial<Pick<EmailAccount, 'email_limit_per_rotation' | 'is_active'>>
): Promise<{ success: boolean; account?: EmailAccount; error?: string }> => {
  try {
    const { data, error } = await retryAsync(
      async () =>
        supabase
          .from('email_accounts')
          .update(updates)
          .eq('id', accountId)
          .select()
          .single(),
      {
        maxAttempts: 2,
        initialDelayMs: 100,
      }
    );

    if (error) {
      const appError = handleApiError(error, {
        component: 'updateEmailAccount',
        resource: accountId,
      });
      return { success: false, error: appError.message };
    }

    logger.info('Email account updated', {
      component: 'updateEmailAccount',
      resource: accountId,
    });

    return { success: true, account: data };
  } catch (error) {
    const appError = handleApiError(error, {
      component: 'updateEmailAccount',
    });
    return { success: false, error: appError.message };
  }
};

/**
 * Delete an email account
 */
export const deleteEmailAccount = async (
  accountId: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const { error } = await retryAsync(
      async () =>
        supabase
          .from('email_accounts')
          .delete()
          .eq('id', accountId),
      {
        maxAttempts: 2,
        initialDelayMs: 100,
      }
    );

    if (error) {
      const appError = handleApiError(error, {
        component: 'deleteEmailAccount',
        resource: accountId,
      });
      return { success: false, error: appError.message };
    }

    logger.info('Email account deleted', {
      component: 'deleteEmailAccount',
      resource: accountId,
    });

    return { success: true };
  } catch (error) {
    const appError = handleApiError(error, {
      component: 'deleteEmailAccount',
    });
    return { success: false, error: appError.message };
  }
};

/**
 * Test email account by sending a test email
 */
export const testEmailAccount = async (
  emailAddress: string
): Promise<{ success: boolean; message?: string; error?: string }> => {
  try {
    const headers = await getEmailServerAuthHeaders({
      'Content-Type': 'application/json',
    });

    const response = await fetch(`${EMAIL_SERVER_URL}/api/send-email`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        to: emailAddress,
        subject: 'Test Email from Loster CRM',
        body: 'This is a test email to verify your email account is working correctly.',
        from: emailAddress,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: result.error || 'Failed to send test email',
      };
    }

    logger.info('Test email sent successfully', {
      component: 'testEmailAccount',
      resource: emailAddress,
    });

    return {
      success: true,
      message: `Test email sent successfully to ${emailAddress}`,
    };
  } catch (error) {
    const appError = handleApiError(error, {
      component: 'testEmailAccount',
    });
    return { success: false, error: appError.message };
  }
};
