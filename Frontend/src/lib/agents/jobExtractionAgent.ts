/**
 * Job Extraction Agent
 * Uses Supabase Edge Function + Groq AI to extract job details from emails
 */

import { supabase } from '../supabase';
import type {
  ExtractedJobDetails,
  JobExtractionResult,
} from './types';

export class JobExtractionAgent {
  private scannedEmailIds = new Set<string>();

  /**
   * Extract job details using Supabase edge function
   */
  async extractJobDetails(
    subject: string,
    from: string,
    content: string,
    emailId: string
  ): Promise<JobExtractionResult> {
    try {
      const { data, error } = await supabase.functions.invoke('extract-job-details', {
        body: {
          emailSubject: subject,
          emailFrom: from,
          emailContent: content,
          userId: emailId,
        },
      });

      if (error || !data?.success) {
        return {
          success: false,
          error: data?.error || 'Failed to extract job details',
          confidence: data?.confidence || 0,
          isJobPosting: data?.isJobPosting || false,
        };
      }

      const result: ExtractedJobDetails = {
        ...data.data,
        sourceEmail: from,
        rawEmailContent: content,
      };

      return {
        success: true,
        data: result,
        confidence: data.confidence,
        isJobPosting: true,
      };
    } catch (error) {
      console.error('Error extracting job details:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        confidence: 0,
        isJobPosting: false,
      };
    }
  }

  /**
   * Batch process multiple emails
   */
  async processEmails(
    emails: Array<{
      id: string;
      subject: string;
      from: string;
      content: string;
    }>
  ): Promise<JobExtractionResult[]> {
    const results: JobExtractionResult[] = [];

    for (const email of emails) {
      // Skip already scanned emails
      if (this.scannedEmailIds.has(email.id)) {
        continue;
      }

      try {
        const result = await this.extractJobDetails(
          email.subject,
          email.from,
          email.content,
          email.id
        );
        results.push(result);

        // Add small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`Error processing email ${email.id}:`, error);
        results.push({
          success: false,
          error: 'Failed to process email',
          confidence: 0,
          isJobPosting: false,
        });
      }
    }

    return results;
  }

  /**
   * Get list of scanned email IDs
   */
  getScannedEmailIds(): string[] {
    return Array.from(this.scannedEmailIds);
  }

  /**
   * Reset scanned emails
   */
  resetScannedEmails(): void {
    this.scannedEmailIds.clear();
  }
}

// Singleton instance
let agentInstance: JobExtractionAgent | null = null;

export function getJobExtractionAgent(): JobExtractionAgent {
  if (!agentInstance) {
    agentInstance = new JobExtractionAgent();
  }
  return agentInstance;
}

/**
 * Simple wrapper function to parse job descriptions
 * Used by UI components for JD parsing
 */
export async function parseJD(jobDescription: string): Promise<ExtractedJobDetails> {
  const agent = getJobExtractionAgent();
  const result = await agent.extractJobDetails(
    'Job Description',
    'no-reply@system.local',
    jobDescription,
    `jd-${Date.now()}`
  );

  if (!result.success || !result.data) {
    throw new Error(result.error || 'Failed to parse job description');
  }

  return result.data;
}
