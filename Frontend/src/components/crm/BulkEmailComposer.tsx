import { useState, useEffect } from 'react';
import { Send, Mail as MailIcon } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../contexts/ToastContext';
import { LogoLoader } from '../common/LogoLoader';
import { parseEmailList, deduplicateEmails } from '../../lib/emailParser';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Stepper from '@mui/material/Stepper';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import LinearProgress from '@mui/material/LinearProgress';
import { createBulkEmailCampaign, sendBulkEmailCampaign } from '../../lib/api/bulkEmailCampaigns';
import { getEmailAccounts } from '../../lib/api/emailAccounts';
import { BrandButton } from '../brand';

interface BulkEmailCampaignRow {
  id: string;
  user_id: string;
  requirement_id: string | null;
  subject: string;
  body: string;
  total_recipients: number;
  rotation_enabled: boolean;
  emails_per_account: number;
  status: string;
  created_at: string;
}

interface EmailAccountRow {
  id: string;
  user_id: string;
  email_address: string;
  email_limit_per_rotation: number;
  is_active: boolean;
}

interface BulkEmailComposerProps {
  requirementId?: string;
  onClose?: () => void;
  initialRecipients?: Array<{ email: string; name?: string }>;
  initialSubject?: string;
}

/**
 * Bulk Email Composer Component
 * Allows users to send emails to multiple recipients with account rotation
 */
