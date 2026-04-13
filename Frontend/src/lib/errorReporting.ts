import { supabase } from './supabase';
import { captureException, captureMessage } from './sentry';

// Simple client-side rate limiting so a single bug cannot spam the error_reports table.
const ERROR_RATE_LIMIT = 10; // max errors per window per tab
const ERROR_WINDOW_MS = 60_000; // 1 minute
const errorTimestamps: number[] = [];

export const reportError = async (
  error: Error,
  userId?: string
): Promise<void> => {
  try {
    const now = Date.now();
    // Keep only timestamps within the current window
    const recent = errorTimestamps.filter((ts) => now - ts < ERROR_WINDOW_MS);
    recent.push(now);
    errorTimestamps.length = 0;
    errorTimestamps.push(...recent);

    if (recent.length > ERROR_RATE_LIMIT) {
      // Too many errors in a short time; log locally but skip remote insert.
      if (import.meta.env.DEV) console.warn('Error reporting throttled to protect backend');
      return;
    }

    // Report to Sentry for production error tracking
    captureException(error, {
      userId,
      location: window.location.href,
    });

    // Also report to local database for historical tracking
    await supabase.from('error_reports').insert({
      user_id: userId || null,
      error_message: error.message,
      error_stack: error.stack || null,
      error_type: error.name,
      url: window.location.href,
      user_agent: navigator.userAgent,
      status: 'new',
    });
  } catch (reportingError) {
    if (import.meta.env.DEV) console.error('Failed to report error:', reportingError);
  }
};

export const setupGlobalErrorHandler = (userId?: string): void => {
  window.addEventListener('error', (event) => {
    reportError(
      new Error(event.message),
      userId
    );
  });

  window.addEventListener('unhandledrejection', (event) => {
    reportError(
      new Error(event.reason?.message || 'Unhandled promise rejection'),
      userId
    );
  });

  // Capture unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    captureMessage(
      `Unhandled Promise Rejection: ${event.reason?.message || JSON.stringify(event.reason)}`,
      'error'
    );
  });
};

/**
 * Manual error logging utility for use in try-catch blocks
 * Reports to both Sentry and local database
 */
export const logError = async (
  error: Error | string,
  context?: Record<string, unknown>
): Promise<void> => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  try {
    // Report to Sentry
    if (error instanceof Error) {
      captureException(error, context);
    } else {
      captureMessage(errorMessage, 'error');
    }

    // Log to local database
    await supabase.from('error_reports').insert({
      error_message: errorMessage,
      error_stack: errorStack || null,
      error_type: error instanceof Error ? error.name : 'String',
      url: window.location.href,
      user_agent: navigator.userAgent,
      status: 'new',
    });
  } catch (reportingError) {
    if (import.meta.env.DEV) console.error('Failed to log error:', reportingError);
  }
};

