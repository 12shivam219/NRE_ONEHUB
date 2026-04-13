/**
 * React Query Hooks for Text Processor
 * Integrated with Frontend patterns
 * Uses React Query v5 for server state management
 */

import { useMutation, useQuery } from '@tanstack/react-query';
import { textProcessorAPI } from '@/lib/api/textProcessor';
import { useToast } from '@/contexts/ToastContext';

// ============ PROCESS TEXT HOOK ============

export const useProcessText = () => {
  const { showToast } = useToast();

  return useMutation({
    mutationFn: async ({
      text,
      pointsPerHeading = 2,
      removeDuplicates = false,
    }: {
      text: string;
      pointsPerHeading?: number;
      removeDuplicates?: boolean;
    }) => {
      const response = await textProcessorAPI.processText(
        text,
        pointsPerHeading,
        removeDuplicates
      );

      if (!response.success) {
        throw new Error(response.error || 'Failed to process text');
      }

      return response.data;
    },
    onError: (error) => {
      showToast({
        message: `Error: ${error instanceof Error ? error.message : 'Processing failed'}`,
        type: 'error',
      });
    },
    onSuccess: () => {
      showToast({
        message: 'Text processed successfully',
        type: 'success',
      });
    },
  });
};

// ============ EXPORT FILE HOOK ============

export const useExportFile = () => {
  const { showToast } = useToast();

  return useMutation({
    mutationFn: async ({
      text,
      format,
    }: {
      text: string;
      format: 'docx' | 'pdf';
    }) => {
      const blob = await textProcessorAPI.exportFile(text, format);

      if (!blob) {
        throw new Error('Export failed');
      }

      return { blob, format };
    },
    onSuccess: ({ blob, format }) => {
      // Trigger download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `processed.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast({
        message: `Downloaded as ${format.toUpperCase()}`,
        type: 'success',
      });
    },
    onError: (error) => {
      showToast({
        message: `Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'error',
      });
    },
  });
};

// ============ BATCH PROCESS HOOK ============

export const useBatchProcess = () => {
  const { showToast } = useToast();

  return useMutation({
    mutationFn: async ({
      texts,
      pointsPerHeading = 2,
      removeDuplicates = false,
    }: {
      texts: string[];
      pointsPerHeading?: number;
      removeDuplicates?: boolean;
    }) => {
      const response = await textProcessorAPI.batchProcess(
        texts,
        pointsPerHeading,
        removeDuplicates
      );

      if (!response.success) {
        throw new Error(response.error || 'Batch processing failed');
      }

      return response.data;
    },
    onError: (error) => {
      showToast({
        message: `Batch process failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'error',
      });
    },
    onSuccess: (data) => {
      showToast({
        message: `Processed ${data?.count || 0} file(s) successfully`,
        type: 'success',
      });
    },
  });
};

// ============ DETECT BOOKMARKS HOOK ============

export const useDetectBookmarks = () => {
  const { showToast } = useToast();

  return useMutation({
    mutationFn: async (file: File) => {
      const response = await textProcessorAPI.detectBookmarks(file);

      if (!response.success) {
        throw new Error(response.error || 'Failed to detect bookmarks');
      }

      return response.data;
    },
    onError: (error) => {
      showToast({
        message: `Failed to detect bookmarks: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'error',
      });
    },
  });
};

// ============ INJECT RESUME HOOK ============

export const useInjectResume = () => {
  const { showToast } = useToast();

  return useMutation({
    mutationFn: async ({
      resumeFile,
      processedText,
      mapping,
    }: {
      resumeFile: File;
      processedText: string;
      mapping: Record<number, string>;
    }) => {
      const blob = await textProcessorAPI.injectResume(
        resumeFile,
        processedText,
        mapping
      );

      if (!blob) {
        throw new Error('Injection failed');
      }

      return blob;
    },
    onSuccess: (blob) => {
      // Trigger download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Resume_Updated.docx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast({
        message: 'Resume injected successfully',
        type: 'success',
      });
    },
    onError: (error) => {
      showToast({
        message: `Injection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'error',
      });
    },
  });
};

