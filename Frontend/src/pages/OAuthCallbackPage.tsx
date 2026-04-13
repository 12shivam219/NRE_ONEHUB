import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useToast } from '../contexts/ToastContext';
import { LogoLoader } from '../components/common/LogoLoader';
import { supabase } from '../lib/supabase';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';

export const OAuthCallbackPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(true);

  useEffect(() => {
    let isActive = true;

    const resolveUserId = async () => {
      const { data, error: authError } = await supabase.auth.getUser();
      if (authError) {
        throw new Error(authError.message);
      }
      if (!data.user) {
        throw new Error('User not authenticated');
      }
      return data.user.id;
    };

    const getFlowConfig = (state: string | null) => {
      if (state === 'google-drive-connection') {
        return {
          title: 'Google Drive Connected',
          errorTitle: 'Google Drive Connection Failed',
          endpoint: '/api/google-drive/exchange-token',
          redirectTo: '/documents',
          loadingLabel: 'Connecting Google Drive...',
          finalizingLabel: 'Finalizing Google Drive connection...',
        };
      }

      if (state === 'gmail-connection') {
        return {
          title: 'Gmail Connected',
          errorTitle: 'Gmail Connection Failed',
          endpoint: '/api/gmail/exchange-token',
          redirectTo: '/admin?tab=email-accounts',
          loadingLabel: 'Connecting Gmail...',
          finalizingLabel: 'Finalizing Gmail connection...',
        };
      }

      throw new Error('Invalid state parameter');
    };

    const processOAuthCallback = async () => {
      try {
        // Get the authorization code from URL
        const code = searchParams.get('code');
        const state = searchParams.get('state');
        const error = searchParams.get('error');
        if (error) {
          throw new Error(`OAuth error: ${error}`);
        }

        if (!code) {
          throw new Error('No authorization code received from Google');
        }

        const flow = getFlowConfig(state);

        const userId = await resolveUserId();

        // Exchange code for token via backend
        const response = await fetch(flow.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            code,
            redirect_uri: `${window.location.origin}/oauth/callback`,
            userId,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || `Failed to exchange token: ${response.status}`);
        }

        const data = await response.json().catch(() => ({}));

        if (!isActive) return;

        const connectedLabel = data.email || data.accountEmail || 'Google account';

        showToast({
          type: 'success',
          title: flow.title,
          message: `Successfully connected: ${connectedLabel}`,
        });

        // Redirect back to the relevant integration surface with a small delay to ensure metadata is updated
        setTimeout(() => {
          navigate(flow.redirectTo, { replace: true });
        }, 1000);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to process OAuth callback';
        console.error('OAuth callback error:', err);
        if (!isActive) return;
        setError(message);
        const flowState = searchParams.get('state');
        let fallbackTitle = 'OAuth Connection Failed';
        let fallbackTarget = '/dashboard';
        try {
          const flow = getFlowConfig(flowState);
          fallbackTitle = flow.errorTitle;
          fallbackTarget = flow.redirectTo;
        } catch {
          // Keep fallback defaults for invalid state values.
        }
        showToast({
          type: 'error',
          title: fallbackTitle,
          message,
        });

        // Redirect after showing error
        setTimeout(() => {
          navigate(fallbackTarget, { replace: true });
        }, 3000);
      } finally {
        if (isActive) {
          setIsProcessing(false);
        }
      }
    };

    processOAuthCallback();
    return () => {
      isActive = false;
    };
  }, [searchParams, navigate, showToast]);

  const loadingLabel = searchParams.get('state') === 'google-drive-connection'
    ? 'Connecting Google Drive...'
    : 'Connecting Gmail...';
  const finalizingLabel = searchParams.get('state') === 'google-drive-connection'
    ? 'Finalizing Google Drive connection...'
    : 'Finalizing Gmail connection...';
  const errorHeading = searchParams.get('state') === 'google-drive-connection'
    ? 'Google Drive Connection Error'
    : 'Gmail Connection Error';

  if (isProcessing) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          backgroundColor: '#FFFFFF',
        }}
      >
        <LogoLoader fullScreen size="lg" showText label={loadingLabel} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          backgroundColor: '#FFFFFF',
          padding: 2,
        }}
      >
          <Card sx={{ maxWidth: 400 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              {errorHeading}
            </Typography>
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
            <Typography variant="body2" sx={{ mt: 2, color: 'text.secondary' }}>
              Redirecting you back...
            </Typography>
          </CardContent>
        </Card>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        backgroundColor: '#FFFFFF',
      }}
      >
      <LogoLoader fullScreen size="lg" showText label={finalizingLabel} />
    </Box>
  );
};
