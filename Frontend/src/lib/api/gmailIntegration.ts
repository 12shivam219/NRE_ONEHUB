/**
 * Gmail OAuth and API utilities
 * Handles authentication, token management, and API communication
 * 
 * SECURITY NOTE: Client secret is handled server-side only.
 * Never expose GOOGLE_CLIENT_SECRET to frontend.
 */

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
// Client secret is handled by backend only - see api/gmailIntegration backend proxy
const GOOGLE_REDIRECT_URI = import.meta.env.VITE_GOOGLE_REDIRECT_URI || `${window.location.origin}/oauth/callback`;

/**
 * Generate OAuth authorization URL
 */
function getGmailAuthUrl(state: string = 'gmail-connection'): string {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/gmail.readonly',
    access_type: 'offline',
    prompt: 'consent', // Force consent screen to get refresh token
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export {
  getGmailAuthUrl,
};