// ============ BATCH INJECT RESUME HOOK ============

export const useBatchInjectResume = () => {
  const { showToast } = useToast();
  const injectResume = useInjectResume();

  return useMutation({
    mutationFn: async ({
      resumeFiles,
      textFiles,
      mappings,
    }: {
      resumeFiles: File[];
      textFiles: { name: string; content: string }[];
      mappings: Record<string, string>; // text file name -> resume file name
    }) => {
      const results: Array<{ success: boolean; filename: string; error?: string }> = [];

      for (const textFile of textFiles) {
        const resumeFileName = mappings[textFile.name];
        const resumeFile = resumeFiles.find((f) => f.name === resumeFileName);

        if (!resumeFile) {
          results.push({
            success: false,
            filename: textFile.name,
            error: `No resume mapped for ${textFile.name}`,
          });
          continue;
        }

        try {
          await injectResume.mutateAsync({
            resumeFile,
            processedText: textFile.content,
            mapping: {}, // Or derive from context
          });

          results.push({
            success: true,
            filename: textFile.name,
          });
        } catch (error) {
          results.push({
            success: false,
            filename: textFile.name,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      return results;
    },
    onSuccess: (results) => {
      const successful = results.filter((r) => r.success).length;
      showToast({
        message: `Batch injection complete: ${successful}/${results.length} successful`,
        type: 'success',
      });
    },
  });
};

// ============ GENERATE POINTS HOOK ============

export const useGeneratePoints = () => {
  const { showToast } = useToast();

  return useMutation({
    mutationFn: async ({
      jobDescription,
      jobTitle,
      numPoints = 3,
    }: {
      jobDescription: string;
      jobTitle: string;
      numPoints?: number;
    }) => {
      const response = await textProcessorAPI.generatePoints(
        jobDescription,
        jobTitle,
        numPoints
      );

      if (!response.success) {
        throw new Error(response.error || 'Failed to generate points');
      }

      return response.data;
    },
    onError: (error) => {
      showToast({
        message: `Generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'error',
      });
    },
    onSuccess: (data) => {
      showToast({
        message: `Generated ${data?.tech_count || 0} technology stack(s)`,
        type: 'success',
      });
    },
  });
};

// ============ SEND EMAIL HOOK ============

export const useSendEmail = () => {
  const { showToast } = useToast();

  return useMutation({
    mutationFn: async ({
      recipients,
      subject,
      body,
      resumePath,
      provider,
      credentials,
    }: {
      recipients: string[];
      subject: string;
      body: string;
      resumePath: string;
      provider: 'gmail' | 'outlook' | 'sendgrid';
      credentials: {
        senderEmail?: string;
        senderPassword?: string;
        apiKey?: string;
      };
    }) => {
      const response = await textProcessorAPI.sendEmail(
        recipients,
        subject,
        body,
        resumePath,
        provider,
        credentials
      );

      if (!response.success) {
        throw new Error(response.error || 'Failed to send email');
      }

      return response.data;
    },
    onError: (error) => {
      showToast({
        message: `Email failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'error',
      });
    },
    onSuccess: (data) => {
      showToast({
        message: `Sent to ${data?.sent || 0}/${data?.total || 0} recipients`,
        type: 'success',
      });
    },
  });
};

// ============ API STATUS HOOKS ============

export const useTextProcessorStatus = () => {
  return useQuery({
    queryKey: ['textProcessorStatus'],
    queryFn: async () => {
      const response = await textProcessorAPI.getStatus();
      if (!response.success) {
        throw new Error('Failed to get status');
      }
      return response.data;
    },
    staleTime: 60000, // 1 minute
    retry: 1,
  });
};

export const useTextProcessorHealth = () => {
  return useQuery({
    queryKey: ['textProcessorHealth'],
    queryFn: async () => {
      const health = await textProcessorAPI.health();
      if (!health) {
        throw new Error('API is not responding');
      }
      return health;
    },
    staleTime: 30000, // 30 seconds
    retry: 1,
  });
};
