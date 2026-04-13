/**
 * Application Constants
 * Centralized definitions for enums, status values, and other constants
 */

// Requirement Status
export const REQUIREMENT_STATUS = {
  NEW: 'NEW',
  IN_PROGRESS: 'IN_PROGRESS',
  SUBMITTED: 'SUBMITTED',
  INTERVIEW: 'INTERVIEW',
  OFFER: 'OFFER',
  REJECTED: 'REJECTED',
  CLOSED: 'CLOSED',
} as const;

export const REQUIREMENT_STATUS_LABELS: Record<string, string> = {
  NEW: 'New',
  IN_PROGRESS: 'In Progress',
  SUBMITTED: 'Submitted',
  INTERVIEW: 'Interview',
  OFFER: 'Offer',
  REJECTED: 'Rejected',
  CLOSED: 'Closed',
};

// Interview Status
export const INTERVIEW_STATUS = {
  CONFIRMED: 'Confirmed',
  PENDING: 'Pending',
  SCHEDULED: 'Scheduled',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  RE_SCHEDULED: 'Re-Scheduled',
} as const;

// Interview Status Colors
export const INTERVIEW_STATUS_COLORS: Record<string, { badge: string; dot: string }> = {
  'Confirmed': { badge: 'bg-green-50 text-green-700 border-green-200', dot: 'bg-green-500' },
  'Pending': { badge: 'bg-yellow-50 text-yellow-700 border-yellow-200', dot: 'bg-yellow-500' },
  'Scheduled': { badge: 'bg-primary-50 text-primary-800 border-primary-200', dot: 'bg-primary-500' },
  'Completed': { badge: 'bg-purple-50 text-purple-700 border-purple-200', dot: 'bg-purple-500' },
  'Cancelled': { badge: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500' },
  'Re-Scheduled': { badge: 'bg-orange-50 text-orange-700 border-orange-200', dot: 'bg-orange-500' },
};

// Pagination
export const ITEMS_PER_PAGE = 12;
export const REQUIREMENTS_DISPLAY_COUNT = 20;

// API Configuration
export const API_CONFIG = {
  DEBOUNCE_DELAY: 300,
  FILTER_SAVE_DELAY: 100,
  RETRY_ATTEMPTS: 2,
  RETRY_DELAY: 100,
} as const;

// Validation
export const VALIDATION_RULES = {
  MIN_AGE: 18,
  MAX_AGE: 120,
  MIN_PHONE_LENGTH: 10,
  MAX_PHONE_LENGTH: 15,
  MIN_REQUIREMENT_TITLE_LENGTH: 3,
  MAX_REQUIREMENT_TITLE_LENGTH: 255,
} as const;

// Cache Configuration
export const CACHE_CONFIG = {
  USER_CACHE_TTL: 3600000, // 1 hour in ms
  REQUIREMENTS_CACHE_TTL: 600000, // 10 minutes in ms
} as const;

// Safe Protocols for URLs
export const SAFE_PROTOCOLS = ['http:', 'https:'] as const;

// User Roles
export const USER_ROLES = {
  ADMIN: 'admin',
  USER: 'user',
  GUEST: 'guest',
} as const;