export const BulkEmailComposer = ({ 
  requirementId, 
  onClose,
  initialRecipients,
  initialSubject 
}: BulkEmailComposerProps) => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [step, setStep] = useState<'recipients' | 'compose' | 'review' | 'sending'>('recipients');
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<EmailAccountRow[]>([]);

  // Form state
  const [recipientsText, setRecipientsText] = useState('');
  const [recipients, setRecipients] = useState<Array<{ email: string; name?: string }>>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [rotationEnabled, setRotationEnabled] = useState(true);
  const [emailsPerAccount, setEmailsPerAccount] = useState(5);

  // Campaign state
  const [campaign, setCampaign] = useState<BulkEmailCampaignRow | null>(null);
  const [sendingProgress, setSendingProgress] = useState<{
    total: number;
    sent: number;
    failed: number;
  } | null>(null);

  // Load email accounts callback
  const loadAccounts = async () => {
    if (!user) return;

    const result = await getEmailAccounts(user.id);
    if (result.success && result.accounts) {
      setAccounts(result.accounts);
    }
  };

  useEffect(() => {
    loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pre-fill data if replying
  useEffect(() => {
    if (initialRecipients && initialRecipients.length > 0) {
      setRecipients(initialRecipients);
      // Format text for the input field as well (fallback view)
      const text = initialRecipients.map(r => r.name ? `${r.name} <${r.email}>` : r.email).join('\n');
      setRecipientsText(text);
      
      // Auto-advance to compose step if we have valid recipients
      setStep('compose');
    }
    
    if (initialSubject) {
      setSubject(initialSubject);
    }
  }, [initialRecipients, initialSubject]);

  const parseRecipients = (text: string) => {
    // Use robust email parser that handles various formats
    const parsedEmails = parseEmailList(text);
    // Deduplicate by email address (case-insensitive)
    return deduplicateEmails(parsedEmails);
  };

  // Validate email format with detailed feedback
  const validateEmail = (email: string): { valid: boolean; error?: string } => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    if (!email.trim()) {
      return { valid: false, error: 'Email address cannot be empty' };
    }
    
    if (email.includes(' ') && !email.includes(',')) {
      return { valid: false, error: 'Space in email address' };
    }
    
    if (!email.includes('@')) {
      return { valid: false, error: 'Missing @ symbol' };
    }
    
    const parts = email.split('@');
    if (!parts[0] || !parts[0].trim()) {
      return { valid: false, error: 'Missing local part (before @)' };
    }
    
    const domain = parts[1];
    if (!domain || !domain.trim()) {
      return { valid: false, error: 'Missing domain name' };
    }
    
    if (!domain.includes('.')) {
      return { valid: false, error: 'Domain missing TLD (.com, .org, etc.)' };
    }
    
    if (!emailRegex.test(email)) {
      return { valid: false, error: 'Invalid email format' };
    }
    
    return { valid: true };
  };

  const handleParseRecipients = () => {
    const parsed = parseRecipients(recipientsText);

    if (parsed.length === 0) {
      showToast({
        type: 'error',
        message: 'No valid email addresses found. Check format: email@example.com or email@example.com,Name',
      });
      return;
    }

    // Validate all emails
    const invalidEmails = parsed.filter(r => !validateEmail(r.email).valid);
    if (invalidEmails.length > 0) {
      const errors = invalidEmails.map(r => {
        const validation = validateEmail(r.email);
        return `${r.email}: ${validation.error}`;
      });
      showToast({
        type: 'error',
        message: `Invalid email(s) found:\n${errors.slice(0, 3).join('\n')}${errors.length > 3 ? `\n...and ${errors.length - 3} more` : ''}`,
      });
      return;
    }

    setRecipients(parsed);
    setStep('compose');
    showToast({
      type: 'success',
      message: `✓ ${parsed.length} valid recipient${parsed.length !== 1 ? 's' : ''} added`,
    });
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

    setLoading(true);
    const result = await createBulkEmailCampaign({
      userId: user.id,
      subject,
      body,
      recipients,
      rotationEnabled,
      emailsPerAccount,
      requirementId,
    });

    if (result.success && result.campaign) {
      setCampaign(result.campaign);
      setStep('review');
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

    setLoading(false);
  };

  const handleSendCampaign = async () => {
    if (!campaign) return;

    if (accounts.length === 0) {
      showToast({
        type: 'error',
        message: 'No email accounts configured. Please add accounts first.',
      });
      return;
    }

    setStep('sending');
    setSendingProgress({ total: recipients.length, sent: 0, failed: 0 });

    const result = await sendBulkEmailCampaign(campaign.id);

    if (result.success && result.result) {
      setSendingProgress({
        total: result.result.total,
        sent: result.result.sent,
        failed: result.result.failed,
      });

      showToast({
        type: result.result.failed === 0 ? 'success' : 'warning',
        message: `Campaign sent: ${result.result.sent} sent, ${result.result.failed} failed`,
      });
    } else {
      showToast({
        type: 'error',
        message: result.error || 'Failed to send campaign',
      });
    }
  };

  if (!user) {
    return (
      <Paper variant="outlined" sx={{ p: 3, textAlign: 'center', bgcolor: '#FFFFFF', borderColor: '#E5E7EB' }}>
        <Typography variant="body2" color="text.secondary">
          Please sign in to send bulk emails
        </Typography>
      </Paper>
    );
  }

  const steps = ['recipients', 'compose', 'review', 'sending'] as const;
  const activeStepIndex = steps.indexOf(step);

  return (
    <Dialog
      open={true}
      onClose={() => onClose?.()}
      fullWidth
      maxWidth="md"
      scroll="paper"
      slotProps={{
        backdrop: { sx: { backdropFilter: 'blur(4px)' } }
      }}
      PaperProps={{
        sx: {
          boxShadow: 24,
        }
      }}
    >
      {/* Header */}
      <DialogTitle sx={{ pr: 7 }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <MailIcon className="w-5 h-5" />
          <Typography variant="h6" sx={{ fontWeight: 500 }}>
            {initialSubject ? 'Reply to Email' : 'Bulk Email Campaign'}
          </Typography>
        </Stack>
        {onClose ? (
          <IconButton onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }} aria-label="Close">
            <Box component="span">✕</Box>
          </IconButton>
        ) : null}
      </DialogTitle>

      {/* Progress Indicator */}
      <DialogContent dividers>
        <Stack spacing={2}>
          <Stepper activeStep={Math.max(0, activeStepIndex)} alternativeLabel>
            <Step>
              <StepLabel>Recipients</StepLabel>
            </Step>
            <Step>
              <StepLabel>Compose</StepLabel>
            </Step>
            <Step>
              <StepLabel>Review</StepLabel>
            </Step>
            <Step>
              <StepLabel>Sending</StepLabel>
            </Step>
          </Stepper>

          {/* Content */}
          <Box>
            {/* Step 1: Recipients */}
            {step === 'recipients' && (
              <Stack spacing={2.5}>
                {/* Guidance Section */}
                <Paper variant="outlined" sx={{ p: 2, bgcolor: 'rgba(59,130,246,0.05)', borderColor: 'rgba(59,130,246,0.2)' }}>
                  <Stack spacing={1}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      📝 Supported Formats
                    </Typography>
                    <Stack component="ul" sx={{ pl: 2.5, m: 0, spacing: 0.5 }}>
                      <Typography component="li" variant="body2" color="text.secondary">
                        <code>john@example.com</code>
                      </Typography>
                      <Typography component="li" variant="body2" color="text.secondary">
                        <code>john@example.com, John Doe</code>
                      </Typography>
                      <Typography component="li" variant="body2" color="text.secondary">
                        Comma-separated: <code>john@example.com, jane@example.com</code>
                      </Typography>
                      <Typography component="li" variant="body2" color="text.secondary">
                        One per line or mixed formats
                      </Typography>
                    </Stack>
                  </Stack>
                </Paper>

                {/* Input Field */}
                <Stack spacing={1}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    Recipient Email Addresses
                  </Typography>
                  <TextField
                    multiline
                    minRows={10}
                    maxRows={15}
                    value={recipientsText}
                    onChange={(e) => setRecipientsText(e.target.value)}
                    placeholder={`Examples:\njohn@example.com\njane@example.com, Jane Smith\nbob@company.com, Bob Johnson\n\nOr paste from spreadsheet...`}
                    fullWidth
                    variant="outlined"
                    helperText={
                      recipientsText.trim().length > 0
                        ? `Found ${parseRecipients(recipientsText).length} valid email${parseRecipients(recipientsText).length !== 1 ? 's' : ''}`
                        : 'Paste or type email addresses (one per line, comma-separated, or mixed format)'
                    }
                  />
                </Stack>

                {/* Preview Section */}
                {recipientsText.trim().length > 0 && parseRecipients(recipientsText).length > 0 && (
                  <Paper variant="outlined" sx={{ p: 2, bgcolor: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.3)' }}>
                    <Stack spacing={1.5}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                          ✓ Valid Recipients: {parseRecipients(recipientsText).length}
                        </Typography>
                      </Stack>
                      <Stack 
                        spacing={0.75} 
                        sx={{ 
                          maxHeight: 150, 
                          overflowY: 'auto',
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                          gap: 1
                        }}
                      >
                        {parseRecipients(recipientsText).slice(0, 12).map((recipient, idx) => (
                          <Paper 
                            key={`${recipient.email}-${idx}`}
                            variant="outlined" 
                            sx={{ 
                              p: 1, 
                              bgcolor: 'rgba(255,255,255,0.03)',
                              borderColor: 'rgba(34,197,94,0.2)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1
                            }}
                          >
                            <Typography variant="caption" sx={{ flex: 1, wordBreak: 'break-word' }}>
                              {recipient.name ? `${recipient.name} <${recipient.email}>` : recipient.email}
                            </Typography>
                          </Paper>
                        ))}
                      </Stack>
                      {parseRecipients(recipientsText).length > 12 && (
                        <Typography variant="caption" color="text.secondary">
                          +{parseRecipients(recipientsText).length - 12} more recipients...
                        </Typography>
                      )}
                    </Stack>
                  </Paper>
                )}
              </Stack>
            )}

            {/* Step 2: Compose */}
            {step === 'compose' && (
              <Stack spacing={2}>
                {/* Recipients Summary */}
                <Paper variant="outlined" sx={{ p: 2, bgcolor: '#EEF2FF', borderColor: '#93C5FD', borderLeft: '4px solid #2563EB' }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Stack spacing={0.5}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                        📧 Recipients Ready
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {recipients.length} email{recipients.length !== 1 ? 's' : ''} selected
                      </Typography>
                    </Stack>
                    <BrandButton
                      variant="secondary"
                      size="sm"
                      onClick={() => setStep('recipients')}
                    >
                      Edit Recipients
                    </BrandButton>
                  </Stack>
                </Paper>

                {/* Subject Field */}
                <Stack spacing={0.5}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    Subject Line
                  </Typography>
                  <TextField
                    label="Email subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Enter email subject..."
                    fullWidth
                    helperText={subject.length > 0 ? `${subject.length} characters` : 'Keep subject concise and compelling'}
                  />
                </Stack>

                {/* Body Field */}
                <Stack spacing={0.5}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    Email Body
                  </Typography>
                  <TextField
                    label="Email message"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Write your email message here..."
                    multiline
                    minRows={8}
                    maxRows={12}
                    fullWidth
                    helperText={`${body.length} characters${body.length > 5000 ? ' ⚠ Approaching limit (5000)' : ''}`}
                    FormHelperTextProps={{
                      sx: { color: body.length > 5000 ? 'warning.main' : 'text.secondary' }
                    }}
                  />
                </Stack>

                {/* Advanced Options Collapsible Section */}
                <Paper variant="outlined" sx={{ p: 2, bgcolor: 'rgba(100,116,139,0.05)', borderColor: 'rgba(100,116,139,0.2)' }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>
                    ⚙️ Sending Options
                  </Typography>
                  <Stack spacing={2}>
                    <FormControlLabel
                      control={<Checkbox checked={rotationEnabled} onChange={(e) => setRotationEnabled(e.target.checked)} />}
                      label={
                        <Stack spacing={0.5}>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>Enable Email Account Rotation</Typography>
                          <Typography variant="caption" color="text.secondary">
                            Distributes emails across multiple accounts to avoid hitting rate limits
                          </Typography>
                        </Stack>
                      }
                    />

                    {rotationEnabled && (
                      <Stack spacing={1.5} sx={{ pl: 3, pt: 1, borderLeft: '2px solid #93C5FD' }}>
                        <FormControl size="small" sx={{ maxWidth: 280 }}>
                          <InputLabel id="emails-per-account-label">Emails per Account</InputLabel>
                          <Select
                            labelId="emails-per-account-label"
                            value={String(emailsPerAccount)}
                            label="Emails per Account"
                            onChange={(e) => setEmailsPerAccount(parseInt(String(e.target.value), 10))}
                          >
                            <MenuItem value="5">5 emails</MenuItem>
                            <MenuItem value="10">10 emails</MenuItem>
                            <MenuItem value="15">15 emails</MenuItem>
                          </Select>
                        </FormControl>
                        <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'rgba(34,197,94,0.06)', borderColor: 'rgba(34,197,94,0.2)' }}>
                          {accounts.length > 0 ? (
                            <Stack spacing={0.5}>
                              <Typography variant="caption" sx={{ fontWeight: 600 }}>✓ Accounts Ready: {accounts.length}</Typography>
                              <Typography variant="caption" color="text.secondary">
                                {accounts.map((a) => a.email_address).join(', ')}
                              </Typography>
                            </Stack>
                          ) : (
                            <Typography variant="caption" color="error.main">⚠ No accounts configured - emails cannot be sent</Typography>
                          )}
                        </Paper>
                      </Stack>
                    )}
                  </Stack>
                </Paper>
              </Stack>
            )}

            {/* Step 3: Review */}
            {step === 'review' && campaign && (
              <Stack spacing={2.5}>
                {/* Status Indicator */}
                <Paper variant="outlined" sx={{ p: 2.5, bgcolor: 'rgba(34,197,94,0.10)', borderColor: 'rgba(34,197,94,0.35)', borderLeft: '4px solid rgb(34,197,94)' }}>
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <Box sx={{ fontSize: '1.5rem' }}>✓</Box>
                    <Stack spacing={0.5} sx={{ flex: 1 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                        Campaign Ready to Send
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Review details before sending to {campaign.total_recipients} recipient{campaign.total_recipients !== 1 ? 's' : ''}
                      </Typography>
                    </Stack>
                  </Stack>
                </Paper>

                {/* Campaign Details Grid */}
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                    gap: 2,
                  }}
                >
                  {/* Recipients Card */}
                  <Paper variant="outlined" sx={{ p: 2, bgcolor: 'rgba(100,116,139,0.05)', borderColor: 'rgba(100,116,139,0.2)' }}>
                    <Stack spacing={1}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>📧 Recipients</Typography>
                      <Typography variant="h6" sx={{ fontWeight: 700, color: 'primary.main' }}>
                        {campaign.total_recipients}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Email addresses
                      </Typography>
                    </Stack>
                  </Paper>

                  {/* Rotation Info Card */}
                  <Paper variant="outlined" sx={{ p: 2, bgcolor: 'rgba(100,116,139,0.05)', borderColor: 'rgba(100,116,139,0.2)' }}>
                    <Stack spacing={1}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>🔄 Rotation</Typography>
                      <Typography variant="h6" sx={{ fontWeight: 700, color: campaign.rotation_enabled ? 'success.main' : 'text.secondary' }}>
                        {campaign.rotation_enabled ? 'Enabled' : 'Disabled'}
                      </Typography>
                      {campaign.rotation_enabled && (
                        <Typography variant="caption" color="text.secondary">
                          {campaign.emails_per_account} emails/account
                        </Typography>
                      )}
                    </Stack>
                  </Paper>
                </Box>

                {/* Subject Preview */}
                <Stack spacing={1}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>📝 Subject Line</Typography>
                  <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'rgba(100,116,139,0.05)', borderColor: 'rgba(100,116,139,0.2)' }}>
                    <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
                      {campaign.subject}
                    </Typography>
                  </Paper>
                </Stack>

                {/* Email Body Preview */}
                <Stack spacing={1}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>💬 Email Body Preview</Typography>
                  <Paper variant="outlined" sx={{ p: 2, maxHeight: 300, overflowY: 'auto', bgcolor: '#FFFFFF', borderColor: '#E5E7EB' }}>
                    <Typography 
                      variant="body2" 
                      sx={{ 
                        whiteSpace: 'pre-wrap',
                        lineHeight: 1.6,
                        color: 'text.secondary',
                        fontFamily: 'monospace'
                      }}
                    >
                      {campaign.body}
                    </Typography>
                  </Paper>
                </Stack>

                {/* Warning if rotation enabled but no accounts */}
                {campaign.rotation_enabled && accounts.length === 0 && (
                  <Paper variant="outlined" sx={{ p: 2, bgcolor: 'rgba(239,68,68,0.10)', borderColor: 'rgba(239,68,68,0.35)', borderLeft: '4px solid rgb(239,68,68)' }}>
                    <Stack spacing={0.5}>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: 'error.main' }}>
                        ⚠️ No Email Accounts Configured
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Campaign cannot be sent without configured email accounts. Please add accounts in settings first.
                      </Typography>
                    </Stack>
                  </Paper>
                )}
              </Stack>
            )}

            {/* Step 4: Sending */}
            {step === 'sending' && sendingProgress && (
              <Stack spacing={2}>
                <Stack spacing={0.5} alignItems="center">
                  <LogoLoader size="lg" showText label="Sending Campaign" />
                </Stack>

                <Stack spacing={1}>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">Progress</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {sendingProgress.sent + sendingProgress.failed}/{sendingProgress.total}
                    </Typography>
                  </Stack>
                  <LinearProgress
                    variant="determinate"
                    value={sendingProgress.total > 0 ? ((sendingProgress.sent + sendingProgress.failed) / sendingProgress.total) * 100 : 0}
                  />
                </Stack>

                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 1,
                  }}
                >
                  <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center' }}>
                    <Typography variant="h5" sx={{ fontWeight: 500, color: 'success.main' }}>{sendingProgress.sent}</Typography>
                    <Typography variant="caption" color="text.secondary">Sent</Typography>
                  </Paper>
                  <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center' }}>
                    <Typography variant="h5" sx={{ fontWeight: 500, color: 'error.main' }}>{sendingProgress.failed}</Typography>
                    <Typography variant="caption" color="text.secondary">Failed</Typography>
                  </Paper>
                  <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center' }}>
                    <Typography variant="h5" sx={{ fontWeight: 500, color: 'text.secondary' }}>{sendingProgress.total}</Typography>
                    <Typography variant="caption" color="text.secondary">Total</Typography>
                  </Paper>
                </Box>
              </Stack>
            )}
          </Box>
        </Stack>
      </DialogContent>

      {/* Footer */}
      <DialogActions>
        {step !== 'sending' ? (
          <Stack direction="row" spacing={1} sx={{ width: '100%' }}>
            {step !== 'recipients' ? (
              <BrandButton
                variant="secondary"
                size="md"
                onClick={() => {
                  if (step === 'compose') setStep('recipients');
                  if (step === 'review') setStep('compose');
                }}
                className="flex-1"
              >
                Back
              </BrandButton>
            ) : (
              <BrandButton
                variant="secondary"
                size="md"
                onClick={() => onClose?.()}
                className="flex-1"
              >
                Cancel
              </BrandButton>
            )}

            {step === 'recipients' ? (
              <BrandButton
                variant="primary"
                size="md"
                onClick={handleParseRecipients}
                disabled={!recipientsText.trim()}
                className="flex-1"
              >
                Continue with {parseRecipients(recipientsText).length} Recipients
              </BrandButton>
            ) : step === 'compose' ? (
              <BrandButton
                variant="primary"
                size="md"
                onClick={handleCreateCampaign}
                disabled={loading}
                className="flex-1"
              >
                {loading ? 'Creating...' : 'Review Campaign'}
              </BrandButton>
            ) : step === 'review' && campaign ? (
              <BrandButton
                variant="primary"
                size="md"
                onClick={handleSendCampaign}
                className="flex-1"
              >
                <Send className="w-4 h-4 mr-2" />
                Send Campaign Now
              </BrandButton>
            ) : null}
          </Stack>
        ) : null}
      </DialogActions>
    </Dialog>
  );
};