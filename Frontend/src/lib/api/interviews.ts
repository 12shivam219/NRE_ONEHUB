import { supabase } from '../supabase';
import type { Database } from '../database.types';
import { logActivity, formatChanges } from './audit';

const computeRoundIndex = (roundText?: string | null | number): number => {
  if (!roundText) return 1;
  if (typeof roundText === 'number') return roundText;
  const digits = (roundText.match(/\d+/g) || []).join('');
  if (digits.length === 0) return 1;
  const parsed = parseInt(digits, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
};

type Interview = Database['public']['Tables']['interviews']['Row'];
type InterviewInsert = Database['public']['Tables']['interviews']['Insert'];

export interface InterviewWithLogs extends Omit<Interview, 'created_by' | 'updated_by'> {
  created_by?: { id: string; full_name: string; email: string } | null | undefined;
  updated_by?: { id: string; full_name: string; email: string } | null | undefined;
}

export const getInterviewsPageCursor = async (options: {
  userId: string;
  limit?: number;
  cursor?: string; // ISO timestamp cursor for efficient pagination
  includeCount?: boolean;
  status?: string;
  excludeStatus?: string;
  scheduledFrom?: string;
  scheduledTo?: string;
  orderBy?: 'scheduled_date' | 'updated_at' | 'created_at';
  orderDir?: 'asc' | 'desc';
}): Promise<{ success: boolean; interviews?: InterviewWithLogs[]; nextCursor?: string; error?: string }> => {
  const {
    userId,
    limit = 20,
    cursor,
    status,
    excludeStatus,
    scheduledFrom,
    scheduledTo,
    orderBy = 'scheduled_date',
    orderDir = 'asc',
  } = options;

  try {
    let query = supabase
      .from('interviews')
      .select('*')
      .eq('user_id', userId);

    // Prefer normalized numeric round ordering when available, then the requested order
    // Use 'round_index' (added by migration) for stable round ordering; fallback ordering by orderBy still applied after.
    query = query.order('round_index', { ascending: true }).order(orderBy, { ascending: orderDir === 'asc' });

    if (status && status !== 'ALL') {
      query = query.eq('status', status);
    }
    if (excludeStatus) {
      query = query.neq('status', excludeStatus);
    }
    if (scheduledFrom) {
      query = query.gte('scheduled_date', scheduledFrom);
    }
    if (scheduledTo) {
      query = query.lte('scheduled_date', scheduledTo);
    }

    // Cursor-based pagination - more efficient than offset for large datasets
    if (cursor) {
      if (orderDir === 'asc') {
        query = query.gte(orderBy, cursor);
      } else {
        query = query.lte(orderBy, cursor);
      }
    }

    // Fetch limit + 1 to determine if there's a next page
    const { data, error } = await query.limit(limit + 1);

    if (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error fetching cursor-paged interviews:', error.message);
      }
      return { success: false, error: error.message };
    }

    const hasNextPage = (data?.length ?? 0) > limit;
    const interviews = hasNextPage ? data?.slice(0, limit) : data;
    const nextCursor = hasNextPage ? interviews?.[interviews.length - 1]?.[orderBy as keyof typeof interviews[0]] : undefined;

    return {
      success: true,
      interviews: (interviews || []) as InterviewWithLogs[],
      nextCursor: nextCursor ? String(nextCursor) : undefined,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    if (process.env.NODE_ENV === 'development') {
      console.error('Exception fetching cursor-paged interviews:', errorMsg);
    }
    return { success: false, error: 'Failed to fetch interviews' };
  }
};

export const getInterviewsPage = async (options: {
  userId: string;
  limit?: number;
  offset?: number;
  includeCount?: boolean;
  status?: string;
  excludeStatus?: string;
  scheduledFrom?: string;
  scheduledTo?: string;
  orderBy?: 'scheduled_date' | 'updated_at' | 'created_at';
  orderDir?: 'asc' | 'desc';
}): Promise<{ success: boolean; interviews?: InterviewWithLogs[]; total?: number; error?: string }> => {
  const {
    userId,
    limit = 20,
    offset = 0,
    includeCount = false,
    status,
    excludeStatus,
    scheduledFrom,
    scheduledTo,
    orderBy = 'scheduled_date',
    orderDir = 'asc',
  } = options;

  try {
    const countMode = includeCount ? 'exact' : undefined;
    let query = supabase
      .from('interviews')
      .select('*', { count: countMode as 'exact' | undefined })
      .eq('user_id', userId)
      // Prefer normalized round ordering when available
      .order('round_index', { ascending: true })
      .order(orderBy, { ascending: orderDir === 'asc' });

    if (status && status !== 'ALL') {
      query = query.eq('status', status);
    }
    if (excludeStatus) {
      query = query.neq('status', excludeStatus);
    }
    if (scheduledFrom) {
      query = query.gte('scheduled_date', scheduledFrom);
    }
    if (scheduledTo) {
      query = query.lte('scheduled_date', scheduledTo);
    }
    // optional round filter: prefer explicit round_index if provided, otherwise match textual round
    if ((options as any).round_index !== undefined && (options as any).round_index !== null) {
      query = query.eq('round_index', (options as any).round_index);
    } else if ((options as any).round) {
      query = query.eq('round', (options as any).round);
    }

    const start = offset;
    const end = offset + limit - 1;
    query = query.range(start, end);

    const { data, count, error } = await query;

    if (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error fetching paged interviews:', error.message);
      }
      return { success: false, error: error.message };
    }

    return { success: true, interviews: data || [], total: count ?? 0 };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    if (process.env.NODE_ENV === 'development') {
      console.error('Exception fetching paged interviews:', errorMsg);
    }
    return { success: false, error: 'Failed to fetch interviews' };
  }
};

