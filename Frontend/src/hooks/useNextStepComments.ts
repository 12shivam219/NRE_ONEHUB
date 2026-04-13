import { useEffect, useState, useCallback } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '../lib/supabase';

export interface NextStepComment {
  id: string;
  requirement_id: string;
  user_id: string;
  comment_text: string;
  created_at: string;
  updated_at: string;
  user?: {
    email: string;
    full_name: string;
  };
}

export interface UseNextStepCommentsReturn {
  comments: NextStepComment[];
  isLoading: boolean;
  error: string | null;
  addComment: (commentText: string) => Promise<void>;
  deleteComment: (commentId: string) => Promise<void>;
  isAdding: boolean;
}

export const useNextStepComments = (requirementId: string): UseNextStepCommentsReturn => {
  const { user } = useAuth();
  const [comments, setComments] = useState<NextStepComment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch comments
  const fetchComments = useCallback(async () => {
    if (!requirementId) return;

    try {
      setIsLoading(true);
      setError(null);

      interface CommentRow {
        id: string;
        requirement_id: string;
        user_id: string;
        comment_text: string;
        created_at: string;
        updated_at: string;
      }

      const { data, error: fetchError } = await supabase
        .from('next_step_comments')
        .select('*')
        .eq('requirement_id', requirementId)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      // Fetch user info for all comments
      const userIds = [...new Set((data || []).map((c: CommentRow) => c.user_id))];
      const userMap: Record<string, { email: string; full_name: string }> = {};

      if (userIds.length > 0) {
        const { data: usersData } = await supabase
          .from('users')
          .select('id, email, full_name')
          .in('id', userIds);

        if (usersData) {
          usersData.forEach((user: { id: string; email: string; full_name: string }) => {
            userMap[user.id] = { email: user.email, full_name: user.full_name };
          });
        }
      }

      // Map the response to include user info
      const mappedData = ((data || []) as CommentRow[]).map((comment) => ({
        ...comment,
        user: userMap[comment.user_id] || { email: '', full_name: '' },
      }));

      setComments(mappedData);
    } catch (err) {
      console.error('Failed to fetch next step comments:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch comments');
    } finally {
      setIsLoading(false);
    }
  }, [requirementId]);

  // Initial fetch
  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  // Subscribe to real-time updates
  useEffect(() => {
    if (!requirementId) return;

    const subscription = supabase
      .channel(`next_step_comments:${requirementId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'next_step_comments',
          filter: `requirement_id=eq.${requirementId}`,
        },
        () => {
          fetchComments();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [requirementId, fetchComments]);

  // Add comment
  const addComment = useCallback(
    async (commentText: string) => {
      if (!requirementId || !commentText.trim() || !user) {
        setError('Missing required information');
        return;
      }

      try {
        setIsAdding(true);
        setError(null);

        const { error: insertError } = await supabase
          .from('next_step_comments')
          .insert([
            {
              requirement_id: requirementId,
              user_id: user.id,
              comment_text: commentText.trim(),
            },
          ]);

        if (insertError) throw insertError;

        // Refetch comments to get the latest data
        await fetchComments();
      } catch (err) {
        console.error('Failed to add comment:', err);
        setError(err instanceof Error ? err.message : 'Failed to add comment');
        throw err;
      } finally {
        setIsAdding(false);
      }
    },
    [requirementId, user, fetchComments]
  );

  // Delete comment
  const deleteComment = useCallback(
    async (commentId: string) => {
      try {
        setError(null);

        const { error: deleteError } = await supabase
          .from('next_step_comments')
          .delete()
          .eq('id', commentId)
          .eq('user_id', user?.id); // Only allow deletion of own comments

        if (deleteError) throw deleteError;

        // Update local state
        setComments((prev) => prev.filter((comment) => comment.id !== commentId));
      } catch (err) {
        console.error('Failed to delete comment:', err);
        setError(err instanceof Error ? err.message : 'Failed to delete comment');
        throw err;
      }
    },
    [user?.id]
  );

  return {
    comments,
    isLoading,
    error,
    addComment,
    deleteComment,
    isAdding,
  };
};
