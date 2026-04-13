/**
 * Gmail Integration Exports
 * Central hub for all Gmail-related utilities and components
 */

// API Functions
export {
  getRequirementEmails,
  getEmailsByRequirements,
  createEmailRecord,
  getGmailSyncStatus,
  triggerManualSync,
  getEmailSyncLogs,
  getUnconfirmedEmailMatches,
  confirmEmailMatch,
  updateEmailStatus,
  getRequirementEmailStats,
  deleteEmailRecord,
} from './api/requirementEmails';

// Gmail Integration
export {
  getGmailAuthUrl,
} from './api/gmailIntegration';

// Matching Algorithm
export {
  extractKeywords,
  stringSimilarity,
  findKeywordMatches,
  calculateMatchConfidence,
  findBestMatch,
  matchEmailToRequirement,
  shouldAutoLink,
} from './gmailMatcher';

export type { MatchResult, EmailContent, RequirementData } from './gmailMatcher';
