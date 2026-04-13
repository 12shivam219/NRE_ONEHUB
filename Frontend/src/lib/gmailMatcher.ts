/**
 * Gmail Email Matching Algorithm
 * Intelligently matches synced Gmail emails to requirements
 */

interface MatchResult {
  requirementId: string;
  confidence: number;
  matchedKeywords: string[];
  reason: string;
}

interface EmailContent {
  subject: string;
  body: string;
  to: string;
  from: string;
}

interface RequirementData {
  id: string;
  title: string;
  description?: string;
  keywords?: string[];
}

/**
 * Extract meaningful keywords from text
 * Removes common words and splits into tokens
 */
function extractKeywords(text: string): string[] {
  if (!text) return [];

  const commonWords = new Set([
    // Articles and prepositions
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'be', 'been',
    // Verbs
    'have', 'has', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
    'can', 'may', 'might', 'must',
    // Pronouns and question words
    'if', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it',
    'we', 'they', 'what', 'which', 'who', 'where', 'when', 'why', 'how',
    // Common filler words
    'just', 'also', 'more', 'most', 'up', 'down', 'out', 'over', 'under',
    'etc', 'your', 'my', 'our', 'their',
  ]);

  // Convert to lowercase and remove special characters
  const cleaned = text.toLowerCase().replace(/[^\w\s]/g, ' ');

  // Split into words and filter
  const words = cleaned.split(/\s+/).filter((word) => {
    return word.length > 2 && !commonWords.has(word);
  });

  // Remove duplicates and return
  return [...new Set(words)];
}

/**
 * Calculate similarity between two strings using Levenshtein distance
 */
function stringSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();

  if (s1 === s2) return 100;

  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;

  if (longer.length === 0) return 100;

  const editDistance = getEditDistance(longer, shorter);
  return Math.round(((longer.length - editDistance) / longer.length) * 100);
}

/**
 * Calculate Levenshtein distance between two strings
 */
function getEditDistance(s1: string, s2: string): number {
  const costs: number[] = [];

  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;

    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];

        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }

        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }

    if (i > 0) {
      costs[s2.length] = lastValue;
    }
  }

  return costs[s2.length];
}

/**
 * Find keyword matches in text
 */
function findKeywordMatches(
  keywords: string[],
  searchText: string,
  similarityThreshold: number = 70
): string[] {
  const matches: string[] = [];
  const searchLower = searchText.toLowerCase();

  for (const keyword of keywords) {
    // Exact match
    if (searchLower.includes(keyword)) {
      matches.push(keyword);
    }
    // Fuzzy match (similar but not exact)
    else {
      const similarity = stringSimilarity(keyword, searchText);
      if (similarity >= similarityThreshold) {
        matches.push(`${keyword} (~${similarity}%)`);
      }
    }
  }

  return matches;
}

/**
 * Calculate confidence score for email-to-requirement match
 */
function calculateMatchConfidence(
  requirement: RequirementData,
  email: EmailContent
): number {
  let score = 0;
  const weights = {
    subjectMatch: 40, // Subject line match is most important
    bodyMatch: 30,
    titleMatch: 20,
    descriptionMatch: 10,
  };

  // Extract keywords from requirement
  const requirementKeywords = extractKeywords(
    `${requirement.title} ${requirement.description || ''}`
  );

  if (requirementKeywords.length === 0) {
    return 0; // Can't match if no keywords
  }

  // 1. Subject line matching (40%)
  const subjectMatches = findKeywordMatches(requirementKeywords, email.subject);
  const subjectScore = (subjectMatches.length / requirementKeywords.length) * 100;
  score += (subjectScore / 100) * weights.subjectMatch;

  // 2. Body text matching (30%)
  const bodyMatches = findKeywordMatches(requirementKeywords, email.body, 65);
  const bodyScore = (bodyMatches.length / requirementKeywords.length) * 100;
  score += (bodyScore / 100) * weights.bodyMatch;

  // 3. Title match (20%)
  const titleSimilarity = stringSimilarity(requirement.title, email.subject);
  score += (titleSimilarity / 100) * weights.titleMatch;

  // 4. Email recipient matching (10%)
  let recipientScore = 0;
  const emailDomain = email.to.split('@')[1];
  const titleDomain = extractDomain(requirement.title);
  if (titleDomain && emailDomain && titleDomain === emailDomain) {
    recipientScore = 50;
  }
  score += (recipientScore / 100) * weights.descriptionMatch;

  return Math.round(score);
}

/**
 * Extract domain from text if present
 */
function extractDomain(text: string): string | null {
  const domainMatch = text.match(/([a-zA-Z0-9-]+\.[a-zA-Z]{2,})/);
  return domainMatch ? domainMatch[1].toLowerCase() : null;
}

/**
 * Find best matching requirement for an email
 */
function findBestMatch(
  requirements: RequirementData[],
  email: EmailContent
): MatchResult | null {
  let bestMatch: MatchResult | null = null;
  let highestConfidence = 0;

  for (const requirement of requirements) {
    const confidence = calculateMatchConfidence(requirement, email);

    if (confidence > highestConfidence) {
      highestConfidence = confidence;

      // Get matched keywords for reporting
      const requirementKeywords = extractKeywords(
        `${requirement.title} ${requirement.description || ''}`
      );
      const matchedKeywords = findKeywordMatches(requirementKeywords, email.subject);

      bestMatch = {
        requirementId: requirement.id,
        confidence: confidence,
        matchedKeywords: matchedKeywords,
        reason: generateMatchReason(confidence, matchedKeywords),
      };
    }
  }

  return bestMatch;
}

/**
 * Generate human-readable reason for match
 */
function generateMatchReason(confidence: number, keywords: string[]): string {
  if (confidence >= 95) {
    return `Very high confidence match (${confidence}%). Keywords found: ${keywords.slice(0, 3).join(', ')}`;
  } else if (confidence >= 80) {
    return `High confidence match (${confidence}%). Keywords found: ${keywords.slice(0, 3).join(', ')}`;
  } else if (confidence >= 70) {
    return `Good confidence match (${confidence}%). Keywords found: ${keywords.slice(0, 3).join(', ')}`;
  } else if (confidence >= 50) {
    return `Moderate confidence match (${confidence}%). Please verify.`;
  } else {
    return `Low confidence match (${confidence}%). Manual review recommended.`;
  }
}

/**
 * Determine if email should be auto-linked based on confidence and threshold
 */
function shouldAutoLink(
  confidence: number,
  confidenceLevel: 'high' | 'medium' | 'low'
): boolean {
  switch (confidenceLevel) {
    case 'high':
      return confidence >= 95;
    case 'medium':
      return confidence >= 70;
    case 'low':
      return confidence >= 50;
    default:
      return false;
  }
}

/**
 * Match email to requirement with detailed results
 */
function matchEmailToRequirement(
  requirements: RequirementData[],
  email: EmailContent,
  confidenceLevel: 'high' | 'medium' | 'low' = 'medium'
): {
  match: MatchResult | null;
  shouldAutoLink: boolean;
  needsUserReview: boolean;
  confidence: number;
} {
  const match = findBestMatch(requirements, email);

  if (!match) {
    return {
      match: null,
      shouldAutoLink: false,
      needsUserReview: true,
      confidence: 0,
    };
  }

  const autoLink = shouldAutoLink(match.confidence, confidenceLevel);
  const needsReview = match.confidence < 80 && match.confidence >= 50;

  return {
    match,
    shouldAutoLink: autoLink,
    needsUserReview: needsReview,
    confidence: match.confidence,
  };
}

export {
  extractKeywords,
  stringSimilarity,
  findKeywordMatches,
  calculateMatchConfidence,
  findBestMatch,
  matchEmailToRequirement,
  shouldAutoLink,
};

export type {
  MatchResult,
  EmailContent,
  RequirementData,
};
