/**
 * Have I Been Pwned (HIBP) Password Checker
 * Uses k-Anonymity for privacy-preserving password validation
 */

interface HibpResponse {
  leaked: boolean;
  count?: number;
}

export interface HibpCheckResult {
  isSecure: boolean;
  leakCount?: number;
  error?: string;
}

/**
 * Check if a password has been leaked using HIBP k-Anonymity API
 * Only checks if password matches known breaches
 * Password is NOT sent in plaintext to HIBP (k-Anonymity protects privacy)
 *
 * @param password - The password to check
 * @returns {HibpCheckResult} - Whether password is secure and leak count if found
 */
export const checkPasswordWithHibp = async (
  password: string
): Promise<HibpCheckResult> => {
  try {
    // Validate input
    if (!password || password.length === 0) {
      return {
        isSecure: false,
        error: 'Password is required',
      };
    }

    const functionUrl = import.meta.env.VITE_HIBP_FUNCTION_URL?.trim();
    if (!functionUrl) {
      // Skip HIBP check if not configured - allow signup but don't check breaches
      return {
        isSecure: true,
        error: undefined,
      };
    }

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password }),
    });

    // Handle HTTP errors
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        isSecure: true, // Default to allow on error (fail-open for UX)
        error: errorData.error || `HIBP check failed with status ${response.status}`,
      };
    }

    // Parse response
    const data: HibpResponse = await response.json();

    return {
      isSecure: !data.leaked,
      leakCount: data.count,
      error: undefined,
    };
  } catch (err) {
    console.error('Error checking password with HIBP:', err);
    return {
      isSecure: true, // Fail-open: allow on network error
      error: 'Unable to verify password security. Please try again.',
    };
  }
};

/**
 * Get human-readable message about password breach
 */
export const getHibpMessage = (result: HibpCheckResult): string => {
  if (result.error) {
    return result.error;
  }

  if (!result.isSecure && result.leakCount) {
    return `⚠️ This password was found in ${result.leakCount.toLocaleString()} data breaches. Please choose a different password.`;
  }

  if (!result.isSecure) {
    return '⚠️ This password has been compromised. Please choose a different password.';
  }

  return '✓ This password appears to be secure.';
};
