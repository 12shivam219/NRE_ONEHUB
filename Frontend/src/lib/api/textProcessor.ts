/**
 * Text Processor API Service
 * Integrates Streamlit application features with React via FastAPI backend
 * 
 * Handles:
 * - Text processing with cycle extraction
 * - Resume injection with bookmark mapping
 * - Batch processing
 * - AI point generation from job descriptions
 * - Email functionality
 */

interface ApiResponse<T = any> {
  success: boolean;
  data: T | null;
  error: string | null;
  errorCode: string | null;
}

const API_BASE_URL = import.meta.env.VITE_TEXT_PROCESSOR_API_URL || 
                     import.meta.env.VITE_API_URL ||
                     'http://localhost:8000';

/** Same value as server TEXT_PROCESSOR_API_KEY when using optional route protection (visible in built JS). Prefer injecting the header at your reverse proxy instead. */
const TEXT_PROCESSOR_CLIENT_KEY = (import.meta.env.VITE_TEXT_PROCESSOR_API_KEY as string | undefined)?.trim();

class TextProcessorAPI {
  private baseUrl: string;
  private timeout: number = 30000;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
  }

  private processorKeyHeaders(): Record<string, string> {
    if (!TEXT_PROCESSOR_CLIENT_KEY) {
      return {};
    }
    return { 'X-Text-Processor-Api-Key': TEXT_PROCESSOR_CLIENT_KEY };
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          ...this.processorKeyHeaders(),
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as {
          error?: string;
          errorCode?: string;
          detail?: string | Array<{ msg?: string }>;
        };

        const detailMessage =
          typeof errorData.detail === 'string'
            ? errorData.detail
            : Array.isArray(errorData.detail)
              ? errorData.detail.map((d) => d?.msg).filter(Boolean).join('; ')
              : '';

        return {
          success: false,
          data: null,
          error: errorData.error || detailMessage || `API Error: ${response.status}`,
          errorCode: errorData.errorCode || 'API_ERROR',
        };
      }

      // Handle file downloads (binary content)
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/vnd.') || 
          contentType.includes('application/octet-stream') ||
          contentType.includes('application/pdf') ||
          contentType.includes('application/msword') ||
          (contentType.includes('application/') && !contentType.includes('application/json'))) {
        return {
          success: true,
          data: await response.blob() as any,
          error: null,
          errorCode: null,
        };
      }

      const data = await response.json();
      return data as ApiResponse<T>;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          data: null,
          error: 'Request timeout',
          errorCode: 'TIMEOUT',
        };
      }

      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        errorCode: 'NETWORK_ERROR',
      };
    }
  }

  // ============ TEXT PROCESSING ============

  async processText(
    text: string,
    pointsPerHeading: number = 2,
    removeDuplicates: boolean = false
  ): Promise<ApiResponse<{ processed_text: string; char_count: number }>> {
    return this.request('/api/process-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        points_per_heading: pointsPerHeading,
        remove_duplicates: removeDuplicates,
      }),
    });
  }

  async exportFile(text: string, format: 'docx' | 'pdf'): Promise<Blob | null> {
    try {
      const formData = new FormData();
      formData.append('text', text);
      formData.append('format', format);

      const response = await fetch(`${this.baseUrl}/api/export`, {
        method: 'POST',
        headers: this.processorKeyHeaders(),
        body: formData,
      });

      if (!response.ok) return null;
      return await response.blob();
    } catch (error) {
      console.error('Export error:', error);
      return null;
    }
  }

  // ============ BATCH PROCESSING ============

  async batchProcess(
    texts: string[],
    pointsPerHeading: number = 2,
    removeDuplicates: boolean = false
  ): Promise<
    ApiResponse<{
      results: Array<{
        filename: string;
        processed_text: string;
        has_docx: boolean;
        has_pdf: boolean;
      }>;
      count: number;
    }>
  > {
    return this.request('/api/batch-process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        texts,
        points_per_heading: pointsPerHeading,
        remove_duplicates: removeDuplicates,
      }),
    });
  }

  // ============ RESUME INJECTION ============

  async detectBookmarks(file: File): Promise<
    ApiResponse<{
      bookmarks: string[];
      count: number;
      filename: string;
      auto_created?: boolean;
      created_count?: number;
      reference_path?: string | null;
      matches?: Array<{
        bookmark: string;
        created: boolean;
        score: number;
        reason: string;
        target_text?: string;
      }>;
      message?: string | null;
    }>
  > {
    const formData = new FormData();
    formData.append('file', file);

    return this.request('/api/detect-bookmarks', {
      method: 'POST',
      body: formData,
    });
  }

  async injectResume(
    resumeFile: File,
    processedText: string,
    mapping: Record<number, string>
  ): Promise<Blob | null> {
    try {
      const formData = new FormData();
      formData.append('resume', resumeFile);
      formData.append('processed_text', processedText);
      formData.append('mapping', JSON.stringify(mapping));

      const response = await fetch(`${this.baseUrl}/api/inject-resume`, {
        method: 'POST',
        headers: this.processorKeyHeaders(),
        body: formData,
      });

      if (!response.ok) return null;
      return await response.blob();
    } catch (error) {
      console.error('Injection error:', error);
      return null;
    }
  }

  // ============ AI POINT GENERATION ============

  async generatePoints(
    jobDescription: string,
    jobTitle: string,
    numPoints: number = 3
  ): Promise<
    ApiResponse<{
      tech_stacks: string[];
      generated_points: string;
      tech_count: number;
      point_count: number;
    }>
  > {
    return this.request('/api/generate-points', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_description: jobDescription,
        job_title: jobTitle,
        num_points: numPoints,
      }),
    });
  }

  // ============ EMAIL SENDING ============

  async sendEmail(
    recipients: string[],
    subject: string,
    body: string,
    resumePath: string,
    provider: 'gmail' | 'outlook' | 'sendgrid',
    credentials: {
      senderEmail?: string;
      senderPassword?: string;
      apiKey?: string;
    }
  ): Promise<
    ApiResponse<{
      sent: number;
      total: number;
      failed_recipients: string[];
    }>
  > {
    return this.request('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipients,
        subject,
        body,
        resume_path: resumePath,
        provider,
        sender_email: credentials.senderEmail,
        sender_password: credentials.senderPassword,
        api_key: credentials.apiKey,
      }),
    });
  }

  // ============ HEALTH & STATUS ============

  async health(): Promise<{ status: string; service: string } | null> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  async getConfig(): Promise<
    ApiResponse<{
      api_url: string;
      environment: string;
      max_file_size_mb: number;
      supported_formats: string[];
      batch_limit: number;
      text_processor_api_key_required?: boolean;
    }>
  > {
    return this.request('/api/config');
  }

  async getStatus(): Promise<
    ApiResponse<{
      status: string;
      version: string;
      database: string;
    }>
  > {
    return this.request('/api/status');
  }
}

export const textProcessorAPI = new TextProcessorAPI();
export default TextProcessorAPI;
