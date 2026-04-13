import type { Database } from './database.types';

type Requirement = Database['public']['Tables']['requirements']['Row'];
type Consultant = Database['public']['Tables']['consultants']['Row'];

/**
 * Calculate days open for a requirement
 */
export const calculateDaysOpen = (createdAt: string): number => {
  const created = new Date(createdAt);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - created.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

/**
 * Determine if a requirement is stale (open > 30 days)
 */
export const isStaleRequirement = (createdAt: string): boolean => {
  return calculateDaysOpen(createdAt) > 30;
};

/**
 * Get priority color classes
 */
export const getPriorityColors = (priority: string | null) => {
  switch (priority?.toLowerCase()) {
    case 'high':
      return { badge: 'bg-red-100 text-red-800', icon: '🔴' };
    case 'medium':
      return { badge: 'bg-yellow-100 text-yellow-800', icon: '🟡' };
    case 'low':
      return { badge: 'bg-green-100 text-green-800', icon: '🟢' };
    default:
      return { badge: 'bg-gray-100 text-gray-800', icon: '⚪' };
  }
};

/**
 * Calculate consultant match score based on skills and location
 */
export const calculateMatchScore = (consultant: Consultant, requirement: Requirement): number => {
  let score = 0;
  
  // Skills match
  if (consultant.primary_skills && requirement.primary_tech_stack) {
    const consultantSkills = consultant.primary_skills.toLowerCase().split(',').map(s => s.trim());
    const requirementSkills = requirement.primary_tech_stack.toLowerCase().split(',').map(s => s.trim());
    const matches = consultantSkills.filter(skill => 
      requirementSkills.some(req => req.includes(skill) || skill.includes(req))
    );
    score += (matches.length / requirementSkills.length) * 50;
  }
  
  // Location match
  if (consultant.preferred_work_location && (requirement as any).location) {
    if (consultant.preferred_work_location.toLowerCase() === (requirement as any).location.toLowerCase()) {
      score += 25;
    }
  }
  
  // Work type match
  if (consultant.preferred_work_type && requirement.remote) {
    if (consultant.preferred_work_type.toLowerCase() === requirement.remote.toLowerCase()) {
      score += 25;
    }
  }
  
  return Math.round(score);
};

/**
 * Find similar requirements to avoid duplicates
 */
export const findSimilarRequirements = (
  newRequirement: { title: string; company: string | null; primary_tech_stack: string | null },
  existingRequirements: Requirement[]
): Requirement[] => {
  return existingRequirements.filter(req => {
    // Same implementation partner and similar tech stack
    const sameCompany = req.implementation_partner?.toLowerCase() === newRequirement.company?.toLowerCase();
    const sameTechStack = req.primary_tech_stack?.toLowerCase() === newRequirement.primary_tech_stack?.toLowerCase();
    
    // Similar title
    const titleWords = newRequirement.title.toLowerCase().split(' ');
    const titleMatch = titleWords.some(word => req.title.toLowerCase().includes(word));
    
    return sameCompany && (sameTechStack || titleMatch) && req.status !== 'CLOSED';
  });
};

/**
 * Get SLA status
 */
export const getSLAStatus = (createdAt: string, currentStatus: string): { status: string; icon: string; color: string } => {
  const daysOpen = calculateDaysOpen(createdAt);
  
  if (currentStatus === 'CLOSED') {
    return { status: 'Resolved', icon: '✓', color: 'text-green-600' };
  }
  
  if (daysOpen > 7) {
    return { status: 'Delayed', icon: '⚠️', color: 'text-red-600' };
  }
  
  if (daysOpen > 3) {
    return { status: 'At Risk', icon: '⚡', color: 'text-yellow-600' };
  }
  
  return { status: 'On Track', icon: '✓', color: 'text-green-600' };
};

/**
 * Format date for display
 */
export const formatDate = (date: string): string => {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

/**
 * Export requirements to CSV
 */
export const exportToCSV = (requirements: Requirement[], columns: string[]): string => {
  const headers = columns.join(',');
  const rows = requirements.map(req => {
    return columns.map(col => {
      const value = req[col as keyof Requirement];
      // Escape commas and quotes in values
      if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value || '';
    }).join(',');
  });
  
  return [headers, ...rows].join('\n');
};

/**
 * Download file helper
 */
export const downloadFile = (content: string, filename: string, mimeType: string = 'text/plain'): void => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Format requirement number with padding
 * @param number The requirement number
 * @returns Formatted number like "#001", "#042", etc.
 */
export const formatRequirementNumber = (number: number): string => {
  return `#${String(number).padStart(3, '0')}`;
};
