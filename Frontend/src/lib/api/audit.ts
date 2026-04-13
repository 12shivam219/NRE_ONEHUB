import { supabase } from '../supabase';
import type { Database } from '../database.types';

type ActivityLog = Database['public']['Tables']['activity_logs']['Row'];
type ActivityLogInsert = Database['public']['Tables']['activity_logs']['Insert'];

type ResourceType =
  | 'requirement'
  | 'interview'
  | 'consultant'
  | 'bulk_email_campaign'
  | 'requirement_email'
  | string;

type LogDetails = Record<string, unknown> | null | undefined;

export interface ActivityLogResult {
  success: boolean;
  logs?: ActivityLog[];
  error?: string;
}

/**
 * Write a unified audit entry for CRM/marketing flows.
 * Stores actor in `user_id` for queryability; additional context lives in `details`.
 */
export const logActivity = async (params: {
  action: string;
  actorId?: string | null;
  resourceType?: ResourceType;
  resourceId?: string | null;
  description?: string;
  details?: LogDetails;
}): Promise<void> => {
  const { action, actorId = null, resourceType = null, resourceId = null, description = null, details } = params;

  const payload: ActivityLogInsert = {
    user_id: actorId ?? null,
    action,
    resource_type: resourceType,
    resource_id: resourceId,
    details: (description
      ? { description, ...details }
      : details || null) as ActivityLog['details'],
    ip_address: null,
  };

  try {
    const { error } = await supabase.from('activity_logs').insert(payload);
    if (error && import.meta.env.DEV) {
      console.error('[audit] insert failed', error);
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('[audit] insert exception', error);
    }
  }
};

/**
 * Fetch recent audit entries for a specific resource.
 */
export const getResourceActivityLogs = async (params: {
  resourceType: ResourceType;
  resourceId: string;
  limit?: number;
}): Promise<ActivityLogResult> => {
  const { resourceType, resourceId, limit = 20 } = params;

  try {
    const { data, error } = await supabase
      .from('activity_logs')
      .select('*')
      .eq('resource_type', resourceType)
      .eq('resource_id', resourceId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, logs: data ?? [] };
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('[audit] fetch exception', error);
    }
    return { success: false, error: 'Failed to fetch audit logs' };
  }
};

/**
 * Format changes between old and new objects into a human-readable audit description.
 * Only includes fields that actually changed.
 * 
 * @example
 * formatChanges({ title: 'Old', status: 'active' }, { title: 'New', status: 'active' })
 * // Returns:
 * // {
 * //   description: "title: 'Old' → 'New'",
 * //   changes: { title: { from: 'Old', to: 'New' } }
 * // }
 */
export const formatChanges = (
  oldData: Record<string, unknown>,
  newData: Record<string, unknown>
): {
  description: string;
  changes: Record<string, { from: unknown; to: unknown }>;
} => {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const fieldLines: string[] = [];

  // Get all keys from both objects
  const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);

  for (const key of allKeys) {
    const oldValue = oldData[key];
    const newValue = newData[key];

    // Skip if values are identical
    if (JSON.stringify(oldValue) === JSON.stringify(newValue)) {
      continue;
    }

    // Format the value for display
    const formatValue = (val: unknown): string => {
      if (val === null || val === undefined) return 'empty';
      if (typeof val === 'string') return `'${val}'`;
      if (typeof val === 'boolean') return val ? 'true' : 'false';
      if (typeof val === 'number') return String(val);
      if (val instanceof Date) return val.toISOString();
      return JSON.stringify(val);
    };

    changes[key] = { from: oldValue, to: newValue };
    fieldLines.push(`${key}: ${formatValue(oldValue)} → ${formatValue(newValue)}`);
  }

  const description = fieldLines.length > 0
    ? fieldLines.join('; ')
    : 'No changes detected';

  return { description, changes };
};

