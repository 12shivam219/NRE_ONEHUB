import { useState, useEffect, useRef, useCallback } from 'react';
import { Mail, Send, Plus } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../contexts/ToastContext';
import { supabase } from '../../lib/supabase';
import { getEmailAccounts } from '../../lib/api/emailAccounts';
import { createBulkEmailCampaign, sendBulkEmailCampaign, pollCampaignStatus } from '../../lib/api/bulkEmailCampaigns';
import { parseEmailList, deduplicateEmails } from '../../lib/emailParser';
import { syncCampaignToRequirementEmails, getRequirementEmailsPaginated } from '../../lib/api/requirementEmails';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  RichTextEditor,
  TemplateManager,
  SignatureManager,
  DraftManager,
  ScheduleSend,
  AdvancedOptions,
  AttachmentManager,
  type EmailTemplate,
  type EmailSignature,
  type EmailDraft,
  type Attachment,
  type AdvancedEmailOptions,
  type ScheduleOptions,
} from '../email';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import LinearProgress from '@mui/material/LinearProgress';
import CircularProgress from '@mui/material/CircularProgress';
import { LogoLoader } from '../common/LogoLoader';

interface RequirementEmailManagerProps {
  requirementId: string;
  requirementTitle?: string;
  vendorEmail?: string | null;
}

interface RequirementEmail {
  id: string;
  recipient_email: string;
  recipient_name?: string;
  sent_via: 'loster_app' | 'gmail_synced' | 'bulk_email';
  subject: string;
  body_preview?: string;
  sent_date: string;
  status: 'sent' | 'failed' | 'bounced' | 'pending';
}

interface EmailAccountRow {
  id: string;
  user_id: string;
  email_address: string;
  email_limit_per_rotation: number;
  is_active: boolean;
}

