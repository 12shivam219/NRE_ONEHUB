export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
};

export const formatDate = (date: string | Date): string => {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

export const formatDateTime = (date: string | Date): string => {
  const d = new Date(date);
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const sanitizeFilename = (filename: string): string => {
  return sanitizePathComponent(filename);
};

/**
 * Sanitize a path component used with Supabase storage to prevent path traversal.
 * - Removes forward/back slashes
 * - Replaces sequences of dots with a single dot and strips leading dots
 * - Replaces any remaining disallowed chars with `_`
 * - Truncates to 200 chars
 */
export function sanitizePathComponent(input: string): string {
  if (!input || typeof input !== 'string') return '';

  // Remove slashes to prevent directory separators
  let s = input.replace(/[\\/]/g, '_');

  // Replace runs of two or more dots with a single dot, then strip leading dots
  s = s.replace(/\.{2,}/g, '.').replace(/^\.+/, '');

  // Keep only safe characters
  s = s.replace(/[^a-zA-Z0-9._-]/g, '_');

  return s.slice(0, 200);
}

export const isSafeStoragePath = (path: string): boolean => {
  if (!path || typeof path !== 'string') return false;
  if (path.includes('..')) return false;
  if (path.includes('\\')) return false;
  if (path.startsWith('/')) return false;
  return true;
};

/**
 * Sanitize text input to prevent XSS
 * Removes or escapes potentially dangerous characters while preserving legitimate content
 */
export const sanitizeText = (text: string): string => {
  if (!text || typeof text !== 'string') return '';
  
  // Remove any HTML tags and entities
  return text
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim();
};

export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

// Note: Email validation moved to emailParser.ts (isValidEmail)
// Use: import { isValidEmail } from './emailParser'

export const generateId = (): string => {
  return crypto.randomUUID();
};

export const debounce = <T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };

    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

export const classNames = (...classes: (string | boolean | undefined)[]): string => {
  return classes.filter(Boolean).join(' ');
};

/**
 * Utility function to merge class names (similar to clsx)
 * Handles conditional classes and arrays
 */
export const cn = (...classes: (string | boolean | undefined | null | Record<string, boolean>)[]): string => {
  return classes
    .filter(Boolean)
    .map((cls) => {
      if (typeof cls === 'string') return cls;
      if (typeof cls === 'object' && cls !== null) {
        return Object.entries(cls)
          .filter(([, value]) => value)
          .map(([key]) => key)
          .join(' ');
      }
      return '';
    })
    .filter(Boolean)
    .join(' ');
};