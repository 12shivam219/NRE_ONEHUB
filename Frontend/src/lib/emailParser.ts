/**
 * Robust Email Parser Utility
 * Handles multiple email formats:
 * - Simple: email@example.com
 * - With name: John Doe, john@example.com or John Doe <john@example.com>
 * - Multiple separators: newlines, semicolons, commas (when not part of format)
 */

import { parseOneAddress, parseAddressList } from 'email-addresses';

export interface ParsedEmail {
  email: string;
  name?: string;
}

/**
 * Validate if a string is a valid email address (stricter validation)
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  // RFC 5322 simplified regex - ensures proper domain structure
  const emailRegex = /^[a-zA-Z0-9._%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  // Additional checks: no consecutive dots, no leading/trailing dots
  const isValid = emailRegex.test(email);
  if (!isValid) return false;
  // Ensure no double dots or consecutive special characters
  return !email.includes('..') && !email.startsWith('.') && !email.endsWith('.');
}

/**
 * Parse a single email entry
 * Supports formats like:
 * - email@example.com
 * - John Doe <john@example.com>
 * - john@example.com, John Doe
 * - John Doe; john@example.com
 */
function parseSingleEmail(text: string): ParsedEmail | null {
  if (!text || typeof text !== 'string') {
    return null;
  }

  text = text.trim();
  if (!text) {
    return null;
  }

  // Try parsing with the email-addresses library first (handles complex formats)
  try {
    const result = parseOneAddress(text);
    if (result && typeof result === 'object' && 'address' in result) {
      const mailbox = result as { address: string; displayName?: string };
      return {
        email: mailbox.address,
        name: mailbox.displayName || undefined,
      };
    }
  } catch {
    // Fallback to manual parsing
  }

  // Fallback: Simple regex-based parsing
  // Pattern: (optional name) email@domain
  const emailRegex = /([a-zA-Z0-9._%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/;
  const match = text.match(emailRegex);

  if (match) {
    const email = match[1];
    const name = text.replace(email, '').trim().replace(/^[,;<>]+|[,;<>]+$/g, '').trim();
    
    return {
      email,
      name: name ? name : undefined,
    };
  }

  return null;
}

/**
 * Parse multiple email addresses from text
 * Supports multiple separators: newlines, semicolons, and smart comma detection
 * 
 * Examples:
 * - "john@example.com\njane@example.com"
 * - "john@example.com; jane@example.com"
 * - "john@example.com, jane@example.com"
 * - "Doe, John john@example.com\nSmith, Jane jane@example.com"
 */
export function parseEmailList(text: string): ParsedEmail[] {
  if (!text || typeof text !== 'string') {
    return [];
  }

  const emails: ParsedEmail[] = [];
  const seen = new Set<string>();

  // First, try to parse the entire text as a list using email-addresses library
  try {
    const result = parseAddressList(text);
    if (result && Array.isArray(result)) {
      for (const item of result) {
        if (typeof item === 'object' && 'address' in item) {
          const mailbox = item as { address: string; displayName?: string };
          if (mailbox.address && !seen.has(mailbox.address.toLowerCase())) {
            emails.push({
              email: mailbox.address,
              name: mailbox.displayName || undefined,
            });
            seen.add(mailbox.address.toLowerCase());
          }
        }
      }
      
      // If we successfully parsed anything, return those results
      if (emails.length > 0) {
        return emails;
      }
    }
  } catch {
    // Fallback to splitting by common separators
  }

  // Fallback: Split by multiple delimiters
  // Use semicolons and newlines as primary separators
  let entries = text.split(/[;\n]+/);
  
  // If no semicolons/newlines, try splitting by commas (but be careful about format like "Doe, John")
  if (entries.length === 1) {
    // Only split by commas if there are multiple email-like patterns
    const emailCount = (text.match(/@/g) || []).length;
    if (emailCount > 1) {
      // Multiple emails likely present, try comma split
      entries = text.split(/[,;]+/);
    }
  }

  // Parse each entry
  for (const entry of entries) {
    const parsed = parseSingleEmail(entry);
    if (parsed && !seen.has(parsed.email.toLowerCase())) {
      emails.push(parsed);
      seen.add(parsed.email.toLowerCase());
    }
  }

  return emails;
}

/**
 * Extract unique emails from a list (case-insensitive)
 */
export function deduplicateEmails(emails: ParsedEmail[]): ParsedEmail[] {
  const seen = new Map<string, ParsedEmail>();
  
  for (const email of emails) {
    const key = email.email.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, email);
    }
  }

  return Array.from(seen.values());
}