export const RequirementEmailManager = ({
  requirementId,
  requirementTitle,
  vendorEmail,
}: RequirementEmailManagerProps) => {
  const { user } = useAuth();
  const { showToast } = useToast();

  // States
  const [emails, setEmails] = useState<RequirementEmail[]>([]);
  const [emailsLoading, setEmailsLoading] = useState(true);
  const [expandedEmailId, setExpandedEmailId] = useState<string | null>(null);
  const [showMultipleEmailsHint, setShowMultipleEmailsHint] = useState(false);

  // Bulk email states
  const [showBulkEmailModal, setShowBulkEmailModal] = useState(false);
  const [bulkEmailStep, setBulkEmailStep] = useState<'recipients' | 'accounts' | 'assignment' | 'compose' | 'review' | 'sending'>('recipients');
  const [accounts, setAccounts] = useState<EmailAccountRow[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [recipientAccountMap, setRecipientAccountMap] = useState<Record<string, string>>({}); // Maps recipient email -> account ID
  const [recipientsText, setRecipientsText] = useState('');
  const [recipients, setRecipients] = useState<Array<{ email: string; name?: string }>>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);

  // New email features
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [signatures, setSignatures] = useState<EmailSignature[]>([]);
  const [drafts, setDrafts] = useState<EmailDraft[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [scheduleOptions, setScheduleOptions] = useState<ScheduleOptions>({ enabled: false });
  const [advancedOptions, setAdvancedOptions] = useState<AdvancedEmailOptions>({
    priority: 'normal',
    retryFailed: true,
    maxRetries: 3,
  });

  const [sendingProgress, setSendingProgress] = useState<{
    total: number;
    sent: number;
    failed: number;
    processed: number;
    progress: number;
    status: string;
  } | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalEmails, setTotalEmails] = useState(0);
  const [hasMoreEmails, setHasMoreEmails] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [currentCampaignId, setCurrentCampaignId] = useState<string | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout>();
  const parentRef = useRef<HTMLDivElement>(null);

  const EMAIL_PAGE_SIZE = 50;

  // Load emails for this requirement (with pagination)
  useEffect(() => {
    const loadEmails = async () => {
      try {
        setEmailsLoading(true);
        const result = await getRequirementEmailsPaginated(requirementId, currentPage, EMAIL_PAGE_SIZE);
        
        if (currentPage === 0) {
          setEmails(result.emails);
        } else {
          // Append to existing emails for infinite scroll
          setEmails(prev => [...prev, ...result.emails]);
        }
        
        setTotalEmails(result.total);
        setHasMoreEmails(result.hasMore);
      } catch (err) {
        console.error('Error loading emails:', err);
        if (currentPage === 0) {
          showToast({
            type: 'error',
            message: 'Failed to load emails',
          });
        }
      } finally {
        setEmailsLoading(false);
        setIsLoadingMore(false);
      }
    };

    loadEmails();

    // Subscribe to real-time updates with debouncing
    // Only reload when subscription message arrives, debounced by 500ms
    const subscription = supabase
      .channel(`requirement_emails_${requirementId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'requirement_emails',
          filter: `requirement_id=eq.${requirementId}`,
        },
        () => {
          // Debounce real-time updates - batch multiple updates within 500ms
          if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
          }
          
          debounceTimerRef.current = setTimeout(() => {
            // Only refresh current page, not entire list
            setCurrentPage(0); // Reset to first page on new emails
          }, 500);
        }
      )
      .subscribe();

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      subscription.unsubscribe();
    };
  }, [requirementId, currentPage, showToast]);

  // Load email accounts
  useEffect(() => {
    const loadAccounts = async () => {
      if (!user) return;
      const result = await getEmailAccounts(user.id);
      if (result.success && result.accounts) {
        setAccounts(result.accounts);
      }
    };

    if (showBulkEmailModal) {
      loadAccounts();
    }
  }, [showBulkEmailModal, user]);

  // Auto-populate vendor email when modal opens
  useEffect(() => {
    if (showBulkEmailModal && vendorEmail) {
      // Parse vendor email - could be space-separated, comma-separated, or semicolon-separated
      const emailArray = vendorEmail
        .split(/[,;\s]+/)
        .map(e => e.trim())
        .filter(e => e.length > 0 && e.includes('@'));

      if (emailArray.length > 0) {
        // Format as semicolon-separated for display
        const formattedEmails = emailArray.join(';\n');
        setRecipientsText(formattedEmails);
        
        // Show hint if multiple emails
        if (emailArray.length > 1) {
          setShowMultipleEmailsHint(true);
        }
      }
    }
  }, [showBulkEmailModal, vendorEmail]);

  // Parse recipients
  const parseRecipients = (text: string) => {
    // Use robust email parser that handles various formats
    const parsedEmails = parseEmailList(text);
    // Deduplicate by email address (case-insensitive)
    return deduplicateEmails(parsedEmails);
  };

  // Load more emails for infinite scroll
  const handleLoadMoreEmails = useCallback(() => {
    if (hasMoreEmails && !isLoadingMore && !emailsLoading) {
      setIsLoadingMore(true);
      setCurrentPage(prev => prev + 1);
    }
  }, [hasMoreEmails, isLoadingMore, emailsLoading]);

  const handleParseRecipients = () => {
    const parsed = parseRecipients(recipientsText);
    if (parsed.length === 0) {
      showToast({
        type: 'error',
        message: 'No valid email addresses found',
      });
      return;
    }
    setRecipients(parsed);
    setBulkEmailStep('accounts');
  };

  const handleSelectAccount = (accountId: string) => {
    setSelectedAccountIds(prev => 
      prev.includes(accountId) 
        ? prev.filter(id => id !== accountId)
        : [...prev, accountId]
    );
  };

  const handleAssignRecipientToAccount = (recipientEmail: string, accountId: string) => {
    setRecipientAccountMap(prev => ({
      ...prev,
      [recipientEmail]: accountId,
    }));
  };

  const handleRemoveRecipientAssignment = (recipientEmail: string) => {
    setRecipientAccountMap(prev => {
      const newMap = { ...prev };
      delete newMap[recipientEmail];
      return newMap;
    });
  };

  const handleAutoAssignRecipients = () => {
    // Auto-assign recipients to accounts in round-robin fashion
    if (selectedAccountIds.length === 0) {
      showToast({
        type: 'warning',
        message: 'Please select at least one email account first',
      });
      return;
    }

    const newMap: Record<string, string> = {};
    recipients.forEach((recipient, index) => {
      const accountId = selectedAccountIds[index % selectedAccountIds.length];
      newMap[recipient.email] = accountId;
    });
    setRecipientAccountMap(newMap);
    showToast({
      type: 'success',
      message: `Auto-assigned ${recipients.length} recipients to ${selectedAccountIds.length} account(s)`,
    });
  };

  const handleProceedToCompose = () => {
    if (selectedAccountIds.length === 0) {
      showToast({
        type: 'warning',
        message: 'Please select at least one email account',
      });
      return;
    }
    // Move to assignment step instead of compose
    setBulkEmailStep('assignment');
  };

  const handleCreateCampaign = async () => {
    if (!user) return;
    if (!subject || !body) {
      showToast({
        type: 'warning',
        message: 'Please fill in subject and body',
      });
      return;
    }

    setBulkLoading(true);
    const result = await createBulkEmailCampaign({
      userId: user.id,
      subject,
      body,
      recipients,
      rotationEnabled: false,
      emailsPerAccount: 1,
      requirementId,
      selectedAccountIds,
      recipientAccountMap, // Pass the recipient-account mappings
    });

    if (result.success && result.campaign) {
      setCurrentCampaignId(result.campaign.id);
      setBulkEmailStep('review');
      showToast({
        type: 'success',
        message: 'Campaign created successfully',
      });
    } else {
      showToast({
        type: 'error',
        message: result.error || 'Failed to create campaign',
      });
    }
    setBulkLoading(false);
  };

  const handleSendCampaign = async () => {
    if (!user || !currentCampaignId) return;

    if (accounts.length === 0) {
      showToast({
        type: 'error',
        message: 'No email accounts configured. Please add accounts in settings first.',
      });
      return;
    }

    setBulkEmailStep('sending');
    setSendingProgress({ total: recipients.length, sent: 0, failed: 0, processed: 0, progress: 0, status: 'queued' });

    try {
      const result = await sendBulkEmailCampaign(currentCampaignId);

      if (result?.success) {
        // Use the email server's campaign ID for polling (not the frontend campaign ID)
        const emailServerCampaignId = (result as any).emailServerCampaignId || currentCampaignId;  
        
        console.log(`[handleSendCampaign] Using campaign ID for polling: ${emailServerCampaignId}`);
        
        // Start polling for real-time progress
        const pollResult = await pollCampaignStatus(emailServerCampaignId, (status) => {
          // Update UI with each status update
          setSendingProgress({
            total: status.total,
            sent: status.sent,
            failed: status.failed,
            processed: status.processed,
            progress: status.progress,
            status: status.status,
          });
        });

        // Polling completed, show final result
        if (pollResult.success && pollResult.result) {
          const finalStatus = pollResult.result;
          showToast({
            type: finalStatus.failed === 0 ? 'success' : 'warning',
            message: `Campaign complete: ${finalStatus.sent} sent, ${finalStatus.failed} failed`,
          });

          // Sync campaign recipients to requirement_emails table for email history
          console.log(`[handleSendCampaign] Syncing campaign ${currentCampaignId} to requirement emails...`);
          // Pass the email server campaign ID so we fetch the correct status details
          const syncResult = await syncCampaignToRequirementEmails(currentCampaignId, user!.id, emailServerCampaignId);
          if (syncResult.success) {
            console.log(`[handleSendCampaign] Synced ${syncResult.count} emails to requirement history`);
            
            // Immediately refresh email history to show new emails
            try {
              const { data: newEmails, error: emailError } = await supabase
                .from('requirement_emails')
                .select('*')
                .eq('requirement_id', requirementId)
                .order('sent_date', { ascending: false });
              
              if (!emailError && newEmails) {
                setEmails(newEmails);
                console.log(`[handleSendCampaign] Email history refreshed with ${newEmails.length} total emails`);
              }
            } catch (err) {
              console.error('Error refreshing email history:', err);
            }
            
            showToast({
              type: 'success',
              message: `✅ Campaign complete & email history updated: ${syncResult.count} emails added`,
            });
          } else {
            console.warn(`[handleSendCampaign] Sync failed: ${syncResult.error}`);
            showToast({
              type: 'warning',
              message: `Note: Email history may not have updated (${syncResult.error})`,
            });
          }
        } else {
          showToast({
            type: 'warning',
            message: pollResult.error || 'Campaign polling completed',
          });
        }

        // Auto-close after a short delay
        setTimeout(() => {
          closeBulkEmailModal();
        }, 1500);
      } else {
        showToast({
          type: 'error',
          message: result?.error || 'Failed to send campaign',
        });
        setBulkEmailStep('review');
      }
    } catch (error) {
      console.error('Error sending campaign:', error);
      showToast({
        type: 'error',
        message: 'An error occurred while sending the campaign',
      });
      setBulkEmailStep('review');
    }
  };

  const closeBulkEmailModal = () => {
    setShowBulkEmailModal(false);
    setBulkEmailStep('recipients');
    setRecipientsText('');
    setRecipients([]);
    setSelectedAccountIds([]);
    setRecipientAccountMap({});
    setSubject('');
    setBody('');
    setSendingProgress(null);
    setCurrentCampaignId(null);
    setShowMultipleEmailsHint(false);
  };

  if (emailsLoading && emails.length === 0) {
    return <LogoLoader size="md" showText label="Loading emails..." />;
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Email Management
          {requirementTitle && (
            <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
              for: {requirementTitle}
            </Typography>
          )}
        </Typography>
        <Button
          variant="contained"
          startIcon={<Plus className="w-4 h-4" />}
          onClick={() => setShowBulkEmailModal(true)}
          size="small"
        >
          Send Email
        </Button>
      </Stack>

      {/* Email History with Virtual Scrolling (optimized for 5K+ emails) */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {emailsLoading && emails.length === 0 ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
            <LogoLoader size="md" showText label="Loading emails..." />
          </Box>
        ) : emails.length === 0 ? (
          <Paper
            variant="outlined"
            sx={{
              p: 3,
              textAlign: 'center',
              bgcolor: 'rgba(0,0,0,0.02)',
              borderStyle: 'dashed',
            }}
          >
            <Mail className="w-12 h-12 mx-auto mb-2 text-gray-300" />
            <Typography color="text.secondary" variant="body2">
              No emails sent for this requirement yet
            </Typography>
          </Paper>
        ) : (
          <>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1 }}>
              Showing {emails.length} of {totalEmails} emails
            </Typography>
            <Box ref={parentRef} sx={{ flex: 1, overflow: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
              <VirtualEmailList emails={emails} expandedEmailId={expandedEmailId} setExpandedEmailId={setExpandedEmailId} parentRef={parentRef} onNearBottom={handleLoadMoreEmails} />
            </Box>
            {isLoadingMore && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                <CircularProgress size={24} />
              </Box>
            )}
          </>
        )}
      </Box>

      {/* Bulk Email Modal */}
      <Dialog
        open={showBulkEmailModal}
        onClose={closeBulkEmailModal}
        fullWidth
        maxWidth="md"
        scroll="paper"
      >
        <DialogTitle sx={{ pr: 7 }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Send className="w-5 h-5" />
            <Typography variant="h6" sx={{ fontWeight: 500 }}>
              Send Bulk Email - {requirementTitle}
            </Typography>
          </Stack>
        </DialogTitle>

        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {/* Step 1: Recipients */}
            {bulkEmailStep === 'recipients' && (
              <Stack spacing={2}>
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    Paste Recipients
                  </Typography>
                  <TextField
                    fullWidth
                    multiline
                    rows={6}
                    placeholder="email@example.com&#10;email2@example.com, John Doe&#10;..."
                    value={recipientsText}
                    onChange={(e) => setRecipientsText(e.target.value)}
                    size="small"
                  />
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                    Format: email@example.com or email@example.com, Name
                  </Typography>
                  {showMultipleEmailsHint && (
                    <Box
                      sx={{
                        mt: 1.5,
                        p: 1.5,
                        bgcolor: 'rgba(33, 150, 243, 0.08)',
                        border: '1px solid rgba(33, 150, 243, 0.3)',
                        borderRadius: 1,
                      }}
                    >
                      <Typography variant="caption" color="primary" sx={{ fontWeight: 500 }}>
                        💡 Multiple emails detected from requirement vendor. You can separate them using semicolons (;) or newlines.
                      </Typography>
                    </Box>
                  )}
                </Box>
              </Stack>
            )}

            {/* Step 2: Select Email Accounts */}
            {bulkEmailStep === 'accounts' && (
              <Stack spacing={2}>
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 2 }}>
                    Select Email Account(s) to Send From
                  </Typography>
                  {accounts.length === 0 ? (
                    <Paper
                      variant="outlined"
                      sx={{
                        p: 2,
                        textAlign: 'center',
                        bgcolor: 'rgba(239,68,68,0.08)',
                        borderColor: 'rgba(239,68,68,0.3)',
                      }}
                    >
                      <Typography variant="body2" color="error" sx={{ fontWeight: 500 }}>
                        ⚠️ No email accounts configured
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                        Please set up email accounts in settings first
                      </Typography>
                    </Paper>
                  ) : (
                    <Stack spacing={1.5}>
                      {accounts.map((account) => (
                        <Paper
                          key={account.id}
                          variant="outlined"
                          sx={{
                            p: 2,
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            bgcolor: selectedAccountIds.includes(account.id) ? 'rgba(33, 150, 243, 0.08)' : 'transparent',
                            borderColor: selectedAccountIds.includes(account.id) ? 'primary.main' : 'divider',
                            '&:hover': {
                              borderColor: 'primary.main',
                              boxShadow: 1,
                            },
                          }}
                          onClick={() => handleSelectAccount(account.id)}
                        >
                          <Stack direction="row" spacing={2} alignItems="center">
                            <input
                              type="checkbox"
                              checked={selectedAccountIds.includes(account.id)}
                              onChange={() => handleSelectAccount(account.id)}
                              style={{ cursor: 'pointer', width: 20, height: 20 }}
                            />
                            <Stack sx={{ flex: 1 }}>
                              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                {account.email_address}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                Limit: {account.email_limit_per_rotation} emails per rotation
                              </Typography>
                            </Stack>
                            {account.is_active ? (
                              <Typography variant="caption" sx={{ px: 1, py: 0.5, bgcolor: 'rgba(34,197,94,0.1)', borderRadius: 1, color: 'rgb(34,197,94)', fontWeight: 600 }}>
                                Active
                              </Typography>
                            ) : (
                              <Typography variant="caption" sx={{ px: 1, py: 0.5, bgcolor: 'rgba(107,114,128,0.1)', borderRadius: 1, color: 'rgb(107,114,128)', fontWeight: 600 }}>
                                Inactive
                              </Typography>
                            )}
                          </Stack>
                        </Paper>
                      ))}
                    </Stack>
                  )}
                </Box>
              </Stack>
            )}

            {/* Step 3: Assign Recipients to Accounts */}
            {bulkEmailStep === 'assignment' && (
              <Stack spacing={2}>
                <Box>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                    <Typography variant="subtitle2">
                      Assign Recipients to Email Accounts
                    </Typography>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={handleAutoAssignRecipients}
                    >
                      Auto-Assign (Round-robin)
                    </Button>
                  </Stack>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                    Select which email account will send to each recipient. Unassigned recipients will use the first available account.
                  </Typography>

                  <Stack spacing={1.5} sx={{ maxHeight: 400, overflowY: 'auto' }}>
                    {recipients.map((recipient) => (
                      <Paper
                        key={recipient.email}
                        variant="outlined"
                        sx={{
                          p: 2,
                          bgcolor: recipientAccountMap[recipient.email] ? 'rgba(33, 150, 243, 0.05)' : 'transparent',
                        }}
                      >
                        <Stack direction="row" spacing={2} alignItems="center">
                          <Stack sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="body2" sx={{ fontWeight: 500, wordBreak: 'break-all' }}>
                              {recipient.email}
                            </Typography>
                            {recipient.name && (
                              <Typography variant="caption" color="text.secondary">
                                {recipient.name}
                              </Typography>
                            )}
                          </Stack>
                          <Stack direction="row" spacing={1} sx={{ minWidth: 'auto' }}>
                            <select
                              value={recipientAccountMap[recipient.email] || ''}
                              onChange={(e) => {
                                if (e.target.value) {
                                  handleAssignRecipientToAccount(recipient.email, e.target.value);
                                } else {
                                  handleRemoveRecipientAssignment(recipient.email);
                                }
                              }}
                              style={{
                                padding: '8px 12px',
                                borderRadius: '4px',
                                border: '1px solid #ddd',
                                fontFamily: 'inherit',
                                fontSize: '12px',
                                cursor: 'pointer',
                              }}
                            >
                              <option value="">Select account...</option>
                              {accounts
                                .filter(acc => selectedAccountIds.includes(acc.id))
                                .map(acc => (
                                  <option key={acc.id} value={acc.id}>
                                    {acc.email_address}
                                  </option>
                                ))}
                            </select>
                            {recipientAccountMap[recipient.email] && (
                              <Typography
                                variant="caption"
                                sx={{
                                  px: 1,
                                  py: 0.5,
                                  borderRadius: 1,
                                  bgcolor: 'rgba(34,197,94,0.1)',
                                  color: 'rgb(34,197,94)',
                                  fontWeight: 600,
                                  minWidth: 'fit-content',
                                }}
                              >
                                ✓ Assigned
                              </Typography>
                            )}
                          </Stack>
                        </Stack>
                      </Paper>
                    ))}
                  </Stack>
                </Box>
              </Stack>
            )}

            {/* Step 4: Compose */}
            {bulkEmailStep === 'compose' && (
              <Stack spacing={2}>
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    Recipients: {recipients.length}
                  </Typography>
                  <Paper variant="outlined" sx={{ p: 1.5, maxHeight: 150, overflowY: 'auto', bgcolor: 'rgba(0,0,0,0.02)' }}>
                    <Typography variant="caption" component="div">
                      {recipients.map((r, i) => (
                        <div key={i}>{r.email}</div>
                      ))}
                    </Typography>
                  </Paper>
                </Box>

                <TextField
                  fullWidth
                  label="Subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Email subject"
                  size="small"
                />

                {/* Templates */}
                <TemplateManager
                  templates={templates}
                  onTemplatesChange={setTemplates}
                  onTemplateSelect={(template) => {
                    setSubject(template.subject);
                    setBody(template.body);
                  }}
                />

                {/* Signatures */}
                <SignatureManager
                  signatures={signatures}
                  onSignaturesChange={setSignatures}
                  onSignatureSelect={(sig) => setBody(body + '\n\n' + sig.content)}
                />

                {/* Rich Text Editor */}
                <RichTextEditor
                  value={body}
                  onChange={setBody}
                  placeholder="Email message (supports formatting, mail merge variables like {{name}}, {{company}})"
                  minRows={6}
                  showFormatting={true}
                />

                {/* Attachments */}
                <AttachmentManager
                  attachments={attachments}
                  onAttachmentsChange={setAttachments}
                  maxFileSize={25}
                  maxTotalSize={100}
                />

                {/* Drafts */}
                <DraftManager
                  drafts={drafts}
                  currentDraft={{ subject, body, to: recipients.map(r => r.email) }}
                  onDraftsChange={setDrafts}
                  autoSaveEnabled={true}
                  autoSaveInterval={30000}
                  onDraftSelect={(draft) => {
                    setSubject(draft.subject);
                    setBody(draft.body);
                  }}
                />

                {/* Schedule Send */}
                <ScheduleSend onScheduleChange={setScheduleOptions} />

                {/* Advanced Options */}
                <AdvancedOptions
                  options={advancedOptions}
                  onOptionsChange={setAdvancedOptions}
                />
              </Stack>
            )}

            {/* Step 4: Review */}
            {bulkEmailStep === 'review' && (
              <Stack spacing={2}>
                <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.3)' }}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    ✓ Campaign Ready to Send
                  </Typography>
                </Paper>

                <Stack spacing={1}>
                  <Typography variant="body2" color="text.secondary">
                    Recipients: {recipients.length}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Subject: {subject}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Email Account(s): {selectedAccountIds.length > 0 ? `${selectedAccountIds.length} account${selectedAccountIds.length > 1 ? 's' : ''}` : 'None'}
                  </Typography>
                  {attachments.length > 0 && (
                    <Typography variant="body2" color="text.secondary">
                      Attachments: {attachments.length} file(s)
                    </Typography>
                  )}
                  {scheduleOptions.enabled && scheduleOptions.sendAt && (
                    <Typography variant="body2" color="text.secondary">
                      ⏱ Scheduled: {new Date(scheduleOptions.sendAt).toLocaleString()}
                    </Typography>
                  )}
                  {advancedOptions.priority && advancedOptions.priority !== 'normal' && (
                    <Typography variant="body2" color="text.secondary">
                      Priority: <strong>{advancedOptions.priority}</strong>
                    </Typography>
                  )}
                  {selectedAccountIds.length > 1 && (
                    <Typography variant="caption" color="info.main" sx={{ fontWeight: 500, mt: 1 }}>
                      💡 Each of the {selectedAccountIds.length} selected accounts will send to all {recipients.length} recipients
                    </Typography>
                  )}
                </Stack>

                <Paper variant="outlined" sx={{ p: 2, maxHeight: 220, overflowY: 'auto', bgcolor: 'rgba(0,0,0,0.02)' }}>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                    {body}
                  </Typography>
                </Paper>
              </Stack>
            )}

            {/* Step 5: Sending */}
            {bulkEmailStep === 'sending' && sendingProgress && (
              <Stack spacing={3}>
                <Stack alignItems="center" spacing={1}>
                  <LogoLoader size="lg" showText label="Sending Campaign..." />
                  <Typography variant="caption" color="text.secondary">
                    {sendingProgress.status === 'completed' && 'Campaign completed!'}
                    {sendingProgress.status === 'failed' && 'Campaign failed'}
                    {sendingProgress.status === 'queued' && 'Queuing emails...'}
                    {sendingProgress.status === 'sending' && 'Sending emails...'}
                  </Typography>
                </Stack>

                <Stack spacing={2}>
                  {/* Progress Bar */}
                  <Stack spacing={1}>
                    <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                        Progress
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {sendingProgress.progress}%
                      </Typography>
                    </Stack>
                    <LinearProgress
                      variant="determinate"
                      value={sendingProgress.progress}
                      sx={{ height: 8, borderRadius: 4 }}
                    />
                  </Stack>

                  {/* Stats Grid */}
                  <Stack direction="row" spacing={2}>
                    <Paper variant="outlined" sx={{ flex: 1, p: 1.5, textAlign: 'center', bgcolor: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.3)' }}>
                      <Typography variant="body2" color="text.secondary">Sent</Typography>
                      <Typography variant="h6" sx={{ color: 'rgb(34,197,94)', fontWeight: 700 }}>
                        {sendingProgress.sent}
                      </Typography>
                    </Paper>
                    <Paper variant="outlined" sx={{ flex: 1, p: 1.5, textAlign: 'center', bgcolor: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.3)' }}>
                      <Typography variant="body2" color="text.secondary">Failed</Typography>
                      <Typography variant="h6" sx={{ color: 'rgb(239,68,68)', fontWeight: 700 }}>
                        {sendingProgress.failed}
                      </Typography>
                    </Paper>
                    <Paper variant="outlined" sx={{ flex: 1, p: 1.5, textAlign: 'center', bgcolor: 'rgba(59,130,246,0.08)', borderColor: 'rgba(59,130,246,0.3)' }}>
                      <Typography variant="body2" color="text.secondary">Total</Typography>
                      <Typography variant="h6" sx={{ color: 'rgb(59,130,246)', fontWeight: 700 }}>
                        {sendingProgress.total}
                      </Typography>
                    </Paper>
                  </Stack>

                  {/* Details */}
                  <Stack spacing={0.5}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
                      Processed: {sendingProgress.processed}/{sendingProgress.total}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Remaining: {sendingProgress.total - sendingProgress.processed}
                    </Typography>
                  </Stack>

                  {/* Status message */}
                  {sendingProgress.status === 'completed' && sendingProgress.failed === 0 && (
                    <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.3)' }}>
                      <Typography variant="body2" sx={{ color: 'rgb(34,197,94)', fontWeight: 500 }}>
                        ✓ All emails sent successfully!
                      </Typography>
                    </Paper>
                  )}
                  {sendingProgress.status === 'completed' && sendingProgress.failed > 0 && (
                    <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'rgba(251,146,60,0.08)', borderColor: 'rgba(251,146,60,0.3)' }}>
                      <Typography variant="body2" sx={{ color: 'rgb(251,146,60)', fontWeight: 500 }}>
                        ⚠️ Campaign completed with {sendingProgress.failed} failed email(s)
                      </Typography>
                    </Paper>
                  )}
                </Stack>
              </Stack>
            )}
          </Stack>
        </DialogContent>

        <DialogActions>
          {bulkEmailStep === 'recipients' && (
            <>
              <Button onClick={closeBulkEmailModal}>Cancel</Button>
              <Button variant="contained" onClick={handleParseRecipients} disabled={!recipientsText.trim()}>
                Continue
              </Button>
            </>
          )}

          {bulkEmailStep === 'accounts' && (
            <>
              <Button onClick={() => setBulkEmailStep('recipients')}>Back</Button>
              <Button onClick={closeBulkEmailModal}>Cancel</Button>
              <Button variant="contained" onClick={handleProceedToCompose} disabled={accounts.length === 0 || selectedAccountIds.length === 0}>
                Continue
              </Button>
            </>
          )}

          {bulkEmailStep === 'assignment' && (
            <>
              <Button onClick={() => setBulkEmailStep('accounts')}>Back</Button>
              <Button onClick={closeBulkEmailModal}>Cancel</Button>
              <Button variant="contained" onClick={() => setBulkEmailStep('compose')}>
                Continue to Compose
              </Button>
            </>
          )}

          {bulkEmailStep === 'compose' && (
            <>
              <Button onClick={() => setBulkEmailStep('assignment')}>Back</Button>
              <Button onClick={closeBulkEmailModal}>Cancel</Button>
              <Button variant="contained" onClick={handleCreateCampaign} disabled={bulkLoading || !subject || !body}>
                Review
              </Button>
            </>
          )}

          {bulkEmailStep === 'review' && (
            <>
              <Button onClick={() => setBulkEmailStep('compose')}>Back</Button>
              <Button onClick={closeBulkEmailModal}>Cancel</Button>
              <Button variant="contained" color="success" onClick={handleSendCampaign} disabled={bulkLoading}>
                Send Campaign
              </Button>
            </>
          )}

          {bulkEmailStep === 'sending' && (
            <Button onClick={closeBulkEmailModal} disabled={sendingProgress === null}>
              Close
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
};

/**
 * Virtual Email List Component
 * Uses @tanstack/react-virtual for efficient rendering of 5K+ emails
 * Only renders visible items in the DOM
 */
interface VirtualEmailListProps {
  emails: RequirementEmail[];
  expandedEmailId: string | null;
  setExpandedEmailId: (id: string | null) => void;
  parentRef: React.RefObject<HTMLDivElement>;
  onNearBottom: () => void;
}

const VirtualEmailList = ({ 
  emails, 
  expandedEmailId, 
  setExpandedEmailId, 
  parentRef,
  onNearBottom 
}: VirtualEmailListProps) => {
  const virtualizer = useVirtualizer({
    count: emails.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 120,
    overscan: 5,
    measureElement: typeof window !== 'undefined' && navigator.userAgent.indexOf('jsdom') === -1 ? element => element?.getBoundingClientRect().height : undefined,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  // Detect when user scrolls near bottom and load more
  useEffect(() => {
    if (virtualItems.length > 0) {
      const lastItem = virtualItems[virtualItems.length - 1];
      if (lastItem.index >= emails.length - 5) {
        onNearBottom();
      }
    }
  }, [virtualItems, emails.length, onNearBottom]);

  return (
    <div style={{ position: 'relative', width: '100%', height: totalSize }}>
      {virtualItems.map((virtualItem) => {
        const email = emails[virtualItem.index];
        return (
          <div
            key={virtualItem.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            <Paper
              variant="outlined"
              sx={{
                m: 1.5,
                mb: 0.75,
                p: 2,
                cursor: 'pointer',
                transition: 'all 0.2s',
                '&:hover': { boxShadow: 1, borderColor: 'primary.light' },
              }}
              onClick={() => setExpandedEmailId(expandedEmailId === email.id ? null : email.id)}
            >
              <Stack direction="row" spacing={2} alignItems="flex-start">
                <Box sx={{ flexShrink: 0 }}>
                  {email.status === 'sent' && <span style={{ color: 'rgb(34,197,94)' }}>✓</span>}
                  {email.status === 'failed' && <span style={{ color: 'rgb(239,68,68)' }}>✕</span>}
                  {email.status === 'pending' && <span style={{ color: 'rgb(234,179,8)' }}>⏳</span>}
                  {!['sent', 'failed', 'pending'].includes(email.status) && <Mail className="w-4 h-4" />}
                </Box>
                <Stack sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {email.recipient_email}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {email.subject}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {new Date(email.sent_date).toLocaleString()}
                  </Typography>
                </Stack>
                <Typography
                  variant="caption"
                  sx={{
                    px: 1,
                    py: 0.5,
                    borderRadius: 1,
                    bgcolor:
                      email.status === 'sent'
                        ? 'rgba(34,197,94,0.1)'
                        : email.status === 'failed'
                          ? 'rgba(239,68,68,0.1)'
                          : 'rgba(234,179,8,0.1)',
                    color:
                      email.status === 'sent'
                        ? 'rgb(34,197,94)'
                        : email.status === 'failed'
                          ? 'rgb(239,68,68)'
                          : 'rgb(234,179,8)',
                    fontWeight: 600,
                    textTransform: 'capitalize',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {email.status}
                </Typography>
              </Stack>
            </Paper>
          </div>
        );
      })}
    </div>
  );
};

export default RequirementEmailManager;
