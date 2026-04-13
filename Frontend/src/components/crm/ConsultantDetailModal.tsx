import { useState, useEffect } from 'react';
import { X, Edit2, Trash2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { updateConsultant, deleteConsultant } from '../../lib/api/consultants';
import { useToast } from '../../contexts/ToastContext';
import { ResourceAuditTimeline } from '../common/ResourceAuditTimeline';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { LogoLoader } from '../common/LogoLoader';
import { subscribeToConsultantById, type RealtimeUpdate } from '../../lib/api/realtimeSync';
import type { Database } from '../../lib/database.types';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';

type Consultant = Database['public']['Tables']['consultants']['Row'];

interface ConsultantDetailModalProps {
  isOpen: boolean;
  consultant: Consultant | null;
  onClose: () => void;
  onUpdate: () => void;
  createdBy?: string | null;
  updatedBy?: string | null;
}

export const ConsultantDetailModal = ({
  isOpen,
  consultant,
  onClose,
  onUpdate,
}: ConsultantDetailModalProps) => {
  const { user, isAdmin } = useAuth();
  const { showToast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState<Partial<Consultant> | null>(null);
  const [remoteUpdateNotified, setRemoteUpdateNotified] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (!consultant) return;

    let cancelled = false;

    const run = async () => {
      await Promise.resolve();
      if (cancelled) return;
      setFormData(consultant);
      setIsEditing(false);
      setRemoteUpdateNotified(false);
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [consultant, isOpen]);

  // Subscribe to real-time updates for this specific consultant
  useEffect(() => {
    if (!isOpen || !consultant) return;

    const unsubscribe = subscribeToConsultantById(consultant.id, (update: RealtimeUpdate<Consultant>) => {
      // Handle DELETE - close modal when consultant is deleted
      if (update.type === 'DELETE') {
        showToast({
          type: 'warning',
          title: 'Consultant Deleted',
          message: 'This consultant has been deleted.',
        });
        onClose();
        return;
      }

      // Handle UPDATE - refresh form data
      if (!isEditing && update.type === 'UPDATE') {
        setFormData(update.record);
        
        // Show notification if another user made changes
        if (!remoteUpdateNotified) {
          showToast({
            type: 'info',
            title: 'Updated',
            message: 'This consultant was updated by another user. Changes are reflected below.',
          });
          setRemoteUpdateNotified(true);
        }
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, [isOpen, consultant, isEditing, remoteUpdateNotified, showToast, onClose]);

  if (!isOpen || !consultant || !formData) return null;

  const handleFieldChange = (key: keyof Consultant, value: unknown) => {
    setFormData(prev => prev ? { ...prev, [key]: value } : null);
  };

  const handleSave = async () => {
    if (!user) return;
    
    // Store original data for rollback in case of error
    const originalFormData = formData;
    
    setIsLoading(true);

    const result = await updateConsultant(
      consultant.id,
      formData as Partial<Consultant>,
      user.id
    );

    if (result.success) {
      showToast({
        type: 'success',
        title: 'Consultant updated',
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
        message: 'Only admins can delete consultants.',
      });
      return;
    }
    setShowDeleteConfirm(true);
  };

  const handleDelete = async () => {
    if (!consultant) return;
    setIsDeleting(true);
    const result = await deleteConsultant(consultant.id, user?.id);

    if (result.success) {
      showToast({
        type: 'success',
        title: 'Consultant deleted',
        message: 'The consultant has been removed.',
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
    setShowDeleteConfirm(false);
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
      <DialogTitle sx={{ pr: 7, fontWeight: 800 }}>
        {isEditing ? 'Edit Consultant' : 'Consultant Details'}
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
        <Stack spacing={3} sx={{ p: 3 }}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
              gap: 2,
            }}
          >
            {isEditing ? (
              <TextField
                label="Name"
                value={formData.name || ''}
                onChange={(e) => handleFieldChange('name', e.target.value)}
                size="small"
                fullWidth
              />
            ) : (
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500, textTransform: 'uppercase' }}>
                  Name
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 700 }}>
                  {formData.name || '-'}
                </Typography>
              </Box>
            )}

            {isEditing ? (
              <TextField
                select
                label="Status"
                value={String(formData.status || 'Active')}
                onChange={(e) => handleFieldChange('status', e.target.value)}
                size="small"
                fullWidth
              >
                <MenuItem value="Active">Active</MenuItem>
                <MenuItem value="Not Active">Not Active</MenuItem>
                <MenuItem value="Recently Placed">Recently Placed</MenuItem>
              </TextField>
            ) : (
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500, textTransform: 'uppercase' }}>
                  Status
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {String(formData.status || '-')}
                </Typography>
              </Box>
            )}

            {isEditing ? (
              <TextField
                label="Email"
                type="email"
                value={formData.email || ''}
                onChange={(e) => handleFieldChange('email', e.target.value)}
                size="small"
                fullWidth
              />
            ) : (
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500, textTransform: 'uppercase' }}>
                  Email
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {String(formData.email || '-')}
                </Typography>
              </Box>
            )}

            {isEditing ? (
              <TextField
                label="Phone"
                type="tel"
                value={formData.phone || ''}
                onChange={(e) => handleFieldChange('phone', e.target.value)}
                size="small"
                fullWidth
              />
            ) : (
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500, textTransform: 'uppercase' }}>
                  Phone
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {String(formData.phone || '-')}
                </Typography>
              </Box>
            )}

            {isEditing ? (
              <TextField
                label="Location"
                value={formData.location || ''}
                onChange={(e) => handleFieldChange('location', e.target.value)}
                size="small"
                fullWidth
              />
            ) : (
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500, textTransform: 'uppercase' }}>
                  Location
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {String(formData.location || '-')}
                </Typography>
              </Box>
            )}

            {isEditing ? (
              <TextField
                label="Total Experience"
                value={formData.total_experience || ''}
                onChange={(e) => handleFieldChange('total_experience', e.target.value)}
                size="small"
                fullWidth
              />
            ) : (
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500, textTransform: 'uppercase' }}>
                  Total Experience
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {String(formData.total_experience || '-')}
                </Typography>
              </Box>
            )}

            <Box sx={{ gridColumn: { xs: 'auto', md: '1 / -1' } }}>
              {isEditing ? (
                <TextField
                  label="Primary Skills"
                  value={formData.primary_skills || ''}
                  onChange={(e) => handleFieldChange('primary_skills', e.target.value)}
                  size="small"
                  fullWidth
                  multiline
                  rows={2}
                />
              ) : (
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500, textTransform: 'uppercase' }}>
                    Primary Skills
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {String(formData.primary_skills || '-')}
                  </Typography>
                </Box>
              )}
            </Box>

            <Box sx={{ gridColumn: { xs: 'auto', md: '1 / -1' } }}>
              {isEditing ? (
                <TextField
                  label="Secondary Skills"
                  value={formData.secondary_skills || ''}
                  onChange={(e) => handleFieldChange('secondary_skills', e.target.value)}
                  size="small"
                  fullWidth
                  multiline
                  rows={2}
                />
              ) : (
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500, textTransform: 'uppercase' }}>
                    Secondary Skills
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {String(formData.secondary_skills || '-')}
                  </Typography>
                </Box>
              )}
            </Box>

            {isEditing ? (
              <TextField
                label="LinkedIn Profile"
                type="url"
                value={formData.linkedin_profile || ''}
                onChange={(e) => handleFieldChange('linkedin_profile', e.target.value)}
                size="small"
                fullWidth
              />
            ) : (
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500, textTransform: 'uppercase' }}>
                  LinkedIn Profile
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {formData.linkedin_profile ? (
                    <a href={formData.linkedin_profile} target="_blank" rel="noopener noreferrer">
                      View Profile
                    </a>
                  ) : (
                    '-'
                  )}
                </Typography>
              </Box>
            )}

            {isEditing ? (
              <TextField
                label="Expected Rate"
                value={formData.expected_rate || ''}
                onChange={(e) => handleFieldChange('expected_rate', e.target.value)}
                size="small"
                fullWidth
              />
            ) : (
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500, textTransform: 'uppercase' }}>
                  Expected Rate
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {String(formData.expected_rate || '-')}
                </Typography>
              </Box>
            )}
          </Box>

          {/* Audit Log - Admin Only */}
          {isAdmin && (
            <ResourceAuditTimeline
              resourceType="consultant"
              resourceId={consultant.id}
              title="Recent admin + CRM actions"
            />
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
                setFormData(consultant);
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
        title="Delete Consultant"
        message={`Are you sure you want to delete ${consultant?.name || 'this consultant'}? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={isDeleting}
      />
    </Dialog>
  );
};
