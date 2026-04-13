/**
 * User-friendly error message utilities
 * Converts technical errors into user-friendly messages
 */

export interface UserFriendlyError {
  title: string;
  message: string;
  technical?: string;
  recovery?: {
    label: string;
    action: () => void;
  }[];
}

/**
 * Detects network errors and provides specific handling
 */
export const isNetworkError = (error: unknown): boolean => {
  if (typeof error === 'string') {
    return error.toLowerCase().includes('network') ||
           error.toLowerCase().includes('fetch') ||
           error.toLowerCase().includes('connection') ||
           error.toLowerCase().includes('timeout');
  }
  if (error instanceof Error) {
    return error.message.toLowerCase().includes('network') ||
           error.message.toLowerCase().includes('fetch') ||
           error.message.toLowerCase().includes('connection') ||
           error.message.toLowerCase().includes('timeout') ||
           error.name === 'NetworkError' ||
           error.name === 'TypeError';
  }
  return false;
};

/**
 * Detects authentication errors
 */
export const isAuthError = (error: unknown): boolean => {
  if (typeof error === 'string') {
    return error.toLowerCase().includes('unauthorized') ||
           error.toLowerCase().includes('authentication') ||
           error.toLowerCase().includes('token') ||
           error.toLowerCase().includes('session');
  }
  if (error instanceof Error) {
    return error.message.toLowerCase().includes('unauthorized') ||
           error.message.toLowerCase().includes('authentication') ||
           error.message.toLowerCase().includes('token') ||
           error.message.toLowerCase().includes('session');
  }
  return false;
};

/**
 * Detects validation errors
 */
export const isValidationError = (error: unknown): boolean => {
  if (typeof error === 'string') {
    return error.toLowerCase().includes('validation') ||
           error.toLowerCase().includes('invalid') ||
           error.toLowerCase().includes('required') ||
           error.toLowerCase().includes('format');
  }
  if (error instanceof Error) {
    return error.message.toLowerCase().includes('validation') ||
           error.message.toLowerCase().includes('invalid') ||
           error.message.toLowerCase().includes('required') ||
           error.message.toLowerCase().includes('format');
  }
  return false;
};

/**
 * Converts technical errors to user-friendly messages
 */
export const toUserFriendlyError = (
  error: unknown,
  context?: string
): UserFriendlyError => {
  const errorString = error instanceof Error ? error.message : String(error);
  const technical = errorString;

  // Network errors
  if (isNetworkError(error)) {
    return {
      title: 'Connection Problem',
      message: 'We couldn\'t connect to the server. Please check your internet connection and try again.',
      technical,
      recovery: [
        {
          label: 'Check Connection',
          action: () => {
            if (navigator.onLine) {
              window.location.reload();
            } else {
              alert('You appear to be offline. Please check your internet connection.');
            }
          },
        },
        {
          label: 'Retry',
          action: () => window.location.reload(),
        },
      ],
    };
  }

  // Authentication errors
  if (isAuthError(error)) {
    return {
      title: 'Session Expired',
      message: 'Your session has expired. Please sign in again to continue.',
      technical,
      recovery: [
        {
          label: 'Sign In',
          action: () => {
            window.location.href = '/';
          },
        },
      ],
    };
  }

  // Validation errors
  if (isValidationError(error)) {
    return {
      title: 'Invalid Input',
      message: errorString || 'Please check your input and try again.',
      technical,
    };
  }

  // Context-specific errors
  if (context) {
    const contextMessages: Record<string, { title: string; message: string }> = {
      'load-requirements': {
        title: 'Unable to Load Requirements',
        message: 'We couldn\'t load your requirements. Please check your connection and try again.',
      },
      'save-requirement': {
        title: 'Unable to Save Requirement',
        message: 'We couldn\'t save your requirement. Please check your input and try again.',
      },
      'delete-requirement': {
        title: 'Unable to Delete Requirement',
        message: 'We couldn\'t delete the requirement. Please try again or contact support if the problem persists.',
      },
      'load-interviews': {
        title: 'Unable to Load Interviews',
        message: 'We couldn\'t load your interviews. Please check your connection and try again.',
      },
      'load-consultants': {
        title: 'Unable to Load Consultants',
        message: 'We couldn\'t load your consultants. Please check your connection and try again.',
      },
      'upload-document': {
        title: 'Upload Failed',
        message: 'We couldn\'t upload your document. Please check the file size and format, then try again.',
      },
    };

    const contextError = contextMessages[context];
    if (contextError) {
      return {
        ...contextError,
        technical,
        recovery: [
          {
            label: 'Try Again',
            action: () => window.location.reload(),
          },
        ],
      };
    }
  }

  // Generic error
  return {
    title: 'Something Went Wrong',
    message: 'An unexpected error occurred. Please try again or contact support if the problem persists.',
    technical,
    recovery: [
      {
        label: 'Try Again',
        action: () => window.location.reload(),
      },
    ],
  };
};

