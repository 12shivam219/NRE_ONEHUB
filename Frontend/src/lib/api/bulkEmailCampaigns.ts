/**
 * Bulk Email Campaign API
 * Handles creating and managing bulk email campaigns with rotation
 * Features:
 * - Batch size: 5 items per batch to prevent server overload
 * - Automatic delay between batches (100ms) for rate limiting
 * - Uses GIN indexes on email columns for fast lookups
 * - Optimized pagination for large recipient lists
 */

import { supabase } from '../supabase';
import { logActivity } from './audit';
import { logger, handleApiError, retryAsync } from '../errorHandler';
import { EMAIL_SERVER_URL, getEmailServerAuthHeaders } from '../emailServer';

// Configuration constants for bulk operations
export const BULK_EMAIL_CONFIG = {
  BATCH_SIZE: 5,           // Max recipients per batch
  BATCH_DELAY_MS: 100,     // Delay between batches to prevent overload
  MAX_RECIPIENTS: 1000,    // Max recipients per campaign
  SMART_BATCHING: {
    INITIAL_RATE: 5,       // Start with 5 emails/sec
    MIN_RATE: 5,           // Minimum rate (fallback on error)
    MAX_RATE: 20,          // Maximum rate (20 emails/sec)
    RAMP_UP_THRESHOLD: 10, // Number of successful batches before ramping up
    SCALE_FACTOR: 1.5,     // Multiply rate by this factor on success
    BACKOFF_FACTOR: 0.5,   // Multiply rate by this on error
    SUCCESS_WINDOW: 5,     // Track last N batch results
  },
} as const;

interface BulkEmailCampaign {
  id: string;
  user_id: string;
  requirement_id: string | null;
  subject: string;
  body: string;
  total_recipients: number;
  rotation_enabled: boolean;
  emails_per_account: number;
  status: 'draft' | 'in_progress' | 'completed' | 'failed';
  created_at: string;
  updated_at: string;
  selected_account_ids?: string[] | null;
}

interface CampaignRecipient {
  id: string;
  campaign_id: string;
  recipient_email: string;
  recipient_name: string;
  account_id: string | null;
  status: 'pending' | 'sent' | 'failed';
  message_id: string | null;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
}

interface EmailRecipient {
  email: string;
  name?: string;
}

/**
 * Smart batching utility for dynamic rate adjustment
 * Starts at 5 emails/sec and ramps up to 20/sec based on success rate
 */
class SmartBatcher {
  private currentRate: number;
  private successWindow: boolean[] = [];
  private successCount: number = 0;

  constructor(initialRate: number = BULK_EMAIL_CONFIG.SMART_BATCHING.INITIAL_RATE) {
    this.currentRate = initialRate;
  }

  /**
   * Calculate delay (in ms) based on current rate
   * rate=5 means 5 emails/sec, so delay between emails is 200ms
   * rate=20 means 20 emails/sec, so delay is 50ms
   */
  getDelay(): number {
    return Math.max(50, 1000 / this.currentRate);
  }

  /**
   * Record a batch result and adjust rate if needed
   */
  recordBatchResult(success: boolean): void {
    this.successWindow.push(success);
    if (this.successWindow.length > BULK_EMAIL_CONFIG.SMART_BATCHING.SUCCESS_WINDOW) {
      this.successWindow.shift();
    }

    // Count successes in the window
    this.successCount = this.successWindow.filter(Boolean).length;

    // Ramp up if all recent batches succeeded
    if (
      this.successCount >= BULK_EMAIL_CONFIG.SMART_BATCHING.SUCCESS_WINDOW &&
      this.currentRate < BULK_EMAIL_CONFIG.SMART_BATCHING.MAX_RATE
    ) {
      const newRate = Math.min(
        BULK_EMAIL_CONFIG.SMART_BATCHING.MAX_RATE,
        Math.ceil(this.currentRate * BULK_EMAIL_CONFIG.SMART_BATCHING.SCALE_FACTOR)
      );
      if (newRate > this.currentRate) {
        console.log(`[SmartBatcher] Ramping up from ${this.currentRate} to ${newRate} emails/sec`);
        this.currentRate = newRate;
      }
    }

    // Back off if there were failures
    if (!success && this.currentRate > BULK_EMAIL_CONFIG.SMART_BATCHING.MIN_RATE) {
      const newRate = Math.max(
        BULK_EMAIL_CONFIG.SMART_BATCHING.MIN_RATE,
        Math.ceil(this.currentRate * BULK_EMAIL_CONFIG.SMART_BATCHING.BACKOFF_FACTOR)
      );
      if (newRate < this.currentRate) {
        console.log(`[SmartBatcher] Backing off from ${this.currentRate} to ${newRate} emails/sec`);
        this.currentRate = newRate;
      }
    }
  }

