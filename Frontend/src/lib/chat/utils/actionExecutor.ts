/**
 * Action Executor
 * Interprets action intents from the LLM and executes them
 * (navigation, data fetching, UI updates)
 */

import { useNavigate } from 'react-router-dom';
import type { ActionIntent, NavigationTarget } from '../types';

export interface ActionExecutorOptions {
  userRole?: 'user' | 'marketing' | 'admin';
  onNavigate?: (path: string) => void;
  onSearch?: (query: string, filters: Record<string, unknown>) => void;
  onActionComplete?: (action: ActionIntent) => void;
}

/**
 * Execute an action intent from the AI
 * Returns whether the action was executed successfully
 */
export const executeAction = (
  action: ActionIntent,
  navigate: (path: string) => void,
  options: ActionExecutorOptions = {}
): boolean => {
  const { userRole = 'user', onNavigate, onSearch, onActionComplete } = options;

  try {
    // Check admin permission
    if (action.target === 'admin' && userRole !== 'admin') {
      console.warn('Admin action attempted without admin role');
      return false;
    }

    switch (action.type) {
      case 'none': {
        // No action needed
        onActionComplete?.(action);
        return true;
      }

      case 'navigate': {
        const path = buildNavigationPath(action.target, action.subView, action.params);
        if (path) {
          navigate(path);
          onNavigate?.(path);
          onActionComplete?.(action);
          return true;
        }
        return false;
      }

      case 'search': {
        const path = buildNavigationPath(action.target, action.subView, action.params);
        if (path) {
          navigate(path);
          onSearch?.(action.params?.query as string || '', action.params?.filters || {});
          onActionComplete?.(action);
          return true;
        }
        return false;
      }

      case 'create': {
        const path = buildNavigationPath(action.target, action.subView, {
          ...action.params,
          create: true,
        });
        if (path) {
          navigate(path);
          onActionComplete?.(action);
          return true;
        }
        return false;
      }

      case 'update':
      case 'delete': {
        // These typically require modal/confirmation dialogs
        // Signal that UI component should handle it
        onActionComplete?.(action);
        return true;
      }

      case 'analyze': {
        // Navigate to view with relevant data
        const path = buildNavigationPath(action.target, action.subView, action.params);
        if (path) {
          navigate(path);
          onActionComplete?.(action);
          return true;
        }
        return false;
      }

      case 'data_fetch': {
        // Typically handled by consuming components
        onActionComplete?.(action);
        return true;
      }

      default:
        return false;
    }
  } catch (error) {
    console.error('Error executing action:', error);
    return false;
  }
};

/**
 * Build navigation path from action intent
 */
function buildNavigationPath(
  target: NavigationTarget | undefined,
  subView: string | null | undefined,
  params?: Record<string, unknown>
): string | null {
  if (!target) return null;

  let basePath = '';
  const queryParams = new URLSearchParams();

  switch (target) {
    case 'dashboard':
      basePath = '/dashboard';
      break;
    case 'crm':
      basePath = '/crm';
      if (subView) {
        queryParams.set('view', subView);
      }
      break;
    case 'requirements':
      basePath = '/crm';
      queryParams.set('view', 'requirements');
      break;
    case 'interviews':
      basePath = '/crm';
      queryParams.set('view', 'interviews');
      break;
    case 'consultants':
      basePath = '/crm';
      queryParams.set('view', 'consultants');
      break;
    case 'documents':
      basePath = '/documents';
      break;
    case 'admin':
      basePath = '/admin';
      break;
    default:
      return null;
  }

  // Add search filters if present
  if (params?.filters && typeof params.filters === 'object') {
    const filters = params.filters as Record<string, unknown>;
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        queryParams.set(key, String(value));
      }
    });
  }

  // Add search query if present
  if (params?.query) {
    queryParams.set('search', String(params.query));
  }

  const queryString = queryParams.toString();
  return queryString ? `${basePath}?${queryString}` : basePath;
}

/**
 * Hook to use action executor
 */
export const useActionExecutor = () => {
  const navigate = useNavigate();

  const executeActionHook = (
    action: ActionIntent,
    options?: ActionExecutorOptions
  ) => {
    return executeAction(action, navigate, options);
  };

  return { executeAction: executeActionHook };
};
