import { supabase } from '../supabase';
import type { Database } from '../database.types';

type Requirement = Database['public']['Tables']['requirements']['Row'];
type Interview = Database['public']['Tables']['interviews']['Row'];
type Consultant = Database['public']['Tables']['consultants']['Row'];

export interface RealtimeUpdate<T> {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  record: T;
}

/**
 * Subscribe to requirement changes in real-time
 */
export const subscribeToRequirements = (
  userId: string,
  onUpdate: (update: RealtimeUpdate<Requirement>) => void
): (() => void) => {
  const channel = supabase
    .channel(`requirements:${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'requirements',
        filter: `user_id=eq.${userId}`,
      },
      (payload: any) => {
        if (payload.eventType === 'INSERT') {
          onUpdate({
            type: 'INSERT',
            record: payload.new as Requirement,
          });
        } else if (payload.eventType === 'UPDATE') {
          onUpdate({
            type: 'UPDATE',
            record: payload.new as Requirement,
          });
        } else if (payload.eventType === 'DELETE') {
          onUpdate({
            type: 'DELETE',
            record: payload.old as Requirement,
          });
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};

/**
 * Subscribe to interview changes in real-time
 */
export const subscribeToInterviews = (
  userId: string,
  onUpdate: (update: RealtimeUpdate<Interview>) => void
): (() => void) => {
  const channel = supabase
    .channel(`interviews:${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'interviews',
        filter: `user_id=eq.${userId}`,
      },
      (payload: any) => {
        if (payload.eventType === 'INSERT') {
          onUpdate({
            type: 'INSERT',
            record: payload.new as Interview,
          });
        } else if (payload.eventType === 'UPDATE') {
          onUpdate({
            type: 'UPDATE',
            record: payload.new as Interview,
          });
        } else if (payload.eventType === 'DELETE') {
          onUpdate({
            type: 'DELETE',
            record: payload.old as Interview,
          });
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};

/**
 * Subscribe to consultant changes in real-time
 */
export const subscribeToConsultants = (
  userId: string,
  onUpdate: (update: RealtimeUpdate<Consultant>) => void
): (() => void) => {
  const channel = supabase
    .channel(`consultants:${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'consultants',
        filter: `user_id=eq.${userId}`,
      },
      (payload: any) => {
        if (payload.eventType === 'INSERT') {
          onUpdate({
            type: 'INSERT',
            record: payload.new as Consultant,
          });
        } else if (payload.eventType === 'UPDATE') {
          onUpdate({
            type: 'UPDATE',
            record: payload.new as Consultant,
          });
        } else if (payload.eventType === 'DELETE') {
          onUpdate({
            type: 'DELETE',
            record: payload.old as Consultant,
          });
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};

/**
 * Subscribe to ALL requirement changes (admin view)
 * Listens to all requirements regardless of user_id
 */
export const subscribeToAllRequirements = (
  onUpdate: (update: RealtimeUpdate<Requirement>) => void
): (() => void) => {
  const channel = supabase
    .channel(`all-requirements`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'requirements',
      },
      (payload: any) => {
        if (payload.eventType === 'INSERT') {
          onUpdate({
            type: 'INSERT',
            record: payload.new as Requirement,
          });
        } else if (payload.eventType === 'UPDATE') {
          onUpdate({
            type: 'UPDATE',
            record: payload.new as Requirement,
          });
        } else if (payload.eventType === 'DELETE') {
          onUpdate({
            type: 'DELETE',
            record: payload.old as Requirement,
          });
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};

/**
 * Subscribe to ALL interview changes (admin view)
 */
export const subscribeToAllInterviews = (
  onUpdate: (update: RealtimeUpdate<Interview>) => void
): (() => void) => {
  const channel = supabase
    .channel(`all-interviews`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'interviews',
      },
      (payload: any) => {
        if (payload.eventType === 'INSERT') {
          onUpdate({
            type: 'INSERT',
            record: payload.new as Interview,
          });
        } else if (payload.eventType === 'UPDATE') {
          onUpdate({
            type: 'UPDATE',
            record: payload.new as Interview,
          });
        } else if (payload.eventType === 'DELETE') {
          onUpdate({
            type: 'DELETE',
            record: payload.old as Interview,
          });
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};

/**
 * Subscribe to ALL consultant changes (admin view)
 */
export const subscribeToAllConsultants = (
  onUpdate: (update: RealtimeUpdate<Consultant>) => void
): (() => void) => {
  const channel = supabase
    .channel(`all-consultants`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'consultants',
      },
      (payload: any) => {
        if (payload.eventType === 'INSERT') {
          onUpdate({
            type: 'INSERT',
            record: payload.new as Consultant,
          });
        } else if (payload.eventType === 'UPDATE') {
          onUpdate({
            type: 'UPDATE',
            record: payload.new as Consultant,
          });
        } else if (payload.eventType === 'DELETE') {
          onUpdate({
            type: 'DELETE',
            record: payload.old as Consultant,
          });
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};

/**
 * Subscribe to a specific requirement by ID (for detail modals)
 */
export const subscribeToRequirementById = (
  id: string,
  onUpdate: (update: RealtimeUpdate<Requirement>) => void
): (() => void) => {
  const channel = supabase
    .channel(`requirement:${id}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'requirements',
        filter: `id=eq.${id}`,
      },
      (payload: any) => {
        if (payload.eventType === 'UPDATE') {
          onUpdate({
            type: 'UPDATE',
            record: payload.new as Requirement,
          });
        } else if (payload.eventType === 'DELETE') {
          onUpdate({
            type: 'DELETE',
            record: payload.old as Requirement,
          });
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};

/**
 * Subscribe to a specific interview by ID (for detail modals)
 */
export const subscribeToInterviewById = (
  id: string,
  onUpdate: (update: RealtimeUpdate<Interview>) => void
): (() => void) => {
  const channel = supabase
    .channel(`interview:${id}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'interviews',
        filter: `id=eq.${id}`,
      },
      (payload: any) => {
        onUpdate({
          type: 'UPDATE',
          record: payload.new as Interview,
        });
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};

/**
 * Subscribe to a specific consultant by ID (for detail modals)
 */
export const subscribeToConsultantById = (
  id: string,
  onUpdate: (update: RealtimeUpdate<Consultant>) => void
): (() => void) => {
  const channel = supabase
    .channel(`consultant:${id}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'consultants',
        filter: `id=eq.${id}`,
      },
      (payload: any) => {
        if (payload.eventType === 'UPDATE') {
          onUpdate({
            type: 'UPDATE',
            record: payload.new as Consultant,
          });
        } else if (payload.eventType === 'DELETE') {
          onUpdate({
            type: 'DELETE',
            record: payload.old as Consultant,
          });
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};