  getCurrentRate(): number {
    return this.currentRate;
  }
}

interface CreateCampaignPayload {
  userId: string;
  subject: string;
  body: string;
  recipients: EmailRecipient[];
  rotationEnabled: boolean;
  emailsPerAccount?: number;
  requirementId?: string;
  selectedAccountIds?: string[];
  recipientAccountMap?: Record<string, string>; // Maps recipient email -> account ID
}

/**
 * Create a new bulk email campaign
 */
export const createBulkEmailCampaign = async (
  payload: CreateCampaignPayload
): Promise<{ success: boolean; campaign?: BulkEmailCampaign; error?: string }> => {
  try {
    const {
      userId,
      subject,
      body,
      recipients,
      rotationEnabled,
      emailsPerAccount = 5,
      requirementId,
      selectedAccountIds = [],
      recipientAccountMap = {},
    } = payload;

    if (!subject || !body || recipients.length === 0) {
      return {
        success: false,
        error: 'Subject, body, and recipients are required',
      };
    }

    // Create campaign record
    const { data: campaign, error: campaignError } = await retryAsync(
      async () =>
        supabase
          .from('bulk_email_campaigns')
          .insert({
            user_id: userId,
            requirement_id: requirementId || null,
            subject,
            body,
            total_recipients: recipients.length,
            rotation_enabled: rotationEnabled,
            emails_per_account: emailsPerAccount,
            status: 'draft',
            selected_account_ids: selectedAccountIds.length > 0 ? selectedAccountIds : null,
          })
          .select()
          .single(),
      {
        maxAttempts: 2,
        initialDelayMs: 100,
      }
    );

    if (campaignError) {
      const appError = handleApiError(campaignError, {
        component: 'createBulkEmailCampaign',
        userId,
      });
      return { success: false, error: appError.message };
    }

    if (!campaign) {
      return { success: false, error: 'Failed to create campaign' };
    }

    await logActivity({
      action: 'bulk_email_campaign_created',
      actorId: userId,
      resourceType: 'bulk_email_campaign',
      resourceId: campaign.id,
      description: `Created bulk email campaign "${subject}" for ${recipients.length} recipient${recipients.length !== 1 ? 's' : ''}`,
    });

    // Insert recipient records
    const recipientRecords = recipients.map((recipient) => ({
      campaign_id: campaign.id,
      recipient_email: recipient.email,
      recipient_name: recipient.name || null,
      account_id: recipientAccountMap[recipient.email] || null, // Assign account if mapped
      status: 'pending',
    }));

    const { error: recipientError } = await retryAsync(
      async () =>
        supabase
          .from('campaign_recipients')
          .insert(recipientRecords),
      {
        maxAttempts: 2,
        initialDelayMs: 100,
      }
    );

    if (recipientError) {
      // Clean up campaign if recipient insert fails
      await supabase.from('bulk_email_campaigns').delete().eq('id', campaign.id);
      
      const appError = handleApiError(recipientError, {
        component: 'createBulkEmailCampaign',
        resource: 'recipients',
      });
      return { success: false, error: appError.message };
    }

    logger.info('Bulk email campaign created', {
      component: 'createBulkEmailCampaign',
      resource: campaign.id,
      recipientCount: recipients.length,
    });

    return { success: true, campaign };
  } catch (error) {
    const appError = handleApiError(error, {
      component: 'createBulkEmailCampaign',
    });
    return { success: false, error: appError.message };
  }
};

/**
 * Get campaign details with recipients
 */
