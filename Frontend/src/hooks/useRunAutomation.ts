/**
 * React Query Hooks for Automation Workflow
 * Handles: resume selection → job analysis → point generation → injection → save
 */

import { useMutation } from '@tanstack/react-query';
import { automationAPI } from '@/lib/api/automation';
import { useToast } from '@/contexts/ToastContext';
import { useAuth } from '@/hooks/useAuth';

interface AutomationFormData {
  job_title: string;
  job_description: string;
  recruiter_email: string;
  points_per_tech: number;
  personal_message?: string;
  document_id?: string; // Optional - backend will auto-select if not provided
}

/**
 * Run the full automation workflow on a selected document
 * Automatically generates AI points and injects into selected resume
 * If document_id is not provided, backend will auto-select best matching resume
 */
export const useRunAutomation = () => {
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (data: AutomationFormData) => {
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      const response = await automationAPI.runWorkflow({
        ...data,
        user_id: user.id,
      });

      if (!response.success) {
        throw new Error(response.error || 'Automation workflow failed');
      }

      return response.data;
    },
    // Note: success/error toasts handled by component since we have different statuses (auto_selected vs completed)
  });
};

/**
 * Download the processed resume file
 */
export const useDownloadResume = () => {
  const { showToast } = useToast();

  return useMutation({
    mutationFn: async (fileId: string) => {
      return automationAPI.downloadResume(fileId);
    },
    onSuccess: () => {
      showToast({
        message: '✅ Resume downloaded successfully!',
        type: 'success',
      });
    },
    onError: (error) => {
      showToast({
        message: `❌ Failed to download: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'error',
      });
    },
  });
};

export const useSendAutomationEmail = () => {
  const { showToast } = useToast();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (data: {
      document_id: string;
      recruiter_email: string;
      job_title: string;
      personal_message?: string;
    }) => {
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      const response = await automationAPI.sendEmail({
        ...data,
        user_id: user.id,
      });

      if (!response.success) {
        throw new Error(response.error || 'Failed to send email');
      }

      return response.data;
    },
    onSuccess: () => {
      showToast({
        message: 'Resume emailed successfully!',
        type: 'success',
      });
    },
    onError: (error) => {
      showToast({
        message: `Failed to send email: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'error',
      });
    },
  });
};
