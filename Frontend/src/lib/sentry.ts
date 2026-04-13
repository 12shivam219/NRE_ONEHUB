/**
 * Sentry Configuration for Error Tracking and Performance Monitoring
 * Integrates with Sentry for production error monitoring, crash reporting, and performance insights
 */

// Lazy-load Sentry to avoid heavy module resolution at dev startup
 
let Sentry: any = null;
let SentryLoaded = false;

const loadSentry = async () => {
  if (SentryLoaded) return Sentry;
  try {
    Sentry = await import('@sentry/react');
    SentryLoaded = true;
    return Sentry;
  } catch {
    // If import fails, keep functions as no-ops
    Sentry = null;
    SentryLoaded = false;
    return null;
  }
};
/**
 * Initialize Sentry for production error tracking
 * Call this as early as possible in your application
 */
export const initSentry = () => {
  const sentryDsn = import.meta.env.VITE_SENTRY_DSN;

  // Only initialize if DSN is provided (production environments)
  if (!sentryDsn) {
    if (import.meta.env.DEV) {
      console.info('Sentry DSN not configured. Error tracking disabled.');
    }
    return;
  }

  // Initialize Sentry asynchronously so initSentry doesn't block startup
  void (async () => {
    const S = await loadSentry();
    if (!S) return;

    S.init({
      dsn: sentryDsn,
      environment: import.meta.env.MODE,
      integrations: [
        new S.Replay({
          maskAllText: true,
          blockAllMedia: true,
        }),
      ],
      tracesSampleRate: import.meta.env.PROD ? 0.1 : 0.01,
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
      release: import.meta.env.VITE_APP_VERSION || '0.0.0',
      ignoreErrors: [
        'top.GLOBALS',
        'originalCreateNotification',
        'canvas.contentDocument',
        'MyApp_RemoveAllHighlights',
        'Can\'t find variable: ZiteReader',
        'jigsaw is not defined',
        'ComboSearch is not defined',
        'NetworkError',
        'Network request failed',
      ],
      denyUrls: [/extensions\//i, /^chrome:\/\//i, /^moz-extension:\/\//i],
    });
  })();
};

/**
 * Capture exception and report to Sentry
 * Use this for error handling in try-catch blocks
 */
export const captureException = (error: Error | string, context?: Record<string, unknown>) => {
  // Fire-and-forget dynamic import to avoid blocking callers
  void (async () => {
    const S = await loadSentry();
    if (!S) return;
    S.captureException(error, { contexts: context ? { custom: context } : undefined });
  })();
};

/**
 * Capture message for non-error situations
 * Useful for tracking important events
 */
export const captureMessage = (message: string, level: 'fatal' | 'error' | 'warning' | 'info' | 'debug' = 'info') => {
  void (async () => {
    const S = await loadSentry();
    if (!S) return;
    S.captureMessage(message, level);
  })();
};

/**
 * Set user context in Sentry
 * Call this after user authentication to track which users are affected by errors
 */
export const setSentryUser = (userId: string, email?: string, username?: string) => {
  void (async () => {
    const S = await loadSentry();
    if (!S) return;
    S.setUser({ id: userId, email, username });
  })();
};

/**
 * Clear user context (on logout)
 */
export const clearSentryUser = () => {
  void (async () => {
    const S = await loadSentry();
    if (!S) return;
    S.setUser(null);
  })();
};

/**
 * Add custom context for better error diagnosis
 */
export const addSentryContext = (name: string, data: Record<string, unknown>) => {
  void (async () => {
    const S = await loadSentry();
    if (!S) return;
    S.setContext(name, data);
  })();
};

/**
 * Create a transaction for performance monitoring
 */
export const startSentryTransaction = (name: string, op: string = 'http.request') => {
  // Start a transaction if Sentry is loaded; returns undefined otherwise
  // This helper returns a Promise resolving to the transaction or undefined
  return (async () => {
    const S = await loadSentry();
    if (!S) return undefined;
    const transaction = S.startTransaction({ name, op });
    return transaction;
  })();
};

