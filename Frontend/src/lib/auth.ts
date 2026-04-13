import { supabase, supabaseAuthStorageKey } from './supabase';
import type { UserRole, UserStatus } from './database.types';

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  status: UserStatus;
  email_verified: boolean;
  origin_ip: string | null;
}

export interface AuthResponse {
  success: boolean;
  user?: User;
  error?: string;
  requiresVerification?: boolean;
}

const parseUserAgent = (userAgent: string) => {
  const ua = userAgent.toLowerCase();

  let browser = 'Unknown';
  if (ua.includes('firefox')) browser = 'Firefox';
  else if (ua.includes('chrome')) browser = 'Chrome';
  else if (ua.includes('safari')) browser = 'Safari';
  else if (ua.includes('edge')) browser = 'Edge';

  let os = 'Unknown';
  if (ua.includes('windows')) os = 'Windows';
  else if (ua.includes('mac')) os = 'macOS';
  else if (ua.includes('linux')) os = 'Linux';
  else if (ua.includes('android')) os = 'Android';
  else if (ua.includes('ios') || ua.includes('iphone')) os = 'iOS';

  let device = 'Desktop';
  if (ua.includes('mobile')) device = 'Mobile';
  else if (ua.includes('tablet')) device = 'Tablet';

  return { browser, os, device };
};

const getClientInfo = () => {
  const userAgent = navigator.userAgent;
  const { browser, os, device } = parseUserAgent(userAgent);
  return { userAgent, browser, os, device };
};

type LogAuthEventPayload =
  | { event: 'register'; userId: string }
  | { event: 'login_success'; userId: string; clientInfo: ReturnType<typeof getClientInfo> }
  | {
      event: 'login_failure';
      userId?: string | null;
      email?: string;
      clientInfo: ReturnType<typeof getClientInfo>;
      reason: string;
    };

interface LogAuthEventResponse {
  success?: boolean;
  ip?: string;
}

const logAuthEvent = async (payload: LogAuthEventPayload): Promise<LogAuthEventResponse | null> => {
  try {
    const { data, error } = await supabase.functions.invoke('log-auth-event', {
      body: payload,
    });

    if (error) {
      if (import.meta.env.DEV) console.error('Edge function log-auth-event error:', error);
      return null;
    }

    return (data ?? null) as LogAuthEventResponse | null;
  } catch (error) {
    if (import.meta.env.DEV) console.error('Edge function log-auth-event exception:', error);
    return null;
  }
};

/**
 * Register a new user using Supabase Auth (server-side password hashing)
 * Password is hashed securely by Supabase with bcrypt + salt
 */
export const register = async (
  email: string,
  password: string,
  fullName: string
): Promise<AuthResponse> => {
  try {
    // Trim and validate inputs
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();
    const trimmedFullName = fullName.trim();

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      return { success: false, error: 'Invalid email format' };
    }

    // Validate full name is not empty
    if (!trimmedFullName) {
      return { success: false, error: 'Full name is required' };
    }

    // Validate password meets minimum requirements
    if (trimmedPassword.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters' };
    }

    // Validate password has mixed character types (recommended by Supabase)
    const hasUpperCase = /[A-Z]/.test(trimmedPassword);
    const hasLowerCase = /[a-z]/.test(trimmedPassword);
    const hasNumbers = /\d/.test(trimmedPassword);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(trimmedPassword);

    // At least 2 character types (common requirement)
    const charTypeCount = [hasUpperCase, hasLowerCase, hasNumbers, hasSpecialChar].filter(Boolean).length;
    if (charTypeCount < 2) {
      return { success: false, error: 'Password must contain at least 2 different character types (letters, numbers, symbols)' };
    }

    // Sign up with Supabase Auth (handles password hashing securely server-side)
    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email: trimmedEmail,
      password: trimmedPassword,
      options: {
        data: {
          full_name: trimmedFullName,
        },
      },
    });

    if (signUpError) {
      return { success: false, error: signUpError.message };
    }

    if (!authData.user) {
      return { success: false, error: 'User creation failed' };
    }

    // Create user profile in public users table
    const { data: user, error: profileError } = await supabase
      .from('users')
      .insert({
        id: authData.user.id,
        email,
        full_name: fullName,
        role: 'user',
        status: 'pending_verification',
        email_verified: false,
      })
      .select()
      .single();

    if (profileError) {
      if (import.meta.env.DEV) console.error('Profile creation error:', profileError);
      return { success: false, error: 'Failed to create user profile' };
    }

    const logResult = await logAuthEvent({
      event: 'register',
      userId: authData.user.id,
    });

    const originIp = logResult?.ip ?? user.origin_ip ?? null;

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        status: user.status,
        email_verified: user.email_verified,
        origin_ip: originIp,
      },
      requiresVerification: true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Registration failed';
    return { success: false, error: errorMessage };
  }
};

/**
 * Login user with Supabase Auth (server-side password verification)
 * Password verification is handled securely by Supabase
 */
