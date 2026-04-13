import { useState, useEffect, ReactNode, useMemo, useCallback, useRef } from 'react';
import { supabase, supabaseAuthStorageKey } from '../lib/supabase';
import { getCurrentUser, logout as authLogout, type User, getFreshUserData } from '../lib/auth';
import { setSentryUser, clearSentryUser } from '../lib/sentry';
import { clearOfflineCache } from '../lib/offlineDB';
import { AuthContext } from './AuthContext';

const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  // ⚡ PERFORMANCE: Initialize isLoading to false to unblock initial render
  const [isLoading, setIsLoading] = useState(false);

  const lastUserRefreshAtRef = useRef<number>(0);

  // Load the current user, preferring cached data for instant display.
  // Validates and refreshes in background without blocking initial render.
  const loadUser = useCallback(async () => {
    try {
      // ⚡ PERFORMANCE: Check cache FIRST (instant, no network)
      // This allows the UI to render immediately with the user's previous session
      const cachedUser = getCurrentUser();
      
      if (cachedUser) {
        setUser(cachedUser);
        // Set Sentry user context for error tracking
        setSentryUser(cachedUser.id, cachedUser.email, cachedUser.full_name);
        // Continue to validate in background
      } else {
        // No cached user - proceed with validation
        // (falls through to validation logic below)
      }

      // Validate Supabase session and refresh user data in background
      try {
        // Validate there is a usable Supabase session. If refresh fails (e.g. invalid refresh token),
        // we must clear any stale cached state so we don't loop on failing refresh attempts.
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          if (import.meta.env.DEV) console.error('Error reading Supabase session:', sessionError);

          if (/invalid refresh token/i.test(sessionError.message)) {
            try {
              await supabase.auth.signOut({ scope: 'local' });
            } catch {
              // Ignore
            }
          }

          setUser(null);
          clearSentryUser();
          sessionStorage.removeItem('user');
          localStorage.removeItem('user');

          if (supabaseAuthStorageKey) {
            sessionStorage.removeItem(supabaseAuthStorageKey);
            localStorage.removeItem(supabaseAuthStorageKey);
          }
          setIsLoading(false);
          return;
        }

        if (!sessionData.session) {
          setUser(null);
          clearSentryUser();
          sessionStorage.removeItem('user');
          localStorage.removeItem('user');

          if (supabaseAuthStorageKey) {
            sessionStorage.removeItem(supabaseAuthStorageKey);
            localStorage.removeItem(supabaseAuthStorageKey);
          }
          setIsLoading(false);
          return;
        }

        // Try to get fresh user profile from the database (background refresh)
        const freshUser = await getFreshUserData();
        if (freshUser) {
          setUser(freshUser);
          // Set Sentry user context for error tracking
          setSentryUser(freshUser.id, freshUser.email, freshUser.full_name);
          setIsLoading(false);
          return;
        }

        // As a final check, see if Supabase still has an auth user; if not, clear stale state.
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) {
          setUser(null);
          clearSentryUser();
          sessionStorage.removeItem('user');
          localStorage.removeItem('user');

          if (supabaseAuthStorageKey) {
            sessionStorage.removeItem(supabaseAuthStorageKey);
            localStorage.removeItem(supabaseAuthStorageKey);
          }
          setIsLoading(false);
          return;
        }

        // Construct a minimal user shape from the auth user if the profile row is not yet available.
        const minimalUser: User = {
          id: authUser.id,
          email: authUser.email || '',
          full_name: authUser.user_metadata?.full_name || '',
          role: 'user',
          status: 'pending_verification',
          email_verified: authUser.email_confirmed_at ? true : false,
          origin_ip: null,
        };
        setUser(minimalUser);
        // Set Sentry user context for error tracking
        setSentryUser(minimalUser.id, minimalUser.email, minimalUser.full_name);
        setIsLoading(false);
      } catch (validationError) {
        if (import.meta.env.DEV) console.error('Error validating session:', validationError);
        setIsLoading(false);
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error loading authenticated user:', error);
      setUser(null);
      clearSentryUser();
      sessionStorage.removeItem('user');
      localStorage.removeItem('user');

      if (supabaseAuthStorageKey) {
        sessionStorage.removeItem(supabaseAuthStorageKey);
        localStorage.removeItem(supabaseAuthStorageKey);
      }
      setIsLoading(false);
    }
  }, []);

  /**
   * Refresh user data from database (use when role/status changes by admin)
   */
  const refreshUserData = useCallback(async () => {
    lastUserRefreshAtRef.current = Date.now();
    const freshUser = await getFreshUserData();
    if (freshUser) {
      setUser((prev) => {
        if (!prev) return freshUser;
        const isSameUser =
          prev.id === freshUser.id &&
          prev.email === freshUser.email &&
          prev.full_name === freshUser.full_name &&
          prev.role === freshUser.role &&
          prev.status === freshUser.status &&
          prev.email_verified === freshUser.email_verified &&
          prev.origin_ip === freshUser.origin_ip;

        return isSameUser ? prev : freshUser;
      });
    }
  }, []);

  useEffect(() => {
    // Load user data in background (non-blocking)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadUser();

    // Listen for Supabase auth changes so UI stays in sync with session events.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event: string) => {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          // User signed in or session refreshed
          void loadUser();
        } else if (event === 'USER_UPDATED') {
          void loadUser();
        } else if (event === 'SIGNED_OUT') {
          // User signed out
          setUser(null);
          clearSentryUser();
          sessionStorage.removeItem('user');
          localStorage.removeItem('user');
          // Clear offline cache on sign out
          void clearOfflineCache();
        }
      }
    );

    return () => {
      subscription?.unsubscribe();
    };
  }, [loadUser]);

  // Refresh the user when the app becomes active again (cheap, event-driven alternative to polling)
  useEffect(() => {
    const maybeRefresh = () => {
      if (!user) return;
      const now = Date.now();
      // Avoid spamming refreshes during quick tab switches
      if (now - lastUserRefreshAtRef.current < 60_000) return;
      void refreshUserData();
    };

    const handleFocus = () => maybeRefresh();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        maybeRefresh();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [user, refreshUserData]);

  // Subscribe to profile changes (role/status updates) instead of polling every 30s
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`user-profile:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'users',
          filter: `id=eq.${user.id}`,
        },
        () => {
          void refreshUserData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, refreshUserData]);

  const logout = useCallback(async () => {
    await authLogout();
    setUser(null);
    clearSentryUser();
    // Clear offline cache on logout
    await clearOfflineCache();
  }, []);

  const refreshUser = useCallback(() => {
    loadUser();
  }, [loadUser]);

  const isAdmin = user?.role === 'admin';
  const isMarketing = user?.role === 'marketing' || user?.role === 'admin';

  // Memoize context value to prevent unnecessary re-renders of consumers
  const contextValue = useMemo(
    () => ({ user, isLoading, isAdmin, isMarketing, logout, refreshUser, refreshUserData }),
    [user, isLoading, isAdmin, isMarketing, logout, refreshUser, refreshUserData]
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export { AuthProvider };
