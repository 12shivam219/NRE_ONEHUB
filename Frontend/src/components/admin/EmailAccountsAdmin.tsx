import { useState, useEffect, useCallback } from 'react';
import { Mail, CheckCircle, AlertCircle, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../contexts/ToastContext';
import { supabase } from '../../lib/supabase';
import { ConfirmDialog } from '../common/ConfirmDialog';
import {
  getEmailAccounts,
  addEmailAccount,
  deleteEmailAccount,
  testEmailAccount,
} from '../../lib/api/emailAccounts';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Divider from '@mui/material/Divider';
import CircularProgress from '@mui/material/CircularProgress';
import { getGmailAuthUrl } from '../../lib/gmail';

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
 * Email Accounts Admin Component
 * Combines Gmail Job Posting Scanner and Email Accounts management
 * for the admin panel
 */
export const EmailAccountsAdmin = () => {
  const { user } = useAuth();
  const { showToast } = useToast();

  // Gmail state
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailEmail, setGmailEmail] = useState<string | null>(null);
  const [gmailLoading, setGmailLoading] = useState(true);
  const [gmailConnecting, setGmailConnecting] = useState(false);

  // Email accounts state
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    emailLimitPerRotation: 5,
  });

  const [submitting, setSubmitting] = useState(false);
  const [accountToDelete, setAccountToDelete] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Load Gmail status
  const checkGmailStatus = useCallback(async () => {
    try {
      setGmailLoading(true);
      const { data } = await supabase.auth.getUser();
      if (data.user?.user_metadata?.gmail_connected) {
        setGmailConnected(true);
        setGmailEmail(data.user.user_metadata?.gmail_email || 'Gmail Account');
      } else {
        setGmailConnected(false);
        setGmailEmail(null);
      }
    } catch (error) {
      console.error('Error checking Gmail status:', error);
      setGmailConnected(false);
      setGmailEmail(null);
    } finally {
      setGmailLoading(false);
    }
  }, []);

  // Load email accounts
  const loadAccounts = useCallback(async () => {
    if (!user) return;
    setAccountsLoading(true);
    const result = await getEmailAccounts(user.id);
    if (result.success && result.accounts) {
      setAccounts(result.accounts);
    }
    setAccountsLoading(false);
  }, [user]);

  // Load on mount
  useEffect(() => {
    checkGmailStatus();
    loadAccounts();
  }, [checkGmailStatus, loadAccounts]);

  // Check Gmail status when page becomes visible (after OAuth redirect)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkGmailStatus();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [checkGmailStatus]);

  const handleConnectGmail = useCallback(async () => {
    try {
      setGmailConnecting(true);
      if (!import.meta.env.VITE_GOOGLE_CLIENT_ID) {
        showToast({
          type: 'error',
          message: 'Google OAuth is not configured. Please contact support.',
        });
        setGmailConnecting(false);
        return;
      }

      showToast({
        type: 'info',
        title: 'Redirecting to Google',
        message: 'You will be redirected to authorize Gmail access. Please complete the process.',
      });

      const ok = (await import('../../lib/safeRedirect')).safeOpenUrl(getGmailAuthUrl(), '_self');
      if (!ok) {
        showToast({ type: 'error', message: 'Blocked unsafe redirect to Google OAuth.' });
        setGmailConnecting(false);
      }
    } catch (error) {
      console.error('Error connecting Gmail:', error);
      setGmailConnecting(false);
      showToast({
        type: 'error',
        message: 'Failed to initiate Gmail connection',
      });
    }
  }, [showToast]);

  
  const handleDisconnectGmail = useCallback(async () => {
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          gmail_connected: false,
          gmail_email: null,
          gmail_refresh_token: null,
        },
      });

      if (error) throw error;

      setGmailConnected(false);
      setGmailEmail(null);
      showToast({
        type: 'success',
        message: 'Gmail disconnected successfully',
      });
    } catch (error) {
      console.error('Error disconnecting Gmail:', error);
      showToast({
        type: 'error',
        message: 'Failed to disconnect Gmail',
      });
    }
  }, [showToast]);

  const handleAddAccount = async () => {
    if (!user) return;

    if (!formData.email || !formData.password) {
      showToast({
        type: 'warning',
        message: 'Please fill in all fields',
      });
      return;
    }

    setSubmitting(true);
    const result = await addEmailAccount(
      user.id,
      formData.email,
      formData.password,
      formData.emailLimitPerRotation
    );

    if (result.success) {
      showToast({
        type: 'success',
        message: 'Email account added successfully',
      });
      setFormData({ email: '', password: '', emailLimitPerRotation: 5 });
      setShowAddForm(false);
      loadAccounts();
    } else {
      showToast({
        type: 'error',
        message: result.error || 'Failed to add email account',
      });
    }

    setSubmitting(false);
  };

  const handleDeleteAccountClick = (id: string) => {
    setAccountToDelete(id);
    setShowDeleteConfirm(true);
  };

  const handleDeleteAccount = async () => {
    if (!accountToDelete) return;
    const result = await deleteEmailAccount(accountToDelete);

    if (result.success) {
      showToast({
        type: 'success',
        message: 'Email account deleted',
      });
      loadAccounts();
    } else {
      showToast({
        type: 'error',
        message: result.error || 'Failed to delete email account',
      });
    }

    setAccountToDelete(null);
    setShowDeleteConfirm(false);
  };

  const handleTestAccount = async (id: string) => {
    setTesting(id);
    const result = await testEmailAccount(id);

    if (result.success) {
      showToast({
        type: 'success',
        message: result.message || 'Test email sent successfully',
      });
    } else {
      showToast({
        type: 'error',
        message: result.error || 'Test email failed',
      });
    }

    setTesting(null);
  };

  if (!user) {
    return (
      <div className="text-center py-8 text-gray-600">
        Please sign in to manage email accounts
      </div>
    );
  }

  return (
    <Box sx={{ maxWidth: '1000px', mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
          Email Accounts
        </Typography>
        <Typography sx={{ color: '#6B7280', fontSize: '0.95rem' }}>
          Manage Gmail Job Posting Scanner and Email Accounts for bulk sending.
        </Typography>
      </Box>

      {/* Gmail Job Posting Scanner Section */}
      <Card sx={{ mb: 3, border: '1px solid #E5E7EB' }}>
        <CardHeader
          title={
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Mail size={24} color="#2563EB" />
              <div>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  Gmail - Job Posting Scanner
                </Typography>
                <Typography sx={{ fontSize: '0.85rem', color: '#6B7280', mt: 0.25 }}>
                  Scan incoming emails for job postings automatically
                </Typography>
              </div>
            </Stack>
          }
        />
        <Divider />
        <CardContent>
          {gmailLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
              <CircularProgress />
            </Box>
          ) : (
            <Stack spacing={2}>
              {/* Status */}
              <Box
                sx={{
                  p: 2,
                  backgroundColor: gmailConnected ? '#F0FDF4' : '#FEF2F2',
                  borderRadius: '8px',
                  border: `1px solid ${gmailConnected ? '#BBEF63' : '#FECACA'}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                }}
              >
                {gmailConnected ? (
                  <>
                    <CheckCircle size={24} color="#16A34A" />
                    <Box sx={{ flex: 1 }}>
                      <Typography sx={{ fontWeight: 600, color: '#16A34A' }}>
                        Gmail Connected ✓
                      </Typography>
                      <Typography sx={{ fontSize: '0.85rem', color: '#6B7280', mt: 0.5 }}>
                        Email: <span style={{ fontWeight: 500, color: '#374151' }}>{gmailEmail}</span>
                      </Typography>
                      <Typography sx={{ fontSize: '0.85rem', color: '#6B7280' }}>
                        Ready to scan for job postings
                      </Typography>
                    </Box>
                  </>
                ) : (
                  <>
                    <AlertCircle size={24} color="#DC2626" />
                    <Box sx={{ flex: 1 }}>
                      <Typography sx={{ fontWeight: 600, color: '#DC2626' }}>
                        Gmail Not Connected
                      </Typography>
                      <Typography sx={{ fontSize: '0.85rem', color: '#6B7280' }}>
                        Connect Gmail to start scanning emails for job postings
                      </Typography>
                    </Box>
                  </>
                )}
              </Box>

              {/* Features */}
              <Box>
                <Typography sx={{ fontSize: '0.9rem', fontWeight: 500, mb: 1 }}>
                  When connected, the system will:
                </Typography>
                <ul style={{ margin: '0', paddingLeft: '1.25rem', fontSize: '0.875rem' }}>
                  <li style={{ color: '#6B7280', marginBottom: '0.5rem' }}>Scan your emails for job postings</li>
                  <li style={{ color: '#6B7280', marginBottom: '0.5rem' }}>Extract job details automatically</li>
                  <li style={{ color: '#6B7280' }}>Pre-fill job requirement forms</li>
                </ul>
              </Box>

              {/* Action Buttons */}
              <Stack direction="row" spacing={2}>
                {gmailConnected ? (
                  <Button
                    onClick={handleDisconnectGmail}
                    variant="outlined"
                    color="error"
                    startIcon={<Trash2 size={18} />}
                  >
                    Disconnect Gmail
                  </Button>
                ) : (
                  <Button
                    onClick={handleConnectGmail}
                    variant="contained"
                    color="primary"
                    startIcon={<Mail size={18} />}
                    disabled={gmailConnecting}
                  >
                    {gmailConnecting ? 'Connecting...' : 'Connect Gmail'}
                  </Button>
                )}
              </Stack>
            </Stack>
          )}
        </CardContent>
      </Card>

      {/* Email Accounts Section */}
      <Card sx={{ border: '1px solid #E5E7EB' }}>
        <CardHeader
          title={
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Mail size={24} color="#059669" />
              <div>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  Email Accounts - Bulk Sending
                </Typography>
                <Typography sx={{ fontSize: '0.85rem', color: '#6B7280', mt: 0.25 }}>
                  Configure email accounts for sending bulk emails to candidates
                </Typography>
              </div>
            </Stack>
          }
          action={
            <Button
              onClick={() => setShowAddForm(!showAddForm)}
              variant="contained"
              size="small"
              startIcon={<Plus size={18} />}
            >
              Add Account
            </Button>
          }
        />
        <Divider />
        <CardContent>
          {accountsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
              <CircularProgress />
            </Box>
          ) : (
            <Stack spacing={2}>
              {/* Add Form */}
              {showAddForm && (
                <Box sx={{ p: 2, backgroundColor: '#F9FAFB', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2 }}>
                    Add New Email Account
                  </Typography>
                  <Stack spacing={2}>
                    <TextField
                      label="Email Address"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      fullWidth
                      size="small"
                      placeholder="your-email@gmail.com"
                    />
                    <TextField
                      label="App Password"
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      fullWidth
                      size="small"
                      placeholder="Your Gmail App Password"
                      helperText="Use Gmail App Password, not your regular password"
                    />
                    <TextField
                      label="Email Limit Per Rotation"
                      type="number"
                      value={formData.emailLimitPerRotation}
                      onChange={(e) => setFormData({ ...formData, emailLimitPerRotation: parseInt(e.target.value) })}
                      fullWidth
                      size="small"
                      inputProps={{ min: 1, max: 100 }}
                    />
                    <Stack direction="row" spacing={2}>
                      <Button
                        onClick={handleAddAccount}
                        disabled={submitting}
                        variant="contained"
                        color="primary"
                      >
                        {submitting ? 'Adding...' : 'Add Account'}
                      </Button>
                      <Button
                        onClick={() => setShowAddForm(false)}
                        variant="outlined"
                      >
                        Cancel
                      </Button>
                    </Stack>
                  </Stack>
                </Box>
              )}

              {/* Accounts List */}
              {accounts.length === 0 && !showAddForm ? (
                <Box sx={{ p: 3, textAlign: 'center', color: '#6B7280' }}>
                  <Typography>No email accounts added yet</Typography>
                </Box>
              ) : (
                <Stack spacing={2}>
                  {accounts.map((account) => (
                    <Box
                      key={account.id}
                      sx={{
                        p: 2,
                        border: '1px solid #E5E7EB',
                        borderRadius: '8px',
                        backgroundColor: account.is_active ? '#F0FDF4' : '#F9FAFB',
                      }}
                    >
                      <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
                        <Box flex={1}>
                          <Typography sx={{ fontWeight: 600, color: '#1F2937' }}>
                            {account.email_address}
                          </Typography>
                          <Typography sx={{ fontSize: '0.85rem', color: '#6B7280' }}>
                            Limit: {account.email_limit_per_rotation} emails per rotation
                          </Typography>
                          <Typography sx={{ fontSize: '0.75rem', color: '#9CA3AF', mt: 0.5 }}>
                            Status: {account.is_active ? '✓ Active' : 'Inactive'}
                          </Typography>
                        </Box>
                        <Stack direction="row" spacing={1}>
                          <Button
                            onClick={() => handleTestAccount(account.id)}
                            disabled={testing === account.id}
                            size="small"
                            variant="outlined"
                            startIcon={testing === account.id ? <CircularProgress size={18} /> : undefined}
                          >
                            {testing === account.id ? 'Testing...' : 'Test'}
                          </Button>
                          <Button
                            onClick={() => handleDeleteAccountClick(account.id)}
                            size="small"
                            variant="outlined"
                            color="error"
                            startIcon={<Trash2 size={16} />}
                          >
                            Delete
                          </Button>
                        </Stack>
                      </Stack>
                    </Box>
                  ))}
                </Stack>
              )}
            </Stack>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete Email Account?"
        message="This email account will be removed. Are you sure?"
        onConfirm={handleDeleteAccount}
        onClose={() => {
          setAccountToDelete(null);
          setShowDeleteConfirm(false);
        }}
      />
    </Box>
  );
};

export default EmailAccountsAdmin;
