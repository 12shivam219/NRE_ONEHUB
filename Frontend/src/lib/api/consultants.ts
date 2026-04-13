import { supabase } from '../supabase';
import type { Database } from '../database.types';
import { logActivity, formatChanges } from './audit';

type Consultant = Database['public']['Tables']['consultants']['Row'];
type ConsultantInsert = Database['public']['Tables']['consultants']['Insert'];

export interface ConsultantWithLogs extends Consultant {
  created_by?: { id: string; full_name: string; email: string } | null;
  updated_by?: { id: string; full_name: string; email: string } | null;
}

/**
 * Get consultants with cursor-based pagination
 * More efficient than offset-based for very large datasets (10K+ records)
 */
export const getConsultantsPageCursor = async (options: {
  userId: string;
  limit?: number;
  cursor?: string; // ISO timestamp cursor for efficient pagination
  search?: string;
  status?: string;
}): Promise<{ success: boolean; consultants?: ConsultantWithLogs[]; nextCursor?: string; error?: string }> => {
  const {
    userId,
    limit = 20,
    cursor,
    search,
    status,
  } = options;

  try {
    let query = supabase
      .from('consultants')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    // Server-side filtering
    if (status && status !== 'ALL') {
      query = query.eq('status', status);
    }

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      query = query.or(`name.ilike.${term},email.ilike.${term},primary_skills.ilike.${term}`);
    }

    // Cursor-based pagination
    if (cursor) {
      query = query.lt('updated_at', cursor);
    }

    // Fetch limit + 1 to determine if there's a next page
    const { data, error } = await query.limit(limit + 1);

    if (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error fetching cursor-paged consultants:', error.message);
      }
      return { success: false, error: error.message };
    }

    const hasNextPage = (data?.length ?? 0) > limit;
    const consultants = hasNextPage ? data?.slice(0, limit) : data;
    const nextCursor = hasNextPage ? consultants?.[consultants.length - 1]?.updated_at : undefined;

    return {
      success: true,
      consultants: (consultants || []) as ConsultantWithLogs[],
      nextCursor: nextCursor ? String(nextCursor) : undefined,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    if (process.env.NODE_ENV === 'development') {
      console.error('Exception fetching cursor-paged consultants:', errorMsg);
    }
    return { success: false, error: 'Failed to fetch consultants' };
  }
};

export const getConsultants = async (
  userId?: string
): Promise<{ success: boolean; consultants?: ConsultantWithLogs[]; error?: string }> => {
  try {
    let query = supabase
      .from('consultants')
      .select('*')
      .order('updated_at', { ascending: false });

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query;

    if (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error fetching consultants:', error.message);
      }
      return { success: false, error: error.message };
    }

    return { success: true, consultants: data || [] };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    if (process.env.NODE_ENV === 'development') {
      console.error('Exception fetching consultants:', errorMsg);
    }
    return { success: false, error: 'Failed to fetch consultants' };
  }
};

/**
 * Get consultants with server-side pagination and filtering
 * Optimized for 10K+ records with minimal client-side processing
 */
export const getConsultantsPage = async (options: {
  userId: string;
  limit?: number;
  offset?: number;
  search?: string;
  status?: string;
}): Promise<{ success: boolean; consultants?: ConsultantWithLogs[]; total?: number; error?: string }> => {
  const {
    userId,
    limit = 20,
    offset = 0,
    search,
    status,
  } = options;

  try {
    let query = supabase
      .from('consultants')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    // Server-side filtering
    if (status && status !== 'ALL') {
      query = query.eq('status', status);
    }

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      // Use ilike for trigram-optimized search (enable pg_trgm for best performance)
      query = query.or(`name.ilike.${term},email.ilike.${term},primary_skills.ilike.${term}`);
    }

    // Server-side pagination
    const start = offset;
    const end = offset + limit - 1;
    query = query.range(start, end);

    const { data, count, error } = await query;

    if (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error fetching paged consultants:', error.message);
      }
      return { success: false, error: error.message };
    }

    return { success: true, consultants: data || [], total: count ?? 0 };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    if (process.env.NODE_ENV === 'development') {
      console.error('Exception fetching paged consultants:', errorMsg);
    }
    return { success: false, error: 'Failed to fetch consultants' };
  }
};

export const getConsultantById = async (
  id: string
): Promise<{ success: boolean; consultant?: Consultant; error?: string }> => {
  try {
    const { data, error } = await supabase
      .from('consultants')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error fetching consultant:', error.message);
      }
      return { success: false, error: error.message };
    }

    return { success: true, consultant: data };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    if (process.env.NODE_ENV === 'development') {
      console.error('Exception fetching consultant:', errorMsg);
    }
    return { success: false, error: 'Failed to fetch consultant' };
  }
};

export const createConsultant = async (
  consultant: ConsultantInsert,
  userId?: string
): Promise<{ success: boolean; consultant?: Consultant; error?: string }> => {
  try {
    const dataToInsert = {
      ...consultant,
    };

    const { data, error } = await supabase
      .from('consultants')
      .insert(dataToInsert)
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    await logActivity({
      action: 'consultant_created',
      actorId: userId,
      resourceType: 'consultant',
      resourceId: data.id,
      description: `Created consultant "${data.name}"`,
    });

    return { success: true, consultant: data };
  } catch {
    return { success: false, error: 'Failed to create consultant' };
  }
};

export const updateConsultant = async (
  id: string,
  updates: Partial<ConsultantInsert>,
  userId?: string
): Promise<{ success: boolean; consultant?: Consultant; error?: string }> => {
  try {
    // Fetch the old record first for audit comparison
    const { data: oldData, error: fetchError } = await supabase
      .from('consultants')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError) {
      return { success: false, error: fetchError.message };
    }

    const dataToUpdate = {
      ...updates,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('consultants')
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
      action: 'consultant_updated',
      actorId: userId,
      resourceType: 'consultant',
      resourceId: id,
      description,
      details: { changes },
    });

    return { success: true, consultant: data };
  } catch {
    return { success: false, error: 'Failed to update consultant' };
  }
};

export const deleteConsultant = async (
  id: string,
  userId?: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    await logActivity({
      action: 'consultant_deleted',
      actorId: userId,
      resourceType: 'consultant',
      resourceId: id,
      description: 'Deleted consultant',
    });

    const { error } = await supabase
      .from('consultants')
      .delete()
      .eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch {
    return { success: false, error: 'Failed to delete consultant' };
  }
};
/**
 * ⚡ OPTIMIZED: Use RPC function for full-text search with relevance ranking
 * Prioritizes exact matches, then substring matches
 * Result: Better relevance ranking, faster search performance
 */
export const searchConsultants = async (
  userId: string,
  searchTerm: string,
  limit: number = 50
): Promise<{ success: boolean; consultants?: Consultant[]; error?: string }> => {
  try {
    const { data, error } = await supabase
      .rpc('search_consultants', {
        p_user_id: userId,
        p_search_term: searchTerm,
        p_limit: limit,
      });

    if (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error searching consultants:', error.message);
      }
      return { success: false, error: error.message };
    }

    return { success: true, consultants: data || [] };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    if (process.env.NODE_ENV === 'development') {
      console.error('Exception searching consultants:', errorMsg);
    }
    return { success: false, error: 'Failed to search consultants' };
  }
};