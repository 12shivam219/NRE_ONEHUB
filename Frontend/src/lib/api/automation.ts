/**
 * Automation API Service
 * Handles automated resume workflow: job matching → selection → point generation → injection
 */

import { supabase } from '../supabase';

interface AutomationRequest {
  job_title: string;
  job_description: string;
  recruiter_email: string;
  points_per_tech: number;
  personal_message?: string;
  document_id?: string;
  user_id: string;
}

interface AutoSelectedResume {
  name: string;
  person_name?: string;
  technologies?: string[];
  matching_techs?: string[];
  missing_techs?: string[];
}

interface AutomationResultData {
  success?: boolean;
  message?: string;
  status?: 'auto_selected' | 'completed';
  document_id?: string;
  filename?: string;
  original_filename?: string;
  match_score?: number;
  generated_points?: string;
  file_size?: number;
  auto_selected_resume?: AutoSelectedResume;
}

type AutomationResult = AutomationResultData;

interface ApiResponse<T = unknown> {
  success: boolean;
  data: T | null;
  error: string | null;
  errorCode: string | null;
}

const API_BASE_URL =
  import.meta.env.VITE_TEXT_PROCESSOR_API_URL ||
  import.meta.env.VITE_API_URL ||
  'http://localhost:8000';

function formatHttpError(status: number, body: unknown): string {
  if (body && typeof body === 'object') {
    const detail = (body as { detail?: unknown }).detail;
    if (typeof detail === 'string') {
      return detail;
    }
    if (Array.isArray(detail)) {
      return detail.map((d) => (typeof d === 'object' && d && 'msg' in d ? String((d as { msg: unknown }).msg) : String(d))).join('; ');
    }
  }
  return `Request failed with HTTP ${status}`;
}

class AutomationAPI {
  private baseUrl: string;
  private timeout: number = 120000;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  private async fetchWithTimeout(
    url: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async runWorkflow(request: AutomationRequest): Promise<ApiResponse<AutomationResult>> {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData.session?.access_token) {
      return {
        success: false,
        data: null,
        error: 'You must be signed in to run automation.',
        errorCode: 'UNAUTHENTICATED',
      };
    }

    const accessToken = sessionData.session.access_token;

    try {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/api/automation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(request),
      });

      const parsed = (await response.json().catch(() => ({}))) as ApiResponse<AutomationResult> & { detail?: unknown };

      if (!response.ok) {
        return {
          success: false,
          data: null,
          error: formatHttpError(response.status, parsed),
          errorCode: response.status === 401 || response.status === 403 ? 'UNAUTHORIZED' : 'AUTOMATION_ERROR',
        };
      }

      if (typeof parsed.success === 'boolean') {
        return {
          success: parsed.success,
          data: (parsed.data ?? null) as AutomationResult | null,
          error: parsed.error ?? null,
          errorCode: parsed.errorCode ?? null,
        };
      }

      return {
        success: true,
        data: parsed as AutomationResult,
        error: null,
        errorCode: null,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error && error.name === 'AbortError'
          ? 'Request timed out'
          : error instanceof Error
            ? error.message
            : 'Unknown error occurred';
      return {
        success: false,
        data: null,
        error: errorMessage,
        errorCode: error instanceof Error && error.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR',
      };
    }
  }

  async downloadResume(fileId: string): Promise<Blob> {
    const response = await this.fetchWithTimeout(`${this.baseUrl}/api/automation/download/${encodeURIComponent(fileId)}`);

    if (!response.ok) {
      throw new Error(formatHttpError(response.status, await response.json().catch(() => ({}))));
    }

    return response.blob();
  }

  downloadResumeFile(fileId: string, filename: string = 'Resume.docx'): void {
    const url = `${this.baseUrl}/api/automation/download/${encodeURIComponent(fileId)}`;
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

export const automationAPI = new AutomationAPI();

export { AutomationAPI };
