/**
 * Job Extraction Agent Types
 * Interfaces for job extraction and requirement creation
 */

export interface ExtractedJobDetails {
  jobTitle: string;
  company: string;
  hiringCompany?: string;
  jobDescription: string;
  requirements: string[];
  salary?: {
    min?: number;
    max?: number;
    currency?: string;
  };
  rate?: string;
  location: string;
  isRemote: boolean;
  workLocationType?: string;
  employmentType?: 'full-time' | 'part-time' | 'contract' | 'temporary';
  duration?: string;
  applicationDeadline?: string;
  skills: string[];
  keySkills?: string[];
  experiences: string[];
  benefits?: string[];
  vendor?: string;
  vendorContact?: string;
  vendorPhone?: string;
  vendorEmail?: string;
  endClient?: string;
  contactEmail?: string;
  jobUrl?: string;
  sourceEmail?: string;
  rawEmailContent: string;
}

export interface JobExtractionResult {
  success: boolean;
  data?: ExtractedJobDetails;
  error?: string;
  confidence: number; // 0-100
  isJobPosting: boolean;
}

export interface EmailJobMatch {
  emailId: string;
  subject: string;
  from: string;
  date: string;
  isJobPosting: boolean;
  confidence: number; // 0-100
  extractionResult?: JobExtractionResult;
}

export interface RequirementFormData {
  title: string;
  company: string;
  description: string;
  location: string;
  jobType?: string;
  requiredSkills: string;
  experience?: string;
  salary?: string;
  deadline?: string;
  contactEmail?: string;
  status: 'NEW' | 'IN_PROGRESS' | 'INTERVIEW' | 'OFFER' | 'REJECTED' | 'CLOSED';
  source: string; // "email-import"
  sourceEmail?: string;
}

export interface JobExtractionConfig {
  scanInterval?: number; // milliseconds
  autoCreate?: boolean; // auto-create requirements
  confidenceThreshold?: number; // 0-100
  remoteJobsOnly?: boolean;
  maxEmailsPerScan?: number;
}