export const getInterviews = async (
  userId?: string
): Promise<{ success: boolean; interviews?: InterviewWithLogs[]; error?: string }> => {
  try {
    let query = supabase
      .from('interviews')
      .select('*')
      // prefer numeric round ordering when present
      .order('round_index', { ascending: true })
      .order('scheduled_date', { ascending: true });

    if (userId) {
      query = query.eq('user_id', userId);
    }

    // allow callers to filter by round by passing a `round` property on arguments (backwards compatible)
    // (Note: callers of getInterviews may pass a second param in the future; keep this lightweight.)

    const { data, error } = await query;

    if (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error fetching interviews:', error.message);
      }
      return { success: false, error: error.message };
    }

    return { success: true, interviews: data || [] };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    if (process.env.NODE_ENV === 'development') {
      console.error('Exception fetching interviews:', errorMsg);
    }
    return { success: false, error: 'Failed to fetch interviews' };
  }
};

export const getInterviewsByRequirementGrouped = async (
  requirementId: string,
  userId?: string
): Promise<{ success: boolean; grouped?: Record<string, Interview[]>; error?: string }> => {
  try {
    let query = supabase
      .from('interviews')
      .select('*')
      .eq('requirement_id', requirementId)
      // prefer numeric round ordering when present
      .order('round_index', { ascending: true })
      .order('scheduled_date', { ascending: true });

    if (userId) query = query.eq('user_id', userId);

    const { data, error } = await query;
    if (error) {
      if (process.env.NODE_ENV === 'development') console.error('Error fetching interviews by requirement:', error.message);
      return { success: false, error: error.message };
    }

    const grouped: Record<string, Interview[]> = {};
    (data || []).forEach((iv: Interview) => {
      const roundIndex = (iv as any).round_index ?? 1;
      const label = iv.round && iv.round.trim().length > 0 ? iv.round : `Round ${roundIndex}`;
      if (!grouped[label]) grouped[label] = [];
      grouped[label].push(iv);
    });

    return { success: true, grouped };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    if (process.env.NODE_ENV === 'development') console.error('Exception fetching interviews by requirement:', errorMsg);
    return { success: false, error: 'Failed to fetch interviews' };
  }
};

export const getInterviewById = async (
  id: string
): Promise<{ success: boolean; interview?: Interview; error?: string }> => {
  try {
    const { data, error } = await supabase
      .from('interviews')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error fetching interview:', error.message);
      }
      return { success: false, error: error.message };
    }

    return { success: true, interview: data };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    if (process.env.NODE_ENV === 'development') {
      console.error('Exception fetching interview:', errorMsg);
    }
    return { success: false, error: 'Failed to fetch interview' };
  }
};

export const createInterview = async (
  interview: InterviewInsert,
  userId?: string
): Promise<{ success: boolean; interview?: Interview; error?: string }> => {
  try {
    // Get the next interview number for this requirement
    let interviewNumber = (interview as any).interview_number;
    if (!interviewNumber) {
      const { data: existing, error: countError } = await supabase
        .from('interviews')
        .select('interview_number', { count: 'exact' })
        .eq('requirement_id', interview.requirement_id)
        .order('interview_number', { ascending: false })
        .limit(1);

      if (countError) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error fetching existing interview_number:', countError.message);
        }
        // Fall back to 1 if we can't fetch
        interviewNumber = 1;
      } else {
        interviewNumber = (existing?.[0]?.interview_number ?? 0) + 1;
      }
    }

    const payload = {
      ...interview,
      interview_number: interviewNumber,
      // ensure round_index is set server-side so clients that don't provide it still get normalized ordering
      round_index: (interview as any).round_index ?? computeRoundIndex((interview as any).round),
      created_by: userId ?? null,
      updated_by: userId ?? null,
    };

    const { data, error } = await supabase
      .from('interviews')
      .insert(payload)
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    await logActivity({
      action: 'interview_created',
      actorId: userId,
      resourceType: 'interview',
      resourceId: data.id,
      description: `Created interview #${interviewNumber} scheduled for ${new Date(data.scheduled_date).toLocaleDateString()}`,
    });

    return { success: true, interview: data };
  } catch {
    return { success: false, error: 'Failed to create interview' };
  }
};

export const updateInterview = async (
  id: string,
  updates: Partial<InterviewInsert>,
  userId?: string
): Promise<{ success: boolean; interview?: Interview; error?: string }> => {
  try {
    // Fetch the old record first for audit comparison
    const { data: oldData, error: fetchError } = await supabase
      .from('interviews')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError) {
      return { success: false, error: fetchError.message };
    }

    const dataToUpdate = {
      ...updates,
      // if caller updated textual round, update normalized index too
      ...(updates.round ? { round_index: computeRoundIndex((updates as any).round) } : {}),
      updated_at: new Date().toISOString(),
      updated_by: userId ?? null,
    };

    const { data, error } = await supabase
      .from('interviews')
      .update(dataToUpdate)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    // Format the changes for human-readable audit logging
    const { description, changes } = formatChanges(oldData, updates as Record<string, unknown>);
    
    await logActivity({
      action: 'interview_updated',
      actorId: userId,
      resourceType: 'interview',
      resourceId: id,
      description,
      details: { changes },
    });

    return { success: true, interview: data };
  } catch {
    return { success: false, error: 'Failed to update interview' };
  }
};

export const deleteInterview = async (
  id: string,
  userId?: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    await logActivity({
      action: 'interview_deleted',
      actorId: userId,
      resourceType: 'interview',
      resourceId: id,
      description: 'Deleted interview',
    });

    const { error } = await supabase
      .from('interviews')
      .delete()
      .eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch {
    return { success: false, error: 'Failed to delete interview' };
  }
};
