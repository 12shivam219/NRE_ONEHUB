import { useState, useEffect } from 'react';
import { X, Edit2, Trash2, ExternalLink, MapPin } from 'lucide-react';
import { isValidUrl, isMeetingLink, extractDomainFromUrl } from '../../lib/interviewValidation';
import { useAuth } from '../../hooks/useAuth';
import { updateInterview, deleteInterview } from '../../lib/api/interviews';
import { useToast } from '../../contexts/ToastContext';
import { ResourceAuditTimeline } from '../common/ResourceAuditTimeline';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { LogoLoader } from '../common/LogoLoader';
import { subscribeToInterviewById, type RealtimeUpdate } from '../../lib/api/realtimeSync';
import { safeOpenUrl } from '../../lib/safeRedirect';
import type { Database } from '../../lib/database.types';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { alpha } from '@mui/material/styles';

type Interview = Database['public']['Tables']['interviews']['Row'];

interface InterviewDetailModalProps {
  isOpen: boolean;
  interview: Interview | null;
  onClose: () => void;
  onUpdate: () => void;
  createdBy?: string | null;
  updatedBy?: string | null;
}

const EditableField = ({ label, value, isEditing, children }: { 
  label: string; 
  value: string | number | null | undefined; 
  isEditing: boolean;
  children?: React.ReactNode;
}) => (
  <Stack spacing={0.5}>
    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500, textTransform: 'uppercase' }}>
      {label}
    </Typography>
    {isEditing && children ? (
      children
    ) : (
      <Typography variant="body2" sx={{ fontWeight: 500 }}>
        {value || '-'}
      </Typography>
    )}
  </Stack>
);

