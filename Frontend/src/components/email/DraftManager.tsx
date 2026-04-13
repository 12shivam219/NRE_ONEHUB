import { useState, useEffect } from 'react';
import {
  Stack,
  Paper,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Tooltip,
} from '@mui/material';
import { Save, Trash2 } from 'lucide-react';

export interface EmailDraft {
  id: string;
  subject: string;
  body: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  attachments?: string[]; // File names
  createdAt: string;
  updatedAt: string;
}

interface DraftManagerProps {
  drafts: EmailDraft[];
  currentDraft: Partial<EmailDraft>;
  onDraftsChange: (drafts: EmailDraft[]) => void;
  onDraftSelect?: (draft: EmailDraft) => void;
  onDraftDelete?: (id: string) => void;
  autoSaveEnabled?: boolean;
  autoSaveInterval?: number; // ms
}

export const DraftManager = ({
  drafts,
  currentDraft,
  onDraftsChange,
  onDraftSelect,
  onDraftDelete,
  autoSaveEnabled = true,
  autoSaveInterval = 30000, // 30 seconds
}: DraftManagerProps) => {
  const [showDialog, setShowDialog] = useState(false);
  const [lastAutoSave, setLastAutoSave] = useState<Date | null>(null);
  const [showAutoSaveIndicator, setShowAutoSaveIndicator] = useState(false);

  // Auto-save draft periodically
  useEffect(() => {
    if (!autoSaveEnabled || !currentDraft.body || !currentDraft.subject) {
      return;
    }

    const autoSaveTimer = setInterval(() => {
      // Find or create draft named "Auto-save"
      const existingDraft = drafts.find(d => d.subject === '[AUTO-SAVE]');
      
      if (existingDraft) {
        // Update existing
        onDraftsChange(
          drafts.map(d =>
            d.id === existingDraft!.id
              ? {
                ...d,
                ...currentDraft,
                updatedAt: new Date().toISOString(),
              }
              : d
          )
        );
      } else if (currentDraft.to && currentDraft.to.length > 0) {
        // Create new
        const newDraft: EmailDraft = {
          id: `draft-${Date.now()}`,
          subject: '[AUTO-SAVE]',
          body: currentDraft.body || '',
          to: currentDraft.to || [],
          cc: currentDraft.cc || [],
          bcc: currentDraft.bcc || [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        onDraftsChange([...drafts, newDraft]);
      }

      setLastAutoSave(new Date());
      setShowAutoSaveIndicator(true);
      setTimeout(() => setShowAutoSaveIndicator(false), 2000);
    }, autoSaveInterval);

    return () => clearInterval(autoSaveTimer);
  }, [autoSaveEnabled, currentDraft, drafts, onDraftsChange, autoSaveInterval]);

  // Format time
  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  // Save as draft manually
  const handleSaveDraft = () => {
    if (!currentDraft.body || !currentDraft.subject || !currentDraft.to?.length) {
      return;
    }

    const newDraft: EmailDraft = {
      id: `draft-${Date.now()}`,
      subject: currentDraft.subject,
      body: currentDraft.body,
      to: currentDraft.to || [],
      cc: currentDraft.cc || [],
      bcc: currentDraft.bcc || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onDraftsChange([...drafts, newDraft]);
    setShowDialog(false);
  };

  // Delete draft
  const handleDeleteDraft = (id: string) => {
    onDraftsChange(drafts.filter(d => d.id !== id));
    if (onDraftDelete) {
      onDraftDelete(id);
    }
  };

  // Restore draft
  const handleRestoreDraft = (draft: EmailDraft) => {
    if (onDraftSelect) {
      onDraftSelect(draft);
    }
  };

  // Get draft count excluding auto-save
  const userDrafts = drafts.filter(d => d.subject !== '[AUTO-SAVE]');
  const autoSaveDraft = drafts.find(d => d.subject === '[AUTO-SAVE]');

  return (
    <>
      <Paper
        variant="outlined"
        sx={{
          p: 2,
          bgcolor: 'background.paper',
          borderColor: '#E5E7EB',
        }}
      >
        <Stack spacing={2}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              Drafts & Auto-save
            </Typography>
            <Button
              size="small"
              variant="contained"
              startIcon={<Save className="w-4 h-4" />}
              onClick={() => setShowDialog(true)}
              disabled={!currentDraft.body || !currentDraft.subject}
            >
              Save Draft
            </Button>
          </Stack>

          {/* Auto-save Status */}
          {autoSaveEnabled && (
            <Paper
              sx={{
                p: 1.5,
                bgcolor: 'rgba(59,130,246,0.05)',
                borderColor: 'rgba(59,130,246,0.2)',
                border: '1px solid',
              }}
            >
              <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="h6">💾</Typography>
                  <Stack spacing={0.25}>
                    <Typography variant="caption" sx={{ fontWeight: 600 }}>
                      Auto-save: <span style={{ color: showAutoSaveIndicator ? '#2563EB' : '#64748B' }}>
                        {showAutoSaveIndicator ? '✓ Saved' : 'Enabled'}
                      </span>
                    </Typography>
                    {lastAutoSave && (
                      <Typography variant="caption" color="text.secondary">
                        Last saved {formatTime(lastAutoSave.toISOString())}
                      </Typography>
                    )}
                  </Stack>
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  Every {autoSaveInterval / 1000}s
                </Typography>
              </Stack>
            </Paper>
          )}

          {/* Auto-save Draft */}
          {autoSaveDraft && (
            <Paper
              sx={{
                p: 1.5,
                bgcolor: 'rgba(59,130,246,0.05)',
                borderColor: '#E5E7EB',
                border: '1px solid',
              }}
            >
              <Stack spacing={1}>
                <Stack direction="row" justifyContent="space-between" alignItems="start">
                  <Stack sx={{ flex: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      Auto-saved Draft
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      To: {autoSaveDraft.to.join(', ')}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {autoSaveDraft.body.substring(0, 80)}...
                    </Typography>
                  </Stack>
                  <Stack direction="row" spacing={0.5}>
                    <Tooltip title="Restore">
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => handleRestoreDraft(autoSaveDraft)}
                      >
                        ↶ Restore
                      </Button>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton
                        size="small"
                        onClick={() => handleDeleteDraft(autoSaveDraft.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  Updated {formatTime(autoSaveDraft.updatedAt)}
                </Typography>
              </Stack>
            </Paper>
          )}

          {/* User Drafts */}
          {userDrafts.length > 0 ? (
            <Stack spacing={1}>
              <Typography variant="caption" sx={{ fontWeight: 600 }}>
                Saved Drafts ({userDrafts.length})
              </Typography>
              {userDrafts.map(draft => (
                <Paper
                  key={draft.id}
                  variant="outlined"
                  sx={{
                    p: 1.5,
                    bgcolor: '#F8F9FA',
                    borderColor: '#E5E7EB',
                  }}
                >
                  <Stack direction="row" justifyContent="space-between" alignItems="start">
                    <Stack sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {draft.subject}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        To: {draft.to.join(', ')}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                      >
                        {draft.body.substring(0, 60)}...
                      </Typography>
                    </Stack>

                    <Stack direction="row" spacing={0.5}>
                      <Tooltip title="Restore">
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => handleRestoreDraft(draft)}
                        >
                          ↶ Restore
                        </Button>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton
                          size="small"
                          onClick={() => handleDeleteDraft(draft.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </Stack>

                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                    {formatTime(draft.updatedAt)}
                  </Typography>
                </Paper>
              ))}
            </Stack>
          ) : (
            <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
              {autoSaveDraft ? 'No manually saved drafts yet' : 'No drafts yet'}
            </Typography>
          )}
        </Stack>
      </Paper>

      {/* Save Dialog */}
      <Dialog open={showDialog} onClose={() => setShowDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Save Draft</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2">
              Recipients: {currentDraft.to?.join(', ')}
            </Typography>
            <Typography variant="body2">
              Subject: {currentDraft.subject}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>
              {(currentDraft.body || '').substring(0, 200)}
              {(currentDraft.body || '').length > 200 ? '...' : ''}
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowDialog(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSaveDraft}
          >
            Save Draft
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
