/**
 * Centralized Error Handler
 * Provides consistent error handling, logging, and recovery strategies
 */

export type ErrorLevel = 'debug' | 'info' | 'warn' | 'error' | 'critical';

export interface ErrorContext {
  component?: string;
  action?: string;
  userId?: string;
  resource?: string;
  timestamp?: string;
  details?: Record<string, unknown>;
  [key: string]: unknown; // Allow flexible properties
}

export class AppError extends Error {
  constructor(
    public message: string,
    public code: string,
    public level: ErrorLevel = 'error',
    public context?: ErrorContext,
    public originalError?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      level: this.level,
      context: this.context,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Centralized logger with environment-aware output
 */
export const logger = {
  debug: (message: string, context?: ErrorContext) => {
    if (import.meta.env.MODE === 'development') {
      console.debug(`[DEBUG] ${message}`, context);
    }
  },

  info: (message: string, context?: ErrorContext) => {
    if (import.meta.env.MODE === 'development') {
      console.info(`[INFO] ${message}`, context);
    }
  },

  warn: (message: string, context?: ErrorContext) => {
    console.warn(`[WARN] ${message}`, context);
  },

  error: (message: string, context?: ErrorContext) => {
    console.error(`[ERROR] ${message}`, context);
  },

  critical: (message: string, context?: ErrorContext) => {
    console.error(`[CRITICAL] ${message}`, context);
  },
};

/**
 * Exponential backoff retry logic
 */
export interface RetryConfig {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  onRetry?: (attempt: number, error: unknown) => void;
}

const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  maxAttempts: 3,
  initialDelayMs: 100,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
  onRetry: () => {}, // no-op by default
};

/**
 * Retry a function with exponential backoff
 * @example
 * const data = await retryAsync(() => fetchData(id), {
 *   maxAttempts: 3,
 *   initialDelayMs: 100,
 *   onRetry: (attempt, error) => console.log(`Attempt ${attempt} failed:`, error)
 * });
 */
export async function retryAsync<T>(
  fn: () => Promise<T>,
  config?: RetryConfig
): Promise<T> {
  const cfg = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: unknown;

  for (let attempt = 1; attempt <= cfg.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < cfg.maxAttempts) {
        const delay = Math.min(
          cfg.initialDelayMs * Math.pow(cfg.backoffMultiplier, attempt - 1),
          cfg.maxDelayMs
        );
        cfg.onRetry(attempt, error);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/**
 * Retry a synchronous function
 */
export function retrySync<T>(
  fn: () => T,
  config?: RetryConfig
): T {
  const cfg = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: unknown;

  for (let attempt = 1; attempt <= cfg.maxAttempts; attempt++) {
    try {
      return fn();
    } catch (error) {
      lastError = error;
      if (attempt < cfg.maxAttempts) {
        const delay = Math.min(
          cfg.initialDelayMs * Math.pow(cfg.backoffMultiplier, attempt - 1),
          cfg.maxDelayMs
        );
        cfg.onRetry(attempt, error);
        // Synchronous sleep using busy-wait (not ideal, but works for sync code)
        const startTime = Date.now();
        while (Date.now() - startTime < delay) {
          // busy wait
        }
      }
    }
  }

  throw lastError;
}

/**
 * Handle API errors consistently
 */
export function handleApiError(
  error: unknown,
  context?: ErrorContext
): AppError {
  // Handle Supabase errors
  if (error && typeof error === 'object' && 'message' in error && 'code' in error) {
    const supabaseError = error as { message: string; code: string };
    
    // Determine error level based on status code
    let level: ErrorLevel = 'error';
    let code = supabaseError.code;
    let message = supabaseError.message;

    // Map common Supabase errors
    switch (supabaseError.code) {
      case 'PGRST116':
        code = 'NOT_FOUND';
        message = 'Resource not found';
        break;
      case 'PGRST301':
        code = 'FORBIDDEN';
        message = 'Access denied';
        level = 'warn';
        break;
      case 'AUTH_INVALID_CREDENTIALS':
        code = 'INVALID_CREDENTIALS';
        message = 'Invalid email or password';
        level = 'warn';
        break;
      case 'AUTH_USER_ALREADY_EXISTS':
        code = 'USER_EXISTS';
        message = 'User already exists';
        level = 'warn';
        break;
    }

    const appError = new AppError(message, code, level, context, error);
    // Log based on level
    if (level === 'warn') {
      logger.warn(`API Error: ${code}`, context);
    } else {
      logger.error(`API Error: ${code}`, { ...context, code, message });
    }
    return appError;
  }

  // Handle network errors
  if (error instanceof TypeError && error.message.includes('fetch')) {
    const appError = new AppError(
      'Network error - please check your connection',
      'NETWORK_ERROR',
      'error',
      context,
      error
    );
    logger.error('Network error', { ...context, originalError: error.message });
    return appError;
  }

  // Handle timeout errors
  if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') {
    const appError = new AppError(
      'Request timeout - please try again',
      'TIMEOUT',
      'warn',
      context,
      error
    );
    logger.warn('Request timeout', context);
    return appError;
  }

  // Generic error handling
  const message = error instanceof Error ? error.message : String(error);
  const appError = new AppError(
    message || 'An unexpected error occurred',
    'UNKNOWN_ERROR',
    'error',
    context,
    error
  );
  logger.error('Unexpected error', { ...context, originalError: message });
  return appError;
}

/**
 * Safe JSON parse with error handling
 */
export function safeJsonParse<T>(
  json: string,
  fallback: T,
  context?: ErrorContext
): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    logger.warn('JSON parse failed', { ...context, json: json.slice(0, 100) });
    return fallback;
  }
}

/**
 * Safe JSON stringify with error handling
 */
export function safeJsonStringify(
  obj: unknown,
  context?: ErrorContext
): string {
  try {
    return JSON.stringify(obj);
  } catch {
    logger.warn('JSON stringify failed', context);
    return '{}';
  }
}

/**
 * Handle async function with automatic error handling
 */
export async function handleAsync<T>(
  fn: () => Promise<T>,
  context?: ErrorContext
): Promise<[T | null, AppError | null]> {
  try {
    const result = await fn();
    return [result, null];
  } catch (error) {
    const appError = handleApiError(error, context);
    return [null, appError];
  }
}

/**
 * Create API response with consistent error handling
 */
export function createApiResponse<T>(
  success: boolean,
  data?: T,
  error?: string | AppError
) {
  return {
    success,
    data: success ? data : undefined,
    error: error instanceof AppError ? error.message : error,
    errorCode: error instanceof AppError ? error.code : undefined,
  };
}
