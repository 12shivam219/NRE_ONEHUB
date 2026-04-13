/**
 * Phone number utility functions for normalized storage and flexible search
 * All phone numbers are stored as digits-only in the database
 * These utilities help normalize input and format for display
 */

/**
 * Normalize a phone number by removing all non-digit characters
 * Use this before storing a phone number in the database
 * @param phone - The phone number string (with or without formatting)
 * @returns Normalized phone number containing only digits
 * @example
 * normalizePhone("+1-234-567-8900") // "12345678900"
 * normalizePhone("(234) 567-8900") // "2345678900"
 * normalizePhone("2345678900") // "2345678900"
 */
export const normalizePhone = (phone: string): string => {
  if (!phone) return '';
  // Remove all non-digit characters
  return phone.replace(/\D/g, '');
};

/**
 * Format a normalized phone number for display (US format)
 * @param phone - The normalized phone number (digits only)
 * @returns Formatted phone number
 * @example
 * formatPhone("12345678900") // "+1-234-567-8900"
 * formatPhone("2345678900") // "234-567-8900"
 * formatPhoneForDisplay("3159613965") // "(315) 961-3965"
 */
export const formatPhone = (phone: string): string => {
  if (!phone) return '';
  
  const normalized = normalizePhone(phone);
  if (!normalized) return phone; // Return original if no digits
  
  // If 11 digits and starts with 1, format as +1-XXX-XXX-XXXX
  if (normalized.length === 11 && normalized.startsWith('1')) {
    return `+1-${normalized.slice(1, 4)}-${normalized.slice(4, 7)}-${normalized.slice(7)}`;
  }
  
  // If 10 digits, format as XXX-XXX-XXXX
  if (normalized.length === 10) {
    return `${normalized.slice(0, 3)}-${normalized.slice(3, 6)}-${normalized.slice(6)}`;
  }
  
  // If 7 digits, format as XXX-XXXX
  if (normalized.length === 7) {
    return `${normalized.slice(0, 3)}-${normalized.slice(3)}`;
  }
  
  // Default: return as-is
  return normalized;
};

/**
 * Format a normalized phone number with parentheses (US format)
 * @param phone - The normalized phone number (digits only)
 * @returns Formatted phone number with parentheses
 * @example
 * formatPhoneWithParens("12345678900") // "(123) 456-7890"
 * formatPhoneWithParens("2345678900") // "(234) 567-8900"
 */
export const formatPhoneWithParens = (phone: string): string => {
  if (!phone) return '';
  
  const normalized = normalizePhone(phone);
  if (!normalized) return phone;
  
  // Remove leading 1 if 11 digits and starts with 1
  let phoneDigits = normalized;
  if (normalized.length === 11 && normalized.startsWith('1')) {
    phoneDigits = normalized.slice(1);
  }
  
  // Format as (XXX) XXX-XXXX if 10 digits
  if (phoneDigits.length === 10) {
    return `(${phoneDigits.slice(0, 3)}) ${phoneDigits.slice(3, 6)}-${phoneDigits.slice(6)}`;
  }
  
  // Fallback
  return formatPhone(phone);
};

/**
 * Check if a phone number contains a search term (format-agnostic)
 * Both phone and search are normalized before comparing
 * @param phoneNumber - The phone number to search in
 * @param searchTerm - The search term (can be in any format)
 * @returns true if the normalized phone contains the normalized search term
 * @example
 * phoneNumberMatches("+1-234-567-8900", "234") // true
 * phoneNumberMatches("(234) 567-8900", "234-567") // true
 * phoneNumberMatches("2345678900", "(234) 567") // true
 */
export const phoneNumberMatches = (
  phoneNumber: string,
  searchTerm: string
): boolean => {
  if (!phoneNumber || !searchTerm) return !searchTerm;
  
  // Only do phone matching if search term contains digits
  const searchDigits = normalizePhone(searchTerm);
  
  // If no digits found in search term, this isn't a phone search
  if (!searchDigits) return false;
  
  const normalizedPhone = normalizePhone(phoneNumber);
  
  // Return true if the search term is found in the phone number
  return normalizedPhone.includes(searchDigits);
};