export const getCampaignDetails = async (
  campaignId: string
): Promise<{
  success: boolean;
  campaign?: BulkEmailCampaign;
  recipients?: CampaignRecipient[];
  error?: string;
}> => {
  try {
    const { data: campaign, error: campaignError } = await supabase
      .from('bulk_email_campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();

    if (campaignError) {
      const appError = handleApiError(campaignError, {
        component: 'getCampaignDetails',
        resource: campaignId,
      });
      return { success: false, error: appError.message };
    }

    const { data: recipients, error: recipientError } = await supabase
      .from('campaign_recipients')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: true });

    if (recipientError) {
      const appError = handleApiError(recipientError, {
        component: 'getCampaignDetails',
        resource: campaignId,
      });
      return { success: false, error: appError.message };
    }

    return {
      success: true,
      campaign,
      recipients: recipients || [],
    };
  } catch (error) {
    const appError = handleApiError(error, {
      component: 'getCampaignDetails',
    });
    return { success: false, error: appError.message };
  }
};

/**
 * Poll campaign status until completion (for real-time progress)
 */
export const pollCampaignStatus = async (
  campaignId: string,
  onProgressUpdate?: (status: {
    total: number;
    sent: number;
    failed: number;
    processed: number;
    progress: number;
    status: string;
  }) => void
): Promise<{
  success: boolean;
  result?: {
    total: number;
    sent: number;
    failed: number;
    processed: number;
    progress: number;
    status: string;
  };
  error?: string;
}> => {
  try {
    let isComplete = false;
    let attempts = 0;
    const maxAttempts = 300; // 5 minutes max (300 * 1s)

    console.log(`[pollCampaignStatus] Starting poll for campaign ${campaignId}`);
    
    // Debug: Check all records in bulk_email_campaign_status on first attempt
    const { data: allRecords } = await supabase
      .from('bulk_email_campaign_status')
      .select('id')
      .limit(5);
    console.log(`[pollCampaignStatus] Available records in table:`, allRecords?.map((r: any) => r.id) || []);

    while (!isComplete && attempts < maxAttempts) {
      const { data, error } = await supabase
        .from('bulk_email_campaign_status')
        .select('id, status, total, sent, failed, processed, progress')
        .eq('id', campaignId);

      if (error) {
        logger.error('Error polling campaign status', {
          component: 'pollCampaignStatus',
          campaignId,
          error: error.message,
          errorCode: error.code,
        });
        console.error(`[pollCampaignStatus] Error on attempt ${attempts + 1}:`, error);
        // Continue polling instead of returning error
        await new Promise(resolve => setTimeout(resolve, 500));
        attempts++;
        continue;
      }

      if (data && Array.isArray(data) && data.length > 0) {
        const statusRecord = data[0];
        
        console.log(`[pollCampaignStatus] Attempt ${attempts + 1}: status=${statusRecord.status}, sent=${statusRecord.sent}, failed=${statusRecord.failed}, progress=${statusRecord.progress}%`);
        
        onProgressUpdate?.({
          total: statusRecord.total || 0,
          sent: statusRecord.sent || 0,
          failed: statusRecord.failed || 0,
          processed: statusRecord.processed || 0,
          progress: statusRecord.progress || 0,
          status: statusRecord.status || 'queued',
        });

        // Check if campaign is complete
        if (statusRecord.status === 'completed' || statusRecord.status === 'failed') {
          console.log(`[pollCampaignStatus] Campaign ${statusRecord.status} after ${attempts + 1} attempts`);
          isComplete = true;
          return {
            success: true,
            result: {
              total: statusRecord.total || 0,
              sent: statusRecord.sent || 0,
              failed: statusRecord.failed || 0,
              processed: statusRecord.processed || 0,
              progress: statusRecord.progress || 0,
              status: statusRecord.status || 'completed',
            },
          };
        }
      } else {
        console.log(`[pollCampaignStatus] Attempt ${attempts + 1}: No data returned (data=${data}, isArray=${Array.isArray(data)}, length=${data?.length})`);
      }

      // Wait before next poll (aggressive polling for immediate UI updates)
      // 100ms for first 30 attempts (3s fast window), then 300ms
      const delay = attempts < 30 ? 100 : 300;
      await new Promise(resolve => setTimeout(resolve, delay));
      attempts++;
    }

    if (attempts >= maxAttempts) {
      console.warn(`[pollCampaignStatus] Timeout: max attempts (${maxAttempts}) exceeded`);
      return {
        success: false,
        error: 'Campaign processing timeout (5 minutes exceeded)',
      };
    }

    console.warn(`[pollCampaignStatus] Incomplete: polling exited without completion`);
    return { success: false, error: 'Campaign polling incomplete' };
  } catch (error) {
    const appError = handleApiError(error, {
      component: 'pollCampaignStatus',
    });
    return { success: false, error: appError.message };
  }
};

