/**
 * API functions for requirement email tracking
 * Handles email history, sync operations, and matching
 */

import { supabase } from '../supabase';
import { logActivity } from './audit';

interface RequirementEmail {
  id: string;
  requirement_id: string;
  recipient_email: string;
  recipient_name?: string;
  sent_via: 'loster_app' | 'gmail_synced';
  subject: string;
  sent_date: string;
  status: 'sent' | 'failed' | 'pending' | 'bounced';
  match_confidence?: number;
  needs_user_confirmation?: boolean;
}

/**
 * Get all emails for a requirement
 */
export async function getRequirementEmails(requirementId: string): Promise<RequirementEmail[]> {
  const { data, error } = await supabase
    .from('requirement_emails')
    .select('*')
    .eq('requirement_id', requirementId)
    .order('sent_date', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Get paginated emails for a requirement (OPTIMIZED FOR 5K+ EMAILS)
 * Only selects necessary columns and loads in pages
 * 
 * @param requirementId - The requirement ID
 * @param page - Page number (0-indexed)
 * @param pageSize - Number of emails per page (default: 50)
 */
export async function getRequirementEmailsPaginated(
  requirementId: string,
  page: number = 0,
  pageSize: number = 50
): Promise<{
  emails: RequirementEmail[];
  total: number;
  hasMore: boolean;
  page: number;
  pageSize: number;
}> {
  // Get total count
  const { count, error: countError } = await supabase
    .from('requirement_emails')
    .select('id', { count: 'exact', head: true })
    .eq('requirement_id', requirementId);

  if (countError) throw countError;

  const total = count || 0;
  const offset = page * pageSize;

  // Select only necessary columns for display (not body_preview, notes, error_message, etc.)
  const { data, error } = await supabase
    .from('requirement_emails')
    .select('id, requirement_id, recipient_email, recipient_name, sent_via, subject, sent_date, status')
    .eq('requirement_id', requirementId)
    .order('sent_date', { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (error) throw error;

  return {
    emails: data || [],
    total,
    hasMore: offset + pageSize < total,
    page,
    pageSize,
  };
}

/**
 * Get full email details (with all columns) for a single email
 * Call this only when user clicks to expand email
 */
export async function getRequirementEmailDetails(emailId: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from('requirement_emails')
    .select('*')
    .eq('id', emailId)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get emails sent for multiple requirements (for dashboard/analytics)
 */
export async function getEmailsByRequirements(
  requirementIds: string[]
): Promise<RequirementEmail[]> {
  const { data, error } = await supabase
    .from('requirement_emails')
    .select('*')
    .in('requirement_id', requirementIds)
    .order('sent_date', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Create a new email record (when sending from Loster app)
 */
export async function createEmailRecord(
  requirementId: string,
  recipientEmail: string,
  recipientName: string,
  subject: string,
  userId: string,
  bodyPreview?: string
): Promise<RequirementEmail> {
  const { data, error } = await supabase
    .from('requirement_emails')
    .insert({
      requirement_id: requirementId,
      recipient_email: recipientEmail,
      recipient_name: recipientName,
      sent_via: 'loster_app',
      subject,
      body_preview: bodyPreview,
      sent_date: new Date().toISOString(),
      status: 'sent',
      match_confidence: 100,
      created_by: userId,
    })
    .select()
    .single();

  if (error) throw error;

  await logActivity({
    action: 'requirement_email_sent',
    actorId: userId,
    resourceType: 'requirement_email',
    resourceId: data.id,
    description: `Sent email "${subject}" to ${recipientEmail}`,
  });

  return data;
}

/**
 * Get Gmail sync status for current user
 */
export async function getGmailSyncStatus(userId: string): Promise<{
  isConnected: boolean;
  lastSync?: string;
  syncFrequency?: number;
  confidenceLevel?: string;
}> {
  const { data, error } = await supabase
    .from('gmail_sync_tokens')
    .select('last_sync_at, sync_frequency_minutes, auto_link_confidence_level, is_active')
    .eq('user_id', userId)
    .eq('is_active', true)
    .single();

  if (error || !data) {
    return { isConnected: false };
  }

  return {
    isConnected: true,
    lastSync: data.last_sync_at,
    syncFrequency: data.sync_frequency_minutes,
    confidenceLevel: data.auto_link_confidence_level,
  };
}

/**
 * Trigger manual email sync for user
 */
export async function triggerManualSync(userId: string): Promise<{ success: boolean }> {
  // This would call a backend endpoint that triggers the sync service
  // For now, return a placeholder
  try {
    const response = await fetch('/api/emails/sync-now', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId }),
    });

    if (!response.ok) throw new Error(`Sync failed with status ${response.status}`);

    return { success: true };
  } catch (error) {
    console.error('Manual sync error:', error);
    throw error;
  }
}

/**
 * Get email sync logs for user
 */
export async function getEmailSyncLogs(
  userId: string,
  limit: number = 10
): Promise<
  Array<{
    id: string;
    sync_started_at: string;
    sync_completed_at?: string;
    emails_fetched: number;
    emails_matched: number;
    status: string;
  }>
> {
  const { data, error } = await supabase
    .from('email_sync_logs')
    .select('*')
    .eq('user_id', userId)
    .order('sync_started_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

/**
 * Get unconfirmed email matches that need user review
 */
export async function getUnconfirmedEmailMatches(userId: string): Promise<RequirementEmail[]> {
  // Get user's requirements first
  const { data: requirements, error: reqError } = await supabase
    .from('requirements')
    .select('id')
    .eq('user_id', userId);

  if (reqError || !requirements) return [];

  const requirementIds = requirements.map((r: any) => r.id);

  // Get emails that need confirmation
  const { data, error } = await supabase
    .from('requirement_emails')
    .select('*')
    .in('requirement_id', requirementIds)
    .eq('needs_user_confirmation', true)
    .order('sent_date', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Confirm email match (update match confidence and clear needs_confirmation flag)
 */
export async function confirmEmailMatch(
  emailId: string,
  confidence: number
): Promise<RequirementEmail> {
  const { data, error } = await supabase
    .from('requirement_emails')
    .update({
      match_confidence: confidence,
      needs_user_confirmation: false,
    })
    .eq('id', emailId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update email status
 */
export async function updateEmailStatus(
  emailId: string,
  status: 'sent' | 'failed' | 'bounced' | 'pending',
  errorMessage?: string
): Promise<RequirementEmail> {
  const { data, error } = await supabase
    .from('requirement_emails')
    .update({
      status,
      error_message: errorMessage,
    })
    .eq('id', emailId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get email statistics for a requirement
 */
export async function getRequirementEmailStats(requirementId: string): Promise<{
  total: number;
  sent: number;
  failed: number;
  bounced: number;
  lastSent?: string;
  uniqueRecipients: number;
}> {
  const emails = await getRequirementEmails(requirementId);

  const stats = {
    total: emails.length,
    sent: emails.filter((e) => e.status === 'sent').length,
    failed: emails.filter((e) => e.status === 'failed').length,
    bounced: emails.filter((e) => e.status === 'bounced').length,
    lastSent: emails[0]?.sent_date,
    uniqueRecipients: new Set(emails.map((e) => e.recipient_email)).size,
  };

  return stats;
}

/**
 * Delete email record
 */
export async function deleteEmailRecord(emailId: string): Promise<void> {
  const { error } = await supabase.from('requirement_emails').delete().eq('id', emailId);

  if (error) throw error;
}

/**
 * Sync campaign recipients to requirement_emails table
 * Called after a bulk email campaign completes to populate email history
 * Transforms campaign_recipients data into requirement_emails records
 * Uses actual send status from bulk_email_campaign_status.details
 * 
 * @param campaignId - The frontend bulk_email_campaigns ID (UUID)
 * @param userId - The user ID who initiated the campaign
 * @param emailServerCampaignId - Optional: The email server's campaign ID (use this to fetch real send status)
 */
export async function syncCampaignToRequirementEmails(
  campaignId: string,
  userId: string,
  emailServerCampaignId?: string
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    // Get campaign details
    const { data: campaign, error: campaignError } = await supabase
      .from('bulk_email_campaigns')
      .select('id, requirement_id, subject, body')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      return {
        success: false,
        count: 0,
        error: 'Campaign not found',
      };
    }

    // Check if requirement_id exists (campaign may be global, not requirement-specific)
    if (!campaign.requirement_id) {
      console.warn('[syncCampaignToRequirementEmails] Campaign has no requirement_id - skipping sync');
      return {
        success: true,
        count: 0,
      };
    }

    // Get all recipients for this campaign
    const { data: recipients, error: recipientError } = await supabase
      .from('campaign_recipients')
      .select('id, recipient_email, recipient_name')
      .eq('campaign_id', campaignId);

    if (recipientError || !recipients) {
      return {
        success: false,
        count: 0,
        error: 'Failed to fetch campaign recipients',
      };
    }

    if (recipients.length === 0) {
      return {
        success: true,
        count: 0,
      };
    }

    // Get the actual send status from bulk_email_campaign_status.details
    // Use email server campaign ID if provided, otherwise try the frontend campaign ID
    const statusLookupId = emailServerCampaignId || campaignId;
    
    const { data: campaignStatus, error: statusError } = await supabase
      .from('bulk_email_campaign_status')
      .select('details')
      .eq('id', statusLookupId)
      .single();

    if (statusError) {
      console.warn(`[syncCampaignToRequirementEmails] Could not fetch campaign status details for ID ${statusLookupId}:`, statusError.message);
      // Fallback: treat all as sent if we can't get status
    }

    // Build a map of email -> status from campaign status details
    const emailStatusMap: Record<string, string> = {};
    if (campaignStatus?.details && Array.isArray(campaignStatus.details)) {
      campaignStatus.details.forEach((detail: Record<string, unknown>) => {
        if (detail.email) {
          // Map from 'sent'/'failed' in details to requirement_emails statuses
          emailStatusMap[(detail.email as string).toLowerCase()] = detail.status === 'sent' ? 'sent' : 'failed';
        }
      });
    }

    // Transform campaign_recipients to requirement_emails
    const emailRecords = recipients.map((recipient: any) => {
      const recipientEmailLower = recipient.recipient_email.toLowerCase();
      // Get the actual status from emailStatusMap, default to 'sent' if not found
      const actualStatus = emailStatusMap[recipientEmailLower] || 'sent';

      return {
        requirement_id: campaign.requirement_id,
        recipient_email: recipient.recipient_email,
        recipient_name: recipient.recipient_name || null,
        sent_via: 'bulk_email' as const,
        subject: campaign.subject,
        body_preview: campaign.body ? campaign.body.substring(0, 500) : null,
        sent_date: new Date().toISOString(),
        status: actualStatus,
        match_confidence: 100,
        needs_user_confirmation: false,
        created_by: userId,
      };
    });

    // Insert email records in batches to avoid timeout
    const batchSize = 50;
    let totalInserted = 0;

    for (let i = 0; i < emailRecords.length; i += batchSize) {
      const batch = emailRecords.slice(i, i + batchSize);
      const { error: insertError, data: insertedData } = await supabase
        .from('requirement_emails')
        .insert(batch)
        .select('id');

      if (insertError) {
        console.error('[syncCampaignToRequirementEmails] Insert error:', insertError);
        return {
          success: false,
          count: totalInserted,
          error: `Batch insert failed at index ${i}: ${insertError.message}`,
        };
      }

      totalInserted += insertedData?.length || 0;
    }

    // Log the sync activity
    await logActivity({
      action: 'campaign_synced_to_requirement_emails',
      actorId: userId,
      resourceType: 'bulk_email_campaign',
      resourceId: campaignId,
      description: `Synced ${totalInserted} email${totalInserted !== 1 ? 's' : ''} from campaign to requirement`,
    });

    console.log(
      `[syncCampaignToRequirementEmails] Successfully synced ${totalInserted} emails from campaign ${campaignId} to requirement ${campaign.requirement_id}`
    );

    return {
      success: true,
      count: totalInserted,
    };
  } catch (error) {
    console.error('[syncCampaignToRequirementEmails] Error:', error);
    return {
      success: false,
      count: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
