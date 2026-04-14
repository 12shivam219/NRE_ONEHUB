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
import Chip from '@mui/material/Chip';
import Avatar from '@mui/material/Avatar';

type Consultant = Database['public']['Tables']['consultants']['Row'];
type Project = {
  id: string;
  name: string;
  domain: string;
  city: string;
  state: string;
  start_date: string;
  end_date: string;
  currently_working: boolean;
  description: string;
};

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
  const [projectDraft, setProjectDraft] = useState<Project>({
    id: '',
    name: '',
    domain: '',
    city: '',
    state: '',
    start_date: '',
    end_date: '',
    currently_working: false,
    description: '',
  });

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

  const parseSkills = (skills?: string | null) =>
    String(skills || '')
      .split(',')
      .map((skill) => skill.trim())
      .filter(Boolean);

  const primarySkillTags = parseSkills(formData.primary_skills as string | null | undefined);
  const secondarySkillTags = parseSkills(formData.secondary_skills as string | null | undefined);

  const inputSx = {
    '& .MuiInputLabel-root': {
      color: '#111111',
    },
    '& .MuiInputLabel-root.Mui-focused': {
      color: '#111111',
    },
    '& .MuiOutlinedInput-root': {
      borderRadius: '10px',
      backgroundColor: '#F9FAFB',
      border: '1px solid #E5E7EB',
      transition: 'all 0.2s ease',
      '& fieldset': { borderColor: '#E5E7EB' },
      '& .MuiOutlinedInput-input': {
        color: '#000000',
      },
      '& .MuiSelect-select': {
        color: '#000000',
      },
      '&:hover': {
        backgroundColor: '#F3F4F6',
        '& fieldset': { borderColor: '#D1D5DB' },
      },
      '&.Mui-focused fieldset': {
        borderColor: '#4F46E5',
      },
    },
  };

  const handleFieldChange = (key: keyof Consultant, value: unknown) => {
    setFormData(prev => prev ? { ...prev, [key]: value } : null);
  };

  const ProfileField = ({
    label,
    value,
    isLink = false,
    isMail = false,
  }: {
    label: string;
    value: string | null | undefined;
    isLink?: boolean;
    isMail?: boolean;
  }) => {
    const displayValue = value && String(value).trim() ? String(value) : '-';
    const linkHref = isMail && value ? `mailto:${value}` : value;

    return (
      <Box sx={{ minHeight: 58 }}>
        <Typography sx={{ fontSize: '0.74rem', fontWeight: 600, color: '#667085', textTransform: 'uppercase', letterSpacing: '0.04em', mb: 0.5 }}>
          {label}
        </Typography>
        {isLink && value ? (
          <Typography
            component="a"
            href={String(linkHref)}
            target={isMail ? undefined : '_blank'}
            rel={isMail ? undefined : 'noopener noreferrer'}
            sx={{ fontSize: '0.95rem', color: '#1D4ED8', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
          >
            {displayValue}
          </Typography>
        ) : (
          <Typography sx={{ fontSize: '0.96rem', color: '#101828', fontWeight: 500 }}>
            {displayValue}
          </Typography>
        )}
      </Box>
    );
  };

  const getProjects = (): Project[] => {
    const rawProjects = formData?.projects;
    if (!Array.isArray(rawProjects)) return [];

    return rawProjects.map((item, index) => {
      const project = (item ?? {}) as Record<string, unknown>;
      return {
        id: String(project.id ?? `project-${index}`),
        name: String(project.name ?? ''),
        domain: String(project.domain ?? ''),
        city: String(project.city ?? ''),
        state: String(project.state ?? ''),
        start_date: String(project.start_date ?? ''),
        end_date: String(project.end_date ?? ''),
        currently_working: Boolean(project.currently_working ?? false),
        description: String(project.description ?? ''),
      };
    });
  };

  const updateProjects = (projects: Project[]) => {
    setFormData(prev => (prev ? { ...prev, projects } : prev));
  };

  const handleProjectChange = (id: string, key: keyof Project, value: unknown) => {
    const updatedProjects = getProjects().map((project) =>
      project.id === id ? { ...project, [key]: value } : project
    );
    updateProjects(updatedProjects);
  };

  const handleAddProject = () => {
    if (!projectDraft.name.trim() || !projectDraft.domain.trim()) {
      showToast({
        type: 'error',
        title: 'Project is incomplete',
        message: 'Project Name and Domain are required to add a project.',
      });
      return;
    }

    const nextProject: Project = {
      ...projectDraft,
      id: `project-${Date.now()}`,
    };
    updateProjects([...getProjects(), nextProject]);
    setProjectDraft({
      id: '',
      name: '',
      domain: '',
      city: '',
      state: '',
      start_date: '',
      end_date: '',
      currently_working: false,
      description: '',
    });
  };

  const handleRemoveProject = (id: string) => {
    updateProjects(getProjects().filter((project) => project.id !== id));
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
      maxWidth="lg"
      scroll="paper"
      PaperProps={{
        sx: {
          borderRadius: '16px',
          border: '1px solid #E5E7EB',
          boxShadow: '0 20px 50px rgba(16, 24, 40, 0.16)',
          maxHeight: '92vh',
        },
      }}
    >
      <DialogTitle sx={{ pr: 7, py: 2.25, borderBottom: '1px solid #F2F4F7', backgroundColor: '#FFFFFF' }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ pr: 3 }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Avatar sx={{ width: 36, height: 36, bgcolor: '#EEF4FF', color: '#3538CD', fontSize: '0.92rem', fontWeight: 700 }}>
              {String(formData.name || 'U').trim().charAt(0).toUpperCase()}
            </Avatar>
            <Box>
            <Typography sx={{ fontSize: '1.2rem', fontWeight: 700, color: '#0F172A', letterSpacing: '-0.01em' }}>
              Consultant Details
            </Typography>
            <Typography sx={{ mt: 0.5, fontSize: '0.85rem', color: '#667085' }}>
              Professional profile overview and consultant metadata.
            </Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip
              label={String(formData.status || 'Active')}
              size="small"
              sx={{
                borderRadius: '999px',
                backgroundColor: '#EEF4FF',
                color: '#3538CD',
                fontWeight: 700,
                border: '1px solid #C7D7FE',
              }}
            />
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

      <DialogContent dividers sx={{ p: 0, backgroundColor: '#FFFFFF' }}>
        {isEditing ? (
          <Stack spacing={3} sx={{ p: 3, backgroundColor: '#F8FAFC', maxWidth: 1080, mx: 'auto', width: '100%' }}>
            <Box sx={{ pb: 2.5, borderBottom: '1px solid #EAECF0' }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 2 }}>
                Basic Information
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
                <TextField label="Full Name" value={formData.name || ''} onChange={(e) => handleFieldChange('name', e.target.value)} size="small" fullWidth sx={inputSx} />
                <TextField select label="Status" value={String(formData.status || 'Active')} onChange={(e) => handleFieldChange('status', e.target.value)} size="small" fullWidth sx={inputSx}>
                  <MenuItem value="Active">Active</MenuItem>
                  <MenuItem value="Inactive">Inactive</MenuItem>
                  <MenuItem value="Recently Placed">Recently Placed</MenuItem>
                  <MenuItem value="Not Available">Not Available</MenuItem>
                </TextField>
                <TextField label="Email" type="email" value={formData.email || ''} onChange={(e) => handleFieldChange('email', e.target.value)} size="small" fullWidth sx={inputSx} />
                <TextField label="Phone" type="tel" value={formData.phone || ''} onChange={(e) => handleFieldChange('phone', e.target.value)} size="small" fullWidth sx={inputSx} />
                <TextField label="Location" value={formData.location || ''} onChange={(e) => handleFieldChange('location', e.target.value)} size="small" fullWidth sx={inputSx} />
                <TextField label="Address" value={formData.address || ''} onChange={(e) => handleFieldChange('address', e.target.value)} size="small" fullWidth sx={inputSx} />
                <TextField label="Date of Birth" type="date" value={String(formData.date_of_birth || '')} onChange={(e) => handleFieldChange('date_of_birth', e.target.value)} size="small" fullWidth InputLabelProps={{ shrink: true }} sx={inputSx} />
                <TextField select label="Timezone" value={String(formData.timezone || 'UTC')} onChange={(e) => handleFieldChange('timezone', e.target.value)} size="small" fullWidth sx={inputSx}>
                  <MenuItem value="UTC">UTC</MenuItem>
                  <MenuItem value="EST">EST (UTC-5)</MenuItem>
                  <MenuItem value="CST">CST (UTC-6)</MenuItem>
                  <MenuItem value="MST">MST (UTC-7)</MenuItem>
                  <MenuItem value="PST">PST (UTC-8)</MenuItem>
                  <MenuItem value="IST">IST (UTC+5:30)</MenuItem>
                  <MenuItem value="GST">GST (UTC+4)</MenuItem>
                </TextField>
              </Box>
            </Box>

            <Box sx={{ pb: 2.5, borderBottom: '1px solid #EAECF0' }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 2 }}>
                Skills and Work Preferences
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
                <TextField label="Primary Skills" value={formData.primary_skills || ''} onChange={(e) => handleFieldChange('primary_skills', e.target.value)} size="small" fullWidth multiline rows={2} sx={inputSx} />
                <TextField label="Secondary Skills" value={formData.secondary_skills || ''} onChange={(e) => handleFieldChange('secondary_skills', e.target.value)} size="small" fullWidth multiline rows={2} sx={inputSx} />
                <TextField label="Total Experience" value={formData.total_experience || ''} onChange={(e) => handleFieldChange('total_experience', e.target.value)} size="small" fullWidth sx={inputSx} />
                <TextField select label="Availability" value={String(formData.availability || 'Immediate')} onChange={(e) => handleFieldChange('availability', e.target.value)} size="small" fullWidth sx={inputSx}>
                  <MenuItem value="Immediate">Immediate</MenuItem>
                  <MenuItem value="Two Weeks">Two Weeks</MenuItem>
                  <MenuItem value="One Month">One Month</MenuItem>
                  <MenuItem value="Two Months">Two Months</MenuItem>
                  <MenuItem value="Flexible">Flexible</MenuItem>
                </TextField>
                <TextField select label="Preferred Work Location" value={String(formData.preferred_work_location || '')} onChange={(e) => handleFieldChange('preferred_work_location', e.target.value)} size="small" fullWidth sx={inputSx}>
                  <MenuItem value="">Select</MenuItem>
                  <MenuItem value="Remote">Remote</MenuItem>
                  <MenuItem value="Hybrid">Hybrid</MenuItem>
                  <MenuItem value="Onsite">Onsite</MenuItem>
                  <MenuItem value="Flexible">Flexible</MenuItem>
                </TextField>
                <TextField select label="Preferred Work Type" value={String(formData.preferred_work_type || '')} onChange={(e) => handleFieldChange('preferred_work_type', e.target.value)} size="small" fullWidth sx={inputSx}>
                  <MenuItem value="">Select</MenuItem>
                  <MenuItem value="Full-time">Full-time</MenuItem>
                  <MenuItem value="Contract">Contract</MenuItem>
                  <MenuItem value="Freelance">Freelance</MenuItem>
                  <MenuItem value="Permanent">Permanent</MenuItem>
                </TextField>
                <TextField label="Expected Rate" value={formData.expected_rate || ''} onChange={(e) => handleFieldChange('expected_rate', e.target.value)} size="small" fullWidth sx={inputSx} />
                <Box sx={{ gridColumn: { xs: '1 / -1', md: '1 / -1' } }}>
                  <TextField label="Why Looking For Job" value={formData.why_looking_for_job || ''} onChange={(e) => handleFieldChange('why_looking_for_job', e.target.value)} size="small" fullWidth multiline rows={2} sx={inputSx} />
                </Box>
              </Box>
            </Box>

            <Box sx={{ pb: 2.5, borderBottom: '1px solid #EAECF0' }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 2 }}>
                Additional Details
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
                <TextField label="LinkedIn Profile" type="url" value={formData.linkedin_profile || ''} onChange={(e) => handleFieldChange('linkedin_profile', e.target.value)} size="small" fullWidth sx={inputSx} />
                <TextField label="Portfolio Link" type="url" value={formData.portfolio_link || ''} onChange={(e) => handleFieldChange('portfolio_link', e.target.value)} size="small" fullWidth sx={inputSx} />
                <TextField label="Degree Name" value={formData.degree_name || ''} onChange={(e) => handleFieldChange('degree_name', e.target.value)} size="small" fullWidth sx={inputSx} />
                <TextField label="University" value={formData.university || ''} onChange={(e) => handleFieldChange('university', e.target.value)} size="small" fullWidth sx={inputSx} />
                <TextField label="Year of Passing" type="number" value={String(formData.year_of_passing || '')} onChange={(e) => handleFieldChange('year_of_passing', e.target.value)} size="small" fullWidth sx={inputSx} />
                <TextField select label="Visa Status" value={String(formData.visa_status || '')} onChange={(e) => handleFieldChange('visa_status', e.target.value)} size="small" fullWidth sx={inputSx}>
                  <MenuItem value="">Select</MenuItem>
                  <MenuItem value="US Citizen">US Citizen</MenuItem>
                  <MenuItem value="Green Card">Green Card</MenuItem>
                  <MenuItem value="H1B">H1B</MenuItem>
                  <MenuItem value="L1">L1</MenuItem>
                  <MenuItem value="E2">E2</MenuItem>
                  <MenuItem value="O1">O1</MenuItem>
                  <MenuItem value="Other">Other</MenuItem>
                </TextField>
                <TextField label="How Got Visa" value={formData.how_got_visa || ''} onChange={(e) => handleFieldChange('how_got_visa', e.target.value)} size="small" fullWidth sx={inputSx} />
                <TextField label="Year Came to US" type="number" value={String(formData.year_came_to_us || '')} onChange={(e) => handleFieldChange('year_came_to_us', e.target.value)} size="small" fullWidth sx={inputSx} />
                <TextField label="Country of Origin" value={formData.country_of_origin || ''} onChange={(e) => handleFieldChange('country_of_origin', e.target.value)} size="small" fullWidth sx={inputSx} />
                <TextField label="SSN (Last 4)" value={formData.ssn || ''} onChange={(e) => handleFieldChange('ssn', e.target.value)} size="small" fullWidth sx={inputSx} />
                <TextField label="Payroll Company" value={formData.payroll_company || ''} onChange={(e) => handleFieldChange('payroll_company', e.target.value)} size="small" fullWidth sx={inputSx} />
                <TextField label="Payroll Contact Info" value={formData.payroll_contact_info || ''} onChange={(e) => handleFieldChange('payroll_contact_info', e.target.value)} size="small" fullWidth sx={inputSx} />
              </Box>

              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', mt: 2.5, display: 'block' }}>
                Projects
              </Typography>
              <Stack spacing={1.5} sx={{ mt: 1.5 }}>
                {getProjects().length === 0 ? (
                  <Typography variant="body2" color="text.secondary">No projects added.</Typography>
                ) : (
                  getProjects().map((project) => (
                    <Box key={project.id} sx={{ border: '1px solid #E4E7EC', borderRadius: 2, p: 1.5 }}>
                      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5 }}>
                        <TextField label="Project Name" size="small" value={project.name} onChange={(e) => handleProjectChange(project.id, 'name', e.target.value)} sx={inputSx} />
                        <TextField label="Domain" size="small" value={project.domain} onChange={(e) => handleProjectChange(project.id, 'domain', e.target.value)} sx={inputSx} />
                        <TextField label="City" size="small" value={project.city} onChange={(e) => handleProjectChange(project.id, 'city', e.target.value)} sx={inputSx} />
                        <TextField label="State" size="small" value={project.state} onChange={(e) => handleProjectChange(project.id, 'state', e.target.value)} sx={inputSx} />
                        <TextField label="Start Date" type="date" size="small" value={project.start_date} onChange={(e) => handleProjectChange(project.id, 'start_date', e.target.value)} InputLabelProps={{ shrink: true }} sx={inputSx} />
                        <TextField label="End Date" type="date" size="small" value={project.end_date} disabled={project.currently_working} onChange={(e) => handleProjectChange(project.id, 'end_date', e.target.value)} InputLabelProps={{ shrink: true }} sx={inputSx} />
                        <TextField select label="Currently Working" size="small" value={project.currently_working ? 'yes' : 'no'} onChange={(e) => handleProjectChange(project.id, 'currently_working', e.target.value === 'yes')} sx={inputSx}>
                          <MenuItem value="yes">Yes</MenuItem>
                          <MenuItem value="no">No</MenuItem>
                        </TextField>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                          <Button size="small" color="error" onClick={() => handleRemoveProject(project.id)}>
                            Remove
                          </Button>
                        </Box>
                        <Box sx={{ gridColumn: '1 / -1' }}>
                          <TextField label="Description" size="small" value={project.description} onChange={(e) => handleProjectChange(project.id, 'description', e.target.value)} multiline rows={2} fullWidth sx={inputSx} />
                        </Box>
                      </Box>
                    </Box>
                  ))
                )}
              </Stack>

              <Box sx={{ mt: 2, borderTop: '1px solid #E5E7EB', pt: 2 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
                  Add New Project
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5, mt: 1 }}>
                  <TextField label="Project Name" size="small" value={projectDraft.name} onChange={(e) => setProjectDraft(prev => ({ ...prev, name: e.target.value }))} sx={inputSx} />
                  <TextField label="Domain" size="small" value={projectDraft.domain} onChange={(e) => setProjectDraft(prev => ({ ...prev, domain: e.target.value }))} sx={inputSx} />
                  <TextField label="City" size="small" value={projectDraft.city} onChange={(e) => setProjectDraft(prev => ({ ...prev, city: e.target.value }))} sx={inputSx} />
                  <TextField label="State" size="small" value={projectDraft.state} onChange={(e) => setProjectDraft(prev => ({ ...prev, state: e.target.value }))} sx={inputSx} />
                  <TextField label="Start Date" type="date" size="small" value={projectDraft.start_date} onChange={(e) => setProjectDraft(prev => ({ ...prev, start_date: e.target.value }))} InputLabelProps={{ shrink: true }} sx={inputSx} />
                  <TextField label="End Date" type="date" size="small" value={projectDraft.end_date} disabled={projectDraft.currently_working} onChange={(e) => setProjectDraft(prev => ({ ...prev, end_date: e.target.value }))} InputLabelProps={{ shrink: true }} sx={inputSx} />
                  <TextField select label="Currently Working" size="small" value={projectDraft.currently_working ? 'yes' : 'no'} onChange={(e) => setProjectDraft(prev => ({ ...prev, currently_working: e.target.value === 'yes' }))} sx={inputSx}>
                    <MenuItem value="yes">Yes</MenuItem>
                    <MenuItem value="no">No</MenuItem>
                  </TextField>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                    <Button size="small" variant="contained" onClick={handleAddProject} sx={{ textTransform: 'none', fontWeight: 600 }}>
                      Add Project
                    </Button>
                  </Box>
                  <Box sx={{ gridColumn: '1 / -1' }}>
                    <TextField label="Description" size="small" multiline rows={2} fullWidth value={projectDraft.description} onChange={(e) => setProjectDraft(prev => ({ ...prev, description: e.target.value }))} sx={inputSx} />
                  </Box>
                </Box>
              </Box>
            </Box>

            {/* Audit Log - Admin Only */}
            {isAdmin && (
              <Box sx={{ pt: 0.5 }}>
                <ResourceAuditTimeline
                  resourceType="consultant"
                  resourceId={consultant.id}
                  title="Recent admin + CRM actions"
                />
              </Box>
            )}
          </Stack>
        ) : (
          <Stack spacing={3} sx={{ p: 3, maxWidth: 1080, mx: 'auto', width: '100%' }}>
            <Box sx={{ pb: 2.5, borderBottom: '1px solid #EAECF0' }}>
              <Typography sx={{ fontSize: '1.02rem', fontWeight: 700, color: '#101828', mb: 2 }}>
                Basic Information
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, columnGap: 4, rowGap: 2 }}>
                <ProfileField label="Full Name" value={formData.name as string} />
                <ProfileField label="Status" value={formData.status as string} />
                <ProfileField label="Email" value={formData.email as string} isLink isMail />
                <ProfileField label="Phone" value={formData.phone as string} />
                <ProfileField label="Location" value={formData.location as string} />
                <ProfileField label="Address" value={formData.address as string} />
                <ProfileField label="Date of Birth" value={formData.date_of_birth as string} />
                <ProfileField label="Timezone" value={formData.timezone as string} />
              </Box>
            </Box>

            <Box sx={{ pb: 2.5, borderBottom: '1px solid #EAECF0' }}>
              <Typography sx={{ fontSize: '1.02rem', fontWeight: 700, color: '#101828', mb: 2 }}>
                Skills & Preferences
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, columnGap: 4, rowGap: 2 }}>
                <Box>
                  <Typography sx={{ fontSize: '0.74rem', fontWeight: 600, color: '#667085', textTransform: 'uppercase', letterSpacing: '0.04em', mb: 0.75 }}>
                    Primary Skills
                  </Typography>
                  <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                    {primarySkillTags.length ? primarySkillTags.map((skill) => (
                      <Chip key={`pri-${skill}`} label={skill} size="small" sx={{ borderRadius: '999px', backgroundColor: '#F2F4F7', color: '#344054', fontWeight: 600 }} />
                    )) : <Typography sx={{ fontSize: '0.95rem', color: '#101828', fontWeight: 500 }}>-</Typography>}
                  </Stack>
                </Box>
                <Box>
                  <Typography sx={{ fontSize: '0.74rem', fontWeight: 600, color: '#667085', textTransform: 'uppercase', letterSpacing: '0.04em', mb: 0.75 }}>
                    Secondary Skills
                  </Typography>
                  <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                    {secondarySkillTags.length ? secondarySkillTags.map((skill) => (
                      <Chip key={`sec-${skill}`} label={skill} size="small" sx={{ borderRadius: '999px', backgroundColor: '#F2F4F7', color: '#344054', fontWeight: 600 }} />
                    )) : <Typography sx={{ fontSize: '0.95rem', color: '#101828', fontWeight: 500 }}>-</Typography>}
                  </Stack>
                </Box>
                <ProfileField label="Total Experience" value={formData.total_experience as string} />
                <ProfileField label="Availability" value={formData.availability as string} />
                <ProfileField label="Preferred Work Location" value={formData.preferred_work_location as string} />
                <ProfileField label="Preferred Work Type" value={formData.preferred_work_type as string} />
                <ProfileField label="Expected Rate" value={formData.expected_rate as string} />
                <ProfileField label="Why Looking For Job" value={formData.why_looking_for_job as string} />
              </Box>
            </Box>

            <Box sx={{ pb: 0.5 }}>
              <Typography sx={{ fontSize: '1.02rem', fontWeight: 700, color: '#101828', mb: 2 }}>
                Additional Details
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, columnGap: 4, rowGap: 2 }}>
                <ProfileField label="LinkedIn Profile" value={formData.linkedin_profile as string} isLink />
                <ProfileField label="Portfolio Link" value={formData.portfolio_link as string} isLink />
                <ProfileField label="Degree Name" value={formData.degree_name as string} />
                <ProfileField label="University" value={formData.university as string} />
                <ProfileField label="Year of Passing" value={formData.year_of_passing as string} />
                <ProfileField label="Visa Status" value={formData.visa_status as string} />
                <ProfileField label="How Got Visa" value={formData.how_got_visa as string} />
                <ProfileField label="Year Came to US" value={formData.year_came_to_us as string} />
                <ProfileField label="Country of Origin" value={formData.country_of_origin as string} />
                <ProfileField label="SSN (Last 4)" value={formData.ssn as string} />
                <ProfileField label="Payroll Company" value={formData.payroll_company as string} />
                <ProfileField label="Payroll Contact Info" value={formData.payroll_contact_info as string} />
              </Box>
            </Box>

            <Box sx={{ pt: 1, borderTop: '1px solid #EAECF0' }}>
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: '#475467', textTransform: 'uppercase', letterSpacing: '0.04em', mb: 1 }}>
                Projects
              </Typography>
              {getProjects().length === 0 ? (
                <Typography sx={{ fontSize: '0.95rem', color: '#101828', fontWeight: 500 }}>No projects added.</Typography>
              ) : (
                <Stack spacing={1}>
                  {getProjects().map((project) => (
                    <Box key={project.id} sx={{ py: 1.25, borderBottom: '1px solid #F2F4F7' }}>
                      <Typography sx={{ fontSize: '0.95rem', color: '#101828', fontWeight: 600 }}>
                        {project.name || '-'}
                      </Typography>
                      <Typography sx={{ fontSize: '0.84rem', color: '#475467', mt: 0.25 }}>
                        {project.domain || '-'} {project.city ? `• ${project.city}` : ''} {project.state ? `• ${project.state}` : ''}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              )}
            </Box>

            {isAdmin && (
              <Box sx={{ pt: 1, borderTop: '1px solid #EAECF0' }}>
                <ResourceAuditTimeline
                  resourceType="consultant"
                  resourceId={consultant.id}
                  title="Recent admin + CRM actions"
                />
              </Box>
            )}
          </Stack>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid #EAECF0', backgroundColor: '#FFFFFF', position: 'sticky', bottom: 0, zIndex: 1 }}>
        {isEditing ? (
          <>
            <Button
              variant="outlined"
              color="inherit"
              onClick={() => {
                setFormData(consultant);
                setIsEditing(false);
              }}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              Close
            </Button>
            <Box sx={{ flex: 1 }} />
            <Button
              variant="contained"
              onClick={handleSave}
              disabled={isLoading}
              startIcon={isLoading ? <span className="w-4 h-4"><LogoLoader size="sm" /></span> : undefined}
              sx={{
                textTransform: 'none',
                fontWeight: 700,
                px: 2.2,
                background: 'linear-gradient(90deg, #5B4BFF 0%, #6941C6 100%)',
                boxShadow: '0 1px 2px rgba(16, 24, 40, 0.05), 0 8px 20px rgba(91, 75, 255, 0.25)',
              }}
            >
              Save Changes
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="outlined"
              color="inherit"
              onClick={() => {
                setIsEditing(false);
                onClose();
              }}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              Close
            </Button>
            <Box sx={{ flex: 1 }} />
            {isAdmin ? (
              <Button
                variant="contained"
                color="error"
                onClick={handleDeleteClick}
                disabled={isDeleting}
                startIcon={isDeleting ? <span className="w-4 h-4"><LogoLoader size="sm" /></span> : <Trash2 className="w-4 h-4" />}
                sx={{ textTransform: 'none', fontWeight: 700 }}
              >
                Delete
              </Button>
            ) : null}
            <Button
              variant="contained"
              onClick={() => setIsEditing(true)}
              startIcon={<Edit2 className="w-4 h-4" />}
              sx={{
                textTransform: 'none',
                fontWeight: 700,
                px: 2.2,
                background: 'linear-gradient(90deg, #5B4BFF 0%, #6941C6 100%)',
                boxShadow: '0 1px 2px rgba(16, 24, 40, 0.05), 0 8px 20px rgba(91, 75, 255, 0.25)',
              }}
            >
              Edit
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