/**
 * Send bulk email campaign
 */
export const sendBulkEmailCampaign = async (
  campaignId: string
): Promise<{
  success: boolean;
  result?: {
    total: number;
    sent: number;
    failed: number;
    details: Array<{
      email: string;
      status: string;
      fromAccount: string;
    }>;
  };
  emailServerCampaignId?: string;
  error?: string;
}> => {
  try {
    // Get campaign details
    const { campaign, recipients } = await getCampaignDetails(campaignId);

    if (!campaign || !recipients) {
      return { success: false, error: 'Campaign not found' };
    }

    if (recipients.length === 0) {
      return { success: false, error: 'No recipients in campaign' };
    }

    // Limit recipients to prevent overload
    if (recipients.length > BULK_EMAIL_CONFIG.MAX_RECIPIENTS) {
      return {
        success: false,
        error: `Campaign exceeds maximum recipients (${BULK_EMAIL_CONFIG.MAX_RECIPIENTS})`,
      };
    }

    // Prepare recipients list for server
    const recipientEmails = recipients.map((r) => ({
      email: r.recipient_email,
      name: r.recipient_name,
    }));

    // Get the email addresses for the selected accounts
    // We need to fetch the account details from Supabase to get email addresses
    let selectedAccountEmails: string[] = [];
    const accountIdToEmailMap: Record<string, string> = {};
    
    if (campaign.selected_account_ids && campaign.selected_account_ids.length > 0) {
      const { data: accountsData, error: accountsError } = await supabase
        .from('email_accounts')
        .select('id, email_address')
        .in('id', campaign.selected_account_ids);

      if (!accountsError && accountsData) {
        selectedAccountEmails = accountsData.map((acc: any) => acc.email_address);
        // Create a map of account ID -> email for recipient mapping
        accountsData.forEach((acc: any) => {
          accountIdToEmailMap[acc.id] = acc.email_address;
        });
      }
    }

    // Get recipient-account mappings from campaign_recipients
    const { data: recipientMappings } = await supabase
      .from('campaign_recipients')
      .select('recipient_email, account_id')
      .eq('campaign_id', campaignId);

    // Build recipient-email mapping for the server
    const recipientAccountEmailMap: Record<string, string> = {};
    if (recipientMappings) {
      recipientMappings.forEach((mapping: any) => {
        if (mapping.account_id && accountIdToEmailMap[mapping.account_id]) {
          recipientAccountEmailMap[mapping.recipient_email] = accountIdToEmailMap[mapping.account_id];
        }
      });
    }

    // Call bulk send endpoint
    const response = await fetch(`${EMAIL_SERVER_URL}/api/send-bulk-emails`, {
      method: 'POST',
      headers: await getEmailServerAuthHeaders({
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({
        emails: recipientEmails,
        subject: campaign.subject,
        body: campaign.body,
        rotationConfig: campaign.rotation_enabled
          ? { emailsPerAccount: campaign.emails_per_account }
          : null,
        selectedAccountEmails: selectedAccountEmails,
        recipientAccountMap: recipientAccountEmailMap, // Send recipient-account mappings
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: result.error || 'Failed to send bulk emails',
      };
    }

    // Email server returns 202 Accepted - campaign queued for background processing
    // We need to poll for the status instead of expecting immediate results
    if (response.status === 202 || !result.details) {
      // Get the campaignId from the email server response (different ID system)
      const emailServerCampaignId = result.campaignId;
      
      console.log(`[sendBulkEmailCampaign] Frontend campaignId: ${campaignId}`);
      console.log(`[sendBulkEmailCampaign] Email server campaignId: ${emailServerCampaignId}`);
      
      // Campaign is queued, update status to 'queued' instead of 'completed'
      await supabase
        .from('bulk_email_campaigns')
        .update({
          status: 'queued',
          started_at: new Date().toISOString(),
        })
        .eq('id', campaignId);

      logger.info('Bulk email campaign queued for processing', {
        component: 'sendBulkEmailCampaign',
        resource: campaignId,
        emailServerCampaignId,
        total: result.total,
      });

      // Return success with the EMAIL SERVER campaign ID for polling
      // This is critical - polling must use the email server's campaign ID, not the frontend's
      return {
        success: true,
        result: {
          total: result.total || recipientEmails.length,
          sent: 0,
          failed: 0,
          details: [],
        },
        // Add the email server campaign ID so polling uses the correct ID
        emailServerCampaignId,
      };
    }

    // If we do get details (synchronous processing), update campaign
    if (!result.details || !Array.isArray(result.details)) {
      return {
        success: false,
        error: 'Invalid response from email server: missing details',
      };
    }

    // Update campaign status with final results
    await supabase
      .from('bulk_email_campaigns')
      .update({
        status: result.failed === 0 ? 'completed' : 'failed',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      })
      .eq('id', campaignId);

    // Update recipient statuses in batches to prevent overload
    const detailBatches = [];
    for (let i = 0; i < result.details.length; i += BULK_EMAIL_CONFIG.BATCH_SIZE) {
      detailBatches.push(result.details.slice(i, i + BULK_EMAIL_CONFIG.BATCH_SIZE));
    }

    // Use smart batching for dynamic rate adjustment
    const batcher = new SmartBatcher();
    
    for (let batchIndex = 0; batchIndex < detailBatches.length; batchIndex++) {
      const batch = detailBatches[batchIndex];
      let batchSuccess = true;

      try {
        await Promise.all(
          batch.map((detail: { status: string; messageId?: string; error?: string; email?: string }) => {
            const status = detail.status === 'sent' ? 'sent' : 'failed';
            return supabase
              .from('campaign_recipients')
              .update({
                status,
                message_id: detail.messageId || null,
                error_message: detail.error || null,
                sent_at: status === 'sent' ? new Date().toISOString() : null,
              })
              .eq('campaign_id', campaignId)
              .eq('recipient_email', detail.email);
          })
        );
      } catch (error) {
        batchSuccess = false;
        console.error(`[sendBulkEmailCampaign] Batch ${batchIndex} failed:`, error);
      }

      // Record result and adjust rate
      batcher.recordBatchResult(batchSuccess);

      // Apply dynamic delay before next batch
      if (batchIndex < detailBatches.length - 1) {
        const delay = batcher.getDelay();
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    logger.info('Bulk email campaign sent', {
      component: 'sendBulkEmailCampaign',
      resource: campaignId,
      sent: result.sent,
      failed: result.failed,
      batches: detailBatches.length,
    });

    return {
      success: true,
      result,
    };
  } catch (error) {
    const appError = handleApiError(error, {
      component: 'sendBulkEmailCampaign',
    });
    return { success: false, error: appError.message };
  }
};

/**
 * Get user's campaigns
 */
export const getUserCampaigns = async (
  userId: string
): Promise<{ success: boolean; campaigns?: BulkEmailCampaign[]; error?: string }> => {
  try {
    const { data, error } = await supabase
      .from('bulk_email_campaigns')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      const appError = handleApiError(error, {
        component: 'getUserCampaigns',
        userId,
      });
      return { success: false, error: appError.message };
    }

    return { success: true, campaigns: data || [] };
  } catch (error) {
    const appError = handleApiError(error, {
      component: 'getUserCampaigns',
    });
    return { success: false, error: appError.message };
  }
};

/**
 * Delete a campaign
 */
export const deleteCampaign = async (campaignId: string): Promise<{ success: boolean; error?: string }> => {
  try {
    const { error } = await supabase
      .from('bulk_email_campaigns')
      .delete()
      .eq('id', campaignId);

    if (error) {
      const appError = handleApiError(error, {
        component: 'deleteCampaign',
        resource: campaignId,
      });
      return { success: false, error: appError.message };
    }

    logger.info('Campaign deleted', {
      component: 'deleteCampaign',
      resource: campaignId,
    });

    return { success: true };
  } catch (error) {
    const appError = handleApiError(error, {
      component: 'deleteCampaign',
    });
    return { success: false, error: appError.message };
  }
};