const AccordionSection = ({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) => {
  const [expanded, setExpanded] = useState(defaultOpen);
  return (
    <Accordion
      expanded={expanded}
      onChange={(_, next) => setExpanded(next)}
      disableGutters
      elevation={0}
      variant="outlined"
      sx={{ borderRadius: 2, overflow: 'hidden' }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="subtitle2" sx={{ fontWeight: 500 }}>
          {title}
        </Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={2}>
          {children}
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
};

export const InterviewDetailModal = ({
  isOpen,
  interview,
  onClose,
  onUpdate,
}: InterviewDetailModalProps) => {
  const { user, isAdmin } = useAuth();
  const { showToast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState<Partial<Interview> | null>(null);
  const [remoteUpdateNotified, setRemoteUpdateNotified] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (!interview) return;
    if (isEditing) return;

    let cancelled = false;

    const run = async () => {
      await Promise.resolve();
      if (cancelled) return;
      setFormData(interview);
      setRemoteUpdateNotified(false);
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [interview, isEditing]);

  // Subscribe to real-time updates for this specific interview
  useEffect(() => {
    if (!isOpen || !interview) return;

    const unsubscribe = subscribeToInterviewById(interview.id, (update: RealtimeUpdate<Interview>) => {
      // Only update if not currently editing
      if (!isEditing && update.type === 'UPDATE') {
        setFormData(update.record);
        
        // Show notification if another user made changes
        if (!remoteUpdateNotified) {
          showToast({
            type: 'info',
            title: 'Updated',
            message: 'This interview was updated by another user. Changes are reflected below.',
          });
          setRemoteUpdateNotified(true);
        }
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, [isOpen, interview, isEditing, remoteUpdateNotified, showToast]);

  if (!isOpen || !interview || !formData) return null;

  // Get valid status options
  const getValidStatuses = () => {
    // When editing, allow changing to any status
    const allStatuses = ['Pending', 'Scheduled', 'Confirmed', 'Completed', 'Cancelled', 'Re-Scheduled', 'No Show'];
    return allStatuses;
  };

  const handleFieldChange = (key: keyof Interview, value: unknown) => {
    setFormData(prev => prev ? { ...prev, [key]: value } : null);
  };

  const handleSave = async () => {
    if (!user) return;
    
    // Store original data for rollback in case of error
    const originalFormData = formData;
    
    setIsLoading(true);

    const result = await updateInterview(
      interview.id,
      formData as Partial<Interview>,
      user?.id
    );

    if (result.success) {
      showToast({
        type: 'success',
        title: 'Interview updated',
        message: 'Changes have been saved successfully.',
      });
      setIsEditing(false);
      onUpdate();
    } else if (result.error) {
      // Rollback on error
      setFormData(originalFormData);
      showToast({
        type: 'error',
        title: 'Failed to update',
        message: result.error,
      });
    }
    setIsLoading(false);
  };

  const handleDeleteClick = () => {
    if (!isAdmin) {
      showToast({
        type: 'error',
        title: 'Permission denied',
        message: 'Only admins can delete interviews.',
      });
      return;
    }
    setShowDeleteConfirm(true);
  };

  const handleDelete = async () => {
    if (!interview) return;
    setIsDeleting(true);
    const result = await deleteInterview(interview.id, user?.id);

    if (result.success) {
      showToast({
        type: 'success',
        title: 'Interview deleted',
        message: 'The interview has been removed.',
      });
      onUpdate();
      onClose();
    } else if (result.error) {
      showToast({
        type: 'error',
        title: 'Failed to delete',
        message: result.error,
      });
    }
    setIsDeleting(false);
  };

  // Meeting link detection and join handler
  const isMeetingUrl = formData.location ? isValidUrl(formData.location as string) && isMeetingLink(formData.location as string) : false;
  const domainName = formData.location ? extractDomainFromUrl(formData.location as string) : null;
  const getMeetingProvider = (url?: string) => {
    if (!url) return null;
    const s = url.toLowerCase();
    if (s.includes('meet.google.com') || s.includes('google.com')) return 'Google Meet';
    if (s.includes('teams.microsoft.com') || s.includes('microsoft.com') || s.includes('/l/meetup-join')) return 'Microsoft Teams';
    if (s.includes('zoom.us') || s.includes('zoom')) return 'Zoom';
    if (s.includes('webex')) return 'Webex';
    if (s.includes('bluejeans')) return 'BlueJeans';
    return domainName || 'Meeting';
  };
  const meetingProvider = getMeetingProvider(formData.location as string | undefined);

  const handleJoinCall = () => {
    if (isMeetingUrl && formData.location) {
      const ok = safeOpenUrl(formData.location as string, '_blank', 'noopener,noreferrer');
      if (ok) {
        showToast({ type: 'success', title: 'Joining Call', message: `Opening ${meetingProvider}` });
      } else {
        showToast({ type: 'error', title: 'Blocked Link', message: 'This meeting link is not allowed.' });
      }
    }
  };

  return (
    <Dialog
      open={isOpen}
      onClose={() => {
        setIsEditing(false);
        onClose();
      }}
      fullWidth
      maxWidth="md"
      scroll="paper"
    >
      <DialogTitle sx={{ pr: 7 }}>
        <Stack direction="row" spacing={2} alignItems="center" sx={{ minWidth: 0 }}>
          <Chip
            label={(formData.interview_with?.charAt(0)?.toUpperCase() || 'A')}
            sx={{ bgcolor: 'primary.light', color: 'text.primary', fontWeight: 500, border: 1, borderColor: 'primary.main' }}
          />
          <Stack spacing={0.25} sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 500 }} noWrap>
              {formData.interview_with || 'Interview'}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
              {formData.scheduled_date || '-'} • {formData.scheduled_time || '-'}
            </Typography>
          </Stack>
        </Stack>
        <IconButton
          onClick={() => {
            setIsEditing(false);
            onClose();
          }}
          aria-label="Close"
          sx={{ position: 'absolute', right: 8, top: 8 }}
        >
          <X className="w-5 h-5" />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={2}>
          {/* Schedule Information - Always Visible */}
          <AccordionSection title="Schedule & Status" defaultOpen={true}>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                gap: 2,
              }}
            >
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500, textTransform: 'uppercase' }}>
                  Date
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>
                  {formData.scheduled_date || '-'}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500, textTransform: 'uppercase' }}>
                  Time
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
                  {formData.scheduled_time || '-'} {formData.timezone && `(${formData.timezone})`}
                </Typography>
              </Box>

              <Box sx={{ gridColumn: { xs: 'auto', sm: '1 / -1' } }}>
                {isEditing ? (
                  <TextField
                    select
                    label="Status"
                    value={String(formData.status || 'Scheduled')}
                    onChange={(e) => handleFieldChange('status', e.target.value)}
                    size="small"
                    fullWidth
                  >
                    {getValidStatuses().map((status) => (
                      <MenuItem key={status} value={status}>
                        {status}
                      </MenuItem>
                    ))}
                  </TextField>
                ) : (
                  <Stack spacing={0.5}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500, textTransform: 'uppercase' }}>
                      Status
                    </Typography>
                    <Box>
                      <Chip label={String(formData.status || '-')} color="primary" variant="outlined" />
                    </Box>
                  </Stack>
                )}
              </Box>
            </Box>
          </AccordionSection>

          {/* Meeting Link */}
          {formData.location && (
            <Paper
              variant="outlined"
              sx={{
                p: 2,
                bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
                borderColor: (theme) => alpha(theme.palette.primary.main, 0.30),
              }}
            >
              <Stack direction="row" spacing={1.5} alignItems="flex-start">
                <MapPin className="w-5 h-5" />
                <Stack spacing={0.5} sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="caption" sx={{ fontWeight: 500, textTransform: 'uppercase' }}>
                    Meeting Link
                  </Typography>
                  {isMeetingUrl ? (
                    <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" useFlexGap flexWrap="wrap">
                      <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>
                        {meetingProvider}
                      </Typography>
                      <Button
                        variant="contained"
                        color="primary"
                        size="small"
                        onClick={handleJoinCall}
                        startIcon={<ExternalLink className="w-4 h-4" />}
                      >
                        Join
                      </Button>
                    </Stack>
                  ) : (
                    <Typography variant="body2" noWrap>
                      {String(formData.location)}
                    </Typography>
                  )}
                </Stack>
              </Stack>
            </Paper>
          )}

          {/* Interview Details */}
          <AccordionSection title="Interview Details" defaultOpen={false}>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                gap: 2,
              }}
            >
              <EditableField 
                label="Candidate Name" 
                value={formData.interview_with}
                isEditing={isEditing}
              >
                <TextField
                  value={formData.interview_with || ''}
                  onChange={(e) => handleFieldChange('interview_with', e.target.value)}
                  size="small"
                  fullWidth
                  inputProps={{ 'aria-label': 'Candidate Name' }}
                />
              </EditableField>

              <EditableField 
                label="Interview Type" 
                value={formData.type}
                isEditing={isEditing}
              >
                <TextField
                  value={formData.type || ''}
                  onChange={(e) => handleFieldChange('type', e.target.value)}
                  size="small"
                  fullWidth
                  inputProps={{ 'aria-label': 'Interview Type' }}
                />
              </EditableField>

              <EditableField 
                label="Round" 
                value={formData.round}
                isEditing={isEditing}
              >
                <TextField
                  value={formData.round || ''}
                  onChange={(e) => handleFieldChange('round', e.target.value)}
                  size="small"
                  fullWidth
                  inputProps={{ 'aria-label': 'Round' }}
                />
              </EditableField>

              <EditableField 
                label="Result" 
                value={formData.result}
                isEditing={isEditing}
              >
                <TextField
                  value={formData.result || ''}
                  onChange={(e) => handleFieldChange('result', e.target.value)}
                  size="small"
                  fullWidth
                  inputProps={{ 'aria-label': 'Result' }}
                />
              </EditableField>

              <EditableField 
                label="Duration (minutes)" 
                value={formData.duration_minutes}
                isEditing={isEditing}
              >
                <TextField
                  type="number"
                  value={String(formData.duration_minutes ?? '')}
                  onChange={(e) => handleFieldChange('duration_minutes', parseInt(e.target.value) || 0)}
                  size="small"
                  fullWidth
                  inputProps={{ 'aria-label': 'Duration (minutes)' }}
                />
              </EditableField>

              <EditableField 
                label="Mode" 
                value={formData.mode}
                isEditing={isEditing}
              >
                <TextField
                  value={formData.mode || ''}
                  onChange={(e) => handleFieldChange('mode', e.target.value)}
                  size="small"
                  fullWidth
                  inputProps={{ 'aria-label': 'Mode' }}
                />
              </EditableField>
            </Box>
          </AccordionSection>

          {/* Participants */}
          <AccordionSection title="Participants" defaultOpen={false}>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                gap: 2,
              }}
            >
              <EditableField 
                label="Interviewer" 
                value={formData.interviewer}
                isEditing={isEditing}
              >
                <TextField
                  value={formData.interviewer || ''}
                  onChange={(e) => handleFieldChange('interviewer', e.target.value)}
                  size="small"
                  fullWidth
                  inputProps={{ 'aria-label': 'Interviewer' }}
                />
              </EditableField>

              <EditableField 
                label="Vendor Company" 
                value={formData.vendor_company}
                isEditing={isEditing}
              >
                <TextField
                  value={formData.vendor_company || ''}
                  onChange={(e) => handleFieldChange('vendor_company', e.target.value)}
                  size="small"
                  fullWidth
                  inputProps={{ 'aria-label': 'Vendor Company' }}
                />
              </EditableField>
            </Box>
          </AccordionSection>

          {/* Notes & Feedback */}
          <AccordionSection title="Notes & Feedback" defaultOpen={false}>
            <Stack spacing={2}>
              <EditableField 
                label="Interview Focus" 
                value={formData.interview_focus}
                isEditing={isEditing}
              >
                <TextField
                  value={formData.interview_focus || ''}
                  onChange={(e) => handleFieldChange('interview_focus', e.target.value)}
                  size="small"
                  fullWidth
                  multiline
                  rows={2}
                  inputProps={{ 'aria-label': 'Interview Focus' }}
                />
              </EditableField>

              <EditableField 
                label="Feedback Notes" 
                value={formData.feedback_notes}
                isEditing={isEditing}
              >
                <TextField
                  value={formData.feedback_notes || ''}
                  onChange={(e) => handleFieldChange('feedback_notes', e.target.value)}
                  size="small"
                  fullWidth
                  multiline
                  rows={2}
                  inputProps={{ 'aria-label': 'Feedback Notes' }}
                />
              </EditableField>

              <EditableField 
                label="Special Notes" 
                value={formData.notes}
                isEditing={isEditing}
              >
                <TextField
                  value={formData.notes || ''}
                  onChange={(e) => handleFieldChange('notes', e.target.value)}
                  size="small"
                  fullWidth
                  multiline
                  rows={2}
                  inputProps={{ 'aria-label': 'Special Notes' }}
                />
              </EditableField>
            </Stack>
          </AccordionSection>

          {/* Audit Log - Admin Only */}
          {isAdmin && (
            <AccordionSection title="Audit Information" defaultOpen={false}>
              <ResourceAuditTimeline
                resourceType="interview"
                resourceId={interview.id}
                title="Recent admin + CRM actions"
              />
            </AccordionSection>
          )}
        </Stack>
      </DialogContent>

      <DialogActions>
        {isEditing ? (
          <>
            <Button
              variant="contained"
              color="primary"
              onClick={handleSave}
              disabled={isLoading}
              startIcon={isLoading ? <span className="w-4 h-4"><LogoLoader size="sm" /></span> : undefined}
            >
              Save Changes
            </Button>
            <Button
              variant="outlined"
              color="inherit"
              onClick={() => {
                setFormData(interview);
                setIsEditing(false);
              }}
            >
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="contained"
              color="primary"
              onClick={() => setIsEditing(true)}
              startIcon={<Edit2 className="w-4 h-4" />}
            >
              Edit
            </Button>
            {isAdmin ? (
              <Button
                variant="contained"
                color="error"
                onClick={handleDeleteClick}
                disabled={isDeleting}
                startIcon={isDeleting ? <span className="w-4 h-4"><LogoLoader size="sm" /></span> : <Trash2 className="w-4 h-4" />}
              >
                Delete
              </Button>
            ) : null}
            <Button
              variant="outlined"
              color="inherit"
              onClick={() => {
                setIsEditing(false);
                onClose();
              }}
            >
              Close
            </Button>
          </>
        )}
      </DialogActions>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="Delete Interview"
        message="Are you sure you want to delete this interview? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={isDeleting}
      />
    </Dialog>
  );
};

