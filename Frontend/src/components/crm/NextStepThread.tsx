import React, { useState } from 'react';
import { Trash2, Send } from 'lucide-react';
import { useNextStepComments, NextStepComment } from '../../hooks/useNextStepComments';
import { useAuth } from '../../hooks/useAuth';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';

interface NextStepThreadProps {
  requirementId: string;
  readOnly?: boolean;
}

const NextStepThread: React.FC<NextStepThreadProps> = ({ requirementId, readOnly = false }) => {
  const { user } = useAuth();
  const { comments, isLoading, error, addComment, deleteComment, isAdding } =
    useNextStepComments(requirementId);
  const [commentText, setCommentText] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;

    try {
      setDeleteError(null);
      await addComment(commentText);
      setCommentText('');
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to add comment');
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!window.confirm('Are you sure you want to delete this comment?')) return;

    try {
      setDeleteError(null);
      await deleteComment(commentId);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete comment');
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const isToday = date.toDateString() === today.toDateString();
    const isYesterday = date.toDateString() === yesterday.toDateString();

    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (isYesterday) {
      return 'Yesterday ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <CircularProgress size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Error messages */}
      {error && (
        <Alert severity="error" className="text-sm">
          {error}
        </Alert>
      )}
      {deleteError && (
        <Alert severity="error" className="text-sm">
          {deleteError}
        </Alert>
      )}

      {/* Comments List */}
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {comments.length === 0 ? (
          <div className="text-center py-8 text-[color:var(--text-secondary)]">
            <p className="text-sm">No next steps added yet</p>
          </div>
        ) : (
          comments.map((comment: NextStepComment) => (
            <div
              key={comment.id}
              className="bg-[color:var(--darkbg-surface-light)] rounded-lg p-3 border border-[color:var(--gold)] border-opacity-10"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-[color:var(--gold)]">
                      {comment.user?.full_name || comment.user?.email || 'Unknown User'}
                    </span>
                    <span className="text-xs text-[color:var(--text-secondary)]">
                      {formatDate(comment.created_at)}
                    </span>
                  </div>
                  <p className="text-sm text-[color:var(--text-primary)] break-words whitespace-pre-wrap">
                    {comment.comment_text}
                  </p>
                </div>

                {/* Delete button - only show for comment owner or if in edit mode */}
                {!readOnly && user?.id === comment.user_id && (
                  <button
                    onClick={() => handleDeleteComment(comment.id)}
                    className="p-1 hover:bg-red-500 hover:bg-opacity-20 rounded-lg transition-colors flex-shrink-0"
                    title="Delete comment"
                    aria-label="Delete comment"
                  >
                    <Trash2 className="w-3 h-3 text-red-500" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Comment Form - only show if not read-only */}
      {!readOnly && (
        <form onSubmit={handleAddComment} className="space-y-2">
          <textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Add a next step..."
            className="w-full px-3 py-2 rounded-lg border border-[color:var(--gold)] border-opacity-20 bg-[color:var(--darkbg-surface-light)] text-[color:var(--text-primary)] placeholder-[color:var(--text-secondary)] focus:outline-none focus:border-opacity-50 focus:ring-1 focus:ring-[color:var(--gold)] focus:ring-opacity-50 text-sm resize-none"
            rows={2}
            disabled={isAdding}
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!commentText.trim() || isAdding}
              className="flex items-center gap-2 px-3 py-2 bg-[color:var(--gold)] text-[color:var(--darkbg-primary)] rounded-lg hover:bg-opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity text-sm font-medium"
            >
              {isAdding ? (
                <CircularProgress size={14} sx={{ color: 'inherit' }} />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {isAdding ? 'Adding...' : 'Add Step'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default NextStepThread;
