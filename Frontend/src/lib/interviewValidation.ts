/**
 * Interview validation and utility functions
 */

/**
 * Valid interview status values and their workflow transitions
 */
export const INTERVIEW_STATUSES: Record<string, { label: string; color: string; canTransitionTo: string[] }> = {
  'Scheduled': { label: 'Scheduled', color: 'blue', canTransitionTo: ['Confirmed', 'Cancelled', 'Re-Scheduled'] },
  'Confirmed': { label: 'Confirmed', color: 'green', canTransitionTo: ['Completed', 'Cancelled', 'Re-Scheduled', 'No Show'] },
  'Completed': { label: 'Completed', color: 'purple', canTransitionTo: ['Re-Scheduled'] },
  'Cancelled': { label: 'Cancelled', color: 'red', canTransitionTo: ['Scheduled'] },
  'Re-Scheduled': { label: 'Re-Scheduled', color: 'orange', canTransitionTo: ['Confirmed', 'Cancelled', 'Completed', 'No Show'] },
  'Pending': { label: 'Pending', color: 'yellow', canTransitionTo: ['Scheduled', 'Confirmed', 'Cancelled'] },
  'No Show': { label: 'No Show', color: 'red', canTransitionTo: ['Re-Scheduled'] },
};

export type InterviewStatus = keyof typeof INTERVIEW_STATUSES;

/**
 * Get all available statuses
 */
export const getAllInterviewStatuses = (): Array<{ label: string; value: string }> => {
  return Object.entries(INTERVIEW_STATUSES).map(([value, config]) => ({
    label: config.label,
    value: value,
  }));
};

/**
 * Check if a status transition is valid
 */
export const isValidStatusTransition = (fromStatus: string, toStatus: string): boolean => {
  const status = INTERVIEW_STATUSES[fromStatus];
  if (!status) return false;
  return status.canTransitionTo.includes(toStatus);
};

/**
 * Validate date is not in the past
 * BUG FIX: Properly validate date and time are in future, handle edge cases
 */
export const isDateInFuture = (dateString: string, timeString?: string): boolean => {
  // Validate date format YYYY-MM-DD
  const parts = dateString.split('-').map(Number);
  if (parts.length !== 3) return false;
  
  const [year, month, day] = parts;
  
  // Validate month (1-12) and day (1-31) are reasonable
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  
  // Create date at start of day
  const interviewDate = new Date(year, month - 1, day, 0, 0, 0, 0);
  
  // Validate the date is valid (JavaScript normalizes invalid dates)
  if (isNaN(interviewDate.getTime())) return false;
  
  // If time provided, parse and apply it
  if (timeString && timeString.trim()) {
    const timeParts = timeString.split(':').map(Number);
    if (timeParts.length >= 2) {
      const hours = timeParts[0];
      const minutes = timeParts[1];
      
      // Validate hours (0-23) and minutes (0-59)
      if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return false;
      
      interviewDate.setHours(hours, minutes, 0, 0);
    } else {
      // Invalid time format - reject
      return false;
    }
  } else {
    // No time specified - use end of day (23:59:59)
    interviewDate.setHours(23, 59, 59, 0);
  }
  
  // Compare with current date/time
  return interviewDate > new Date();
};

/**
 * Validate if a string is a valid URL
 */
export const isValidUrl = (string: string): boolean => {
  try {
    new URL(string);
    return true;
  } catch {
    return false;
  }
};

/**
 * Validate if a string looks like a meeting link (contains common meeting domain patterns)
 */
export const isMeetingLink = (string: string): boolean => {
  const meetingPatterns = [
    'zoom.us',
    'meet.google.com',
    'teams.microsoft.com',
    'webex.com',
    'bluejeans.com',
    'join.',
    'conference',
    'meeting',
  ];
  
  const lowerString = string.toLowerCase();
  return meetingPatterns.some(pattern => lowerString.includes(pattern));
};

/**
 * Extract domain name from URL
 */
export const extractDomainFromUrl = (urlString: string): string => {
  try {
    const url = new URL(urlString);
    const hostname = url.hostname.replace('www.', '');
    return hostname.charAt(0).toUpperCase() + hostname.slice(1);
  } catch {
    // If not a valid URL, try to extract common meeting service names
    if (isMeetingLink(urlString)) {
      const matches = urlString.match(/zoom|google meet|microsoft teams|webex|bluejeans/i);
      return matches ? matches[0] : 'Meeting Link';
    }
    return 'Location';
  }
};

/**
 * Validate interview form data
 */
export interface InterviewFormValidation {
  isValid: boolean;
  errors: Record<string, string>;
}

export const validateInterviewForm = (formData: {
  requirement_id: string;
  scheduled_date: string;
  scheduled_time?: string;
  interview_with?: string;
}): InterviewFormValidation => {
  const errors: Record<string, string> = {};

  if (!formData.requirement_id) {
    errors.requirement_id = 'Requirement is required';
  }

  if (!formData.scheduled_date) {
    errors.scheduled_date = 'Interview date is required';
  } else if (!isDateInFuture(formData.scheduled_date, formData.scheduled_time)) {
    errors.scheduled_date = 'Interview must be scheduled for a future date and time';
  }

  if (!formData.interview_with?.trim()) {
    errors.interview_with = 'Candidate name is required';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
};