export const login = async (
  email: string,
  password: string
): Promise<AuthResponse> => {
  try {
    // Trim and validate inputs
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      return { success: false, error: 'Invalid email format' };
    }

    // Validate password is not empty
    if (!trimmedPassword) {
      return { success: false, error: 'Password is required' };
    }

    // Validate password meets minimum requirements (Supabase minimum is 6 characters)
    if (trimmedPassword.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters' };
    }

    const clientInfo = getClientInfo();

    // Authenticate with Supabase Auth (server-side password verification with bcrypt)
    const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password: trimmedPassword,
    });

    if (signInError) {
      if (import.meta.env.DEV) console.error('Supabase Auth Error:', signInError);
      // Log failed login attempt
      await logFailedLogin({ email, clientInfo, reason: signInError.message || 'Invalid credentials' });
      return { success: false, error: signInError.message || 'Invalid credentials' };
    }

    if (!authData.user) {
      await logFailedLogin({ email, clientInfo, reason: 'Authentication failed' });
      return { success: false, error: 'Authentication failed' };
    }

    // Get user profile (silently fail and continue if not found)
    let user = null;
    try {
      const { data: userData, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('id', authData.user.id)
        .maybeSingle();

      if (!profileError && userData) {
        user = userData;
      }
    } catch {
      // Continue even if user profile lookup fails
    }

    // Check account status only if user profile exists
    if (user && user.status && user.status !== 'approved' && user.status !== 'pending_verification') {
      await logFailedLogin({ userId: authData.user.id, clientInfo, reason: `Account ${user.status}` });
      return {
        success: false,
        error: `Account ${user.status.replace('_', ' ')}`
      };
    }

    const loginLogResult = await logAuthEvent({
      event: 'login_success',
      userId: authData.user.id,
      clientInfo,
    });

    const resolvedOriginIp = loginLogResult?.ip ?? user?.origin_ip ?? null;

    // Store user data in sessionStorage (cleared when tab closes)
    // SECURITY: Use sessionStorage instead of localStorage to prevent persistent token storage
    // Supabase session is managed automatically via secure cookies
    const userData = user || {
      id: authData.user.id,
      email: authData.user.email || '',
      full_name: authData.user.user_metadata?.full_name || '',
      role: 'user',
      status: 'pending_verification',
      email_verified: authData.user.email_confirmed_at ? true : false,
      origin_ip: resolvedOriginIp,
    };

    // Store ONLY non-sensitive user info in sessionStorage
    sessionStorage.setItem('user', JSON.stringify({
      id: userData.id,
      email: userData.email,
      full_name: userData.full_name,
      role: userData.role,
      status: userData.status,
      email_verified: userData.email_verified,
      // Don't store IP in session storage
    }));

    return {
      success: true,
      user: {
        id: userData.id,
        email: userData.email,
        full_name: userData.full_name,
        role: userData.role,
        status: userData.status,
        email_verified: userData.email_verified,
        origin_ip: userData.origin_ip,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Login failed';
    return { success: false, error: errorMessage };
  }
};

const logFailedLogin = async ({
  userId,
  email,
  clientInfo,
  reason,
}: {
  userId?: string | null;
  email?: string;
  clientInfo: ReturnType<typeof getClientInfo>;
  reason: string;
}): Promise<void> => {
  await logAuthEvent({
    event: 'login_failure',
    userId,
    email,
    clientInfo,
    reason,
  });
};

export const logout = async (): Promise<void> => {
  try {
    // Sign out from Supabase (clears session)
    await supabase.auth.signOut();
  } catch {
    // Continue with local cleanup even if Supabase signout fails
  }

  // Clear both sessionStorage and localStorage (for fallback compatibility)
  sessionStorage.removeItem('user');
  localStorage.removeItem('user');

  if (supabaseAuthStorageKey) {
    sessionStorage.removeItem(supabaseAuthStorageKey);
    localStorage.removeItem(supabaseAuthStorageKey);
  }
};

export const getCurrentUser = (): User | null => {
  // SECURITY: Read from sessionStorage (cleared when tab closes)
  const userStr = sessionStorage.getItem('user');
  if (!userStr) return null;

  try {
    return JSON.parse(userStr);
  } catch {
    return null;
  }
};

/**
 * Fetch fresh user data from database (bypasses cache)
 * Use this to get updated role/status after admin changes
 */
export const getFreshUserData = async (): Promise<User | null> => {
  try {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return null;

    // Fetch user profile from database
    const { data: userData, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', authUser.id)
      .single();

    if (error || !userData) {
      if (import.meta.env.DEV) console.error('Error fetching fresh user data:', error);
      return null;
    }

    // Update sessionStorage with fresh data
    const user: User = {
      id: userData.id,
      email: userData.email,
      full_name: userData.full_name,
      role: userData.role,
      status: userData.status,
      email_verified: userData.email_verified,
      origin_ip: userData.origin_ip,
    };

    sessionStorage.setItem('user', JSON.stringify(user));
    return user;
  } catch (error) {
    if (import.meta.env.DEV) console.error('Exception fetching fresh user data:', error);
    return null;
  }
};

export const isAuthenticated = (): boolean => {
  return !!sessionStorage.getItem('user');
};

/**
 * Get the current Supabase session
 * Useful for getting access tokens for API calls
 */
export const getCurrentSession = async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
  } catch {
    return null;
  }
};
