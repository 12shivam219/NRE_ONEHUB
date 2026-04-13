import { useState, useEffect } from 'react';
import { X, Edit2, Mail, History, Zap } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useOfflineCache } from '../../hooks/useOfflineCache';
import { updateRequirement } from '../../lib/api/requirements';
import { useToast } from '../../contexts/ToastContext';
import { ResourceAuditTimeline } from '../common/ResourceAuditTimeline';
import { RequirementEmailManager } from './RequirementEmailManager';
import EmailHistoryPanel from './EmailHistoryPanel';
import { LogoLoader } from '../common/LogoLoader';
import NextStepThread from './NextStepThread';
import { SimilarRequirementsPanel } from './SimilarRequirementsPanel';
import { subscribeToRequirementById, type RealtimeUpdate } from '../../lib/api/realtimeSync';
import { cacheRequirements, type CachedRequirement } from '../../lib/offlineDB';
import type { Database } from '../../lib/database.types';
import Dialog from '@mui/material/Dialog';
import IconButton from '@mui/material/IconButton';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';

type Requirement = Database['public']['Tables']['requirements']['Row'];

interface RequirementDetailModalProps {
  isOpen: boolean;
  requirement: Requirement | null;
  onClose: () => void;
  onUpdate: () => void;
  createdBy?: string | null;
  updatedBy?: string | null;
}

export const RequirementDetailModal = ({
  isOpen,
  requirement,
  onClose,
  onUpdate,
}: RequirementDetailModalProps) => {
  const { user, isAdmin } = useAuth();
  const { showToast } = useToast();
  const { isOnline, queueOfflineOperation } = useOfflineCache();
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState<Partial<Requirement> | null>(null);
  const [activeTab, setActiveTab] = useState<'details' | 'emails' | 'description' | 'history' | 'similar'>('details');
  const [remoteUpdateNotified, setRemoteUpdateNotified] = useState(false);

  useEffect(() => {
    if (!requirement) return;

    let cancelled = false;

    const run = async () => {
      await Promise.resolve();
      if (cancelled) return;
      setFormData(requirement);
      setIsEditing(false);
      setRemoteUpdateNotified(false);
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [requirement, isOpen]);

  // Subscribe to real-time updates for this specific requirement
  useEffect(() => {
    if (!isOpen || !requirement) return;

    const unsubscribe = subscribeToRequirementById(requirement.id, (update: RealtimeUpdate<Requirement>) => {
      // Handle DELETE - close modal when requirement is deleted
      if (update.type === 'DELETE') {
        showToast({
          type: 'warning',
          title: 'Requirement Deleted',
          message: 'This requirement has been deleted.',
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
            message: 'This requirement was updated by another user. Changes are reflected below.',
          });
          setRemoteUpdateNotified(true);
        }
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, [isOpen, requirement, isEditing, remoteUpdateNotified, showToast, onClose]);

  if (!isOpen || !requirement || !formData) return null;

  const handleFieldChange = (key: keyof Requirement, value: unknown) => {
    setFormData(prev => prev ? { ...prev, [key]: value } : null);
  };

  const handleSave = async () => {
    if (!user || !requirement) return;
    
    // Store original data for rollback in case of error
    const originalFormData = formData;
    
    setIsLoading(true);

    // Check if offline - queue operation
    if (!isOnline) {
      await queueOfflineOperation('UPDATE', 'requirement', requirement.id, formData as Record<string, unknown>);
      
      // Optimistically update local cache
      const updatedRequirement = {
        ...requirement,
        ...formData,
        updated_at: new Date().toISOString(),
      };
      await cacheRequirements([updatedRequirement as CachedRequirement], user.id);
      
      setIsLoading(false);
      showToast({
        type: 'info',
        title: 'Queued for Sync',
        message: 'Changes will be saved when you come back online',
      });
      setIsEditing(false);
      onUpdate(); // Refresh UI
      return;
    }

    // Online - update normally
    const result = await updateRequirement(
      requirement.id,
      formData as Partial<Requirement>,
      user.id
    );

    if (result.success) {
      showToast({
        type: 'success',
        title: 'Requirement updated',
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

  // Helper to get status badge color
  const getStatusColor = (status: string) => {
    const statusMap: Record<string, string> = {
      'NEW': 'bg-blue-100 text-blue-800 border-blue-300',
      'IN_PROGRESS': 'bg-yellow-100 text-yellow-800 border-yellow-300',
      'SUBMITTED': 'bg-purple-100 text-purple-800 border-purple-300',
      'INTERVIEW': 'bg-indigo-100 text-indigo-800 border-indigo-300',
      'OFFER': 'bg-green-100 text-green-800 border-green-300',
      'REJECTED': 'bg-red-100 text-red-800 border-red-300',
      'CLOSED': 'bg-gray-100 text-gray-800 border-gray-300',
    };
    return statusMap[status] || 'bg-gray-100 text-gray-800 border-gray-300';
  };

  return (
    <Dialog
      open={isOpen}
      onClose={() => {
        setIsEditing(false);
        onClose();
      }}
      fullWidth
      maxWidth={false}
      disableScrollLock
      PaperProps={{
        sx: {
          width: '90vw',
          height: '90vh',
          maxWidth: 'none',
          borderRadius: '16px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        },
      }}
    >
      {/* Premium Header with Key Meta */}
      <Box
        sx={{
          position: 'relative',
          background: 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)',
          borderBottom: '1px solid #E2E8F0',
          padding: '24px 32px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 3,
          flexShrink: 0,
        }}
      >
        {/* Left: Job Title & Company */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="h4"
            sx={{
              fontWeight: 700,
              fontSize: '28px',
              color: '#0F172A',
              marginBottom: '8px',
              lineHeight: 1.2,
            }}
            noWrap
          >
            {formData?.title || 'Untitled'}
          </Typography>
          <Typography
            variant="body1"
            sx={{
              fontSize: '16px',
              color: '#475569',
              fontWeight: 500,
              marginBottom: '16px',
            }}
            noWrap
          >
            {formData?.client || formData?.implementation_partner || 'No Client'}
          </Typography>

          {/* Key Meta: Rate, Work Type, Duration */}
          <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap' }}>
            {formData?.rate && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="caption" sx={{ fontWeight: 600, color: '#64748B' }}>
                  Rate:
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, color: '#0F172A' }}>
                  {formData.rate}
                </Typography>
              </Box>
            )}
            {formData?.remote && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="caption" sx={{ fontWeight: 600, color: '#64748B' }}>
                  Work Type:
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, color: '#0F172A' }}>
                  {formData.remote}
                </Typography>
              </Box>
            )}
            {formData?.duration && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="caption" sx={{ fontWeight: 600, color: '#64748B' }}>
                  Duration:
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, color: '#0F172A' }}>
                  {formData.duration}
                </Typography>
              </Box>
            )}
          </Stack>
        </Box>

        {/* Right: Status Badge + Req Number + Close */}
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
          {/* Status Badge */}
          <Box
            className={`px-4 py-2 rounded-lg border font-semibold text-sm ${getStatusColor(formData?.status || 'NEW')}`}
          >
            {formData?.status || 'NEW'}
          </Box>

          {/* Req Number */}
          <Typography
            variant="caption"
            sx={{
              color: '#64748B',
              fontWeight: 600,
              letterSpacing: '0.5px',
              textTransform: 'uppercase',
              fontSize: '11px',
            }}
          >
            Req #{String(requirement.requirement_number || 'N/A')}
          </Typography>
        </Box>

        {/* Close Button */}
        <IconButton
          onClick={onClose}
          aria-label="Close modal"
          sx={{
            position: 'absolute',
            right: 16,
            top: 16,
            color: '#64748B',
            '&:hover': { backgroundColor: 'rgba(15, 23, 42, 0.08)' },
          }}
        >
          <X className="w-5 h-5" />
        </IconButton>
      </Box>

      {/* Tab Navigation */}
      <Box
        sx={{
          borderBottom: '1px solid #E2E8F0',
          backgroundColor: '#FFFFFF',
          paddingX: 4,
          flexShrink: 0,
        }}
      >
        <Tabs
          value={activeTab}
          onChange={(_, value) => setActiveTab(value as 'details' | 'emails' | 'description' | 'history' | 'similar')}
          variant="standard"
          sx={{
            '& .MuiTab-root': {
              fontWeight: 600,
              fontSize: '14px',
              textTransform: 'none',
              color: '#64748B',
              padding: '16px 24px',
              minWidth: '140px',
              '&.Mui-selected': {
                color: '#4F46E5',
                borderBottom: '2px solid #4F46E5',
              },
            },
          }}
        >
          <Tab value="details" label="Overview" />
          <Tab value="emails" label="Activity" icon={<Mail className="w-4 h-4" />} iconPosition="start" />
          <Tab value="description" label="Job Description" />
          <Tab value="similar" label="Similar Jobs" icon={<Zap className="w-4 h-4" />} iconPosition="start" />
          <Tab value="history" label="History" icon={<History className="w-4 h-4" />} iconPosition="start" />
        </Tabs>
      </Box>

      {/* Content Area */}
      <Box
        sx={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#F8FAFC',
        }}
      >
        {/* Scrollable Content */}
        <Box sx={{ flex: 1, overflowY: 'auto', padding: '32px' }}>
          {/* Overview Tab */}
          {activeTab === 'details' && (
            <Box>
              {!isEditing ? (
                // View Mode - Premium Grid Layout
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 3 }}>
                  {/* Core Details - Grouped */}
                  <Paper
                    variant="outlined"
                    sx={{
                      padding: '24px',
                      borderRadius: '12px',
                      gridColumn: 'span 1',
                      borderColor: '#E2E8F0',
                      backgroundColor: '#FFFFFF',
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        display: 'block',
                        fontWeight: 700,
                        color: '#64748B',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        marginBottom: '16px',
                        fontSize: '11px',
                      }}
                    >
                      📋 Core Details
                    </Typography>
                    <Stack spacing={3}>
                      <Box>
                        <Typography variant="caption" sx={{ color: '#94A3B8', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                          Tech Stack
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#0F172A', fontWeight: 500 }}>
                          {formData?.primary_tech_stack || '-'}
                        </Typography>
                      </Box>

                    </Stack>
                  </Paper>

                  {/* Vendor Information */}
                  <Paper
                    variant="outlined"
                    sx={{
                      padding: '24px',
                      borderRadius: '12px',
                      gridColumn: 'span 1',
                      borderColor: '#E2E8F0',
                      backgroundColor: '#FFFFFF',
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        display: 'block',
                        fontWeight: 700,
                        color: '#64748B',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        marginBottom: '16px',
                        fontSize: '11px',
                      }}
                    >
                      🤝 Vendor Info
                    </Typography>
                    <Stack spacing={3}>
                      <Box>
                        <Typography variant="caption" sx={{ color: '#94A3B8', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                          Vendor Company
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#0F172A', fontWeight: 500 }}>
                          {formData?.vendor_company || '-'}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" sx={{ color: '#94A3B8', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                          Contact Person
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#0F172A', fontWeight: 500 }}>
                          {formData?.vendor_person_name || '-'}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" sx={{ color: '#94A3B8', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                          Email
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{
                            color: formData?.vendor_email ? '#4F46E5' : '#0F172A',
                            fontWeight: 500,
                            wordBreak: 'break-word',
                          }}
                        >
                          {formData?.vendor_email ? (
                            <a href={`mailto:${formData.vendor_email}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                              {formData.vendor_email}
                            </a>
                          ) : (
                            '-'
                          )}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" sx={{ color: '#94A3B8', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                          Phone
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#0F172A', fontWeight: 500 }}>
                          {formData?.vendor_phone || '-'}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" sx={{ color: '#94A3B8', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                          Website
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#0F172A', fontWeight: 500 }}>
                          {formData?.vendor_website ? (
                            <a
                              href={formData.vendor_website}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: '#4F46E5', textDecoration: 'none' }}
                            >
                              Visit →
                            </a>
                          ) : (
                            '-'
                          )}
                        </Typography>
                      </Box>
                    </Stack>
                  </Paper>

                  {/* Client & Partner Information */}
                  <Paper
                    variant="outlined"
                    sx={{
                      padding: '24px',
                      borderRadius: '12px',
                      gridColumn: 'span 1',
                      borderColor: '#E2E8F0',
                      backgroundColor: '#FFFFFF',
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        display: 'block',
                        fontWeight: 700,
                        color: '#64748B',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        marginBottom: '16px',
                        fontSize: '11px',
                      }}
                    >
                      🏢 Client & Partner
                    </Typography>
                    <Stack spacing={3}>
                      <Box>
                        <Typography variant="caption" sx={{ color: '#94A3B8', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                          Implementation Partner
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#0F172A', fontWeight: 500 }}>
                          {formData?.implementation_partner || '-'}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" sx={{ color: '#94A3B8', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                          Client
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#0F172A', fontWeight: 500 }}>
                          {formData?.client || '-'}
                        </Typography>
                      </Box>
                    </Stack>
                  </Paper>

                  {/* Next Steps - Timeline View (Full Width) */}
                  <Paper
                    variant="outlined"
                    sx={{
                      padding: '24px',
                      borderRadius: '12px',
                      gridColumn: '1 / -1',
                      borderColor: '#E2E8F0',
                      backgroundColor: '#FFFFFF',
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        display: 'block',
                        fontWeight: 700,
                        color: '#64748B',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        marginBottom: '16px',
                        fontSize: '11px',
                      }}
                    >
                      📍 Activity Timeline
                    </Typography>
                    {requirement && <NextStepThread requirementId={requirement.id} readOnly={false} />}
                  </Paper>

                  {/* Admin Audit Log */}
                  {isAdmin && (
                    <Paper
                      variant="outlined"
                      sx={{
                        padding: '24px',
                        borderRadius: '12px',
                        gridColumn: '1 / -1',
                        borderColor: '#E2E8F0',
                        backgroundColor: '#FFFFFF',
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{
                          display: 'block',
                          fontWeight: 700,
                          color: '#64748B',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          marginBottom: '16px',
                          fontSize: '11px',
                        }}
                      >
                        🔐 Admin & CRM Actions
                      </Typography>
                      <ResourceAuditTimeline
                        resourceType="requirement"
                        resourceId={requirement.id}
                        title=""
                      />
                    </Paper>
                  )}
                </Box>
              ) : (
                // Edit Mode - Compact Form Grid
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 2 }}>
                  <TextField
                    label="Job Title"
                    value={formData?.title || ''}
                    onChange={(e) => handleFieldChange('title', e.target.value)}
                    size="small"
                    fullWidth
                  />
                  <TextField
                    label="Implementation Partner"
                    value={formData?.implementation_partner || ''}
                    onChange={(e) => handleFieldChange('implementation_partner', e.target.value)}
                    size="small"
                    fullWidth
                  />
                  <TextField
                    label="Client"
                    value={formData?.client || ''}
                    onChange={(e) => handleFieldChange('client', e.target.value)}
                    size="small"
                    fullWidth
                  />
                  <TextField
                    select
                    label="Status"
                    value={String(formData?.status || 'NEW')}
                    onChange={(e) => handleFieldChange('status', e.target.value)}
                    size="small"
                    fullWidth
                  >
                    <MenuItem value="NEW">New</MenuItem>
                    <MenuItem value="IN_PROGRESS">In Progress</MenuItem>
                    <MenuItem value="SUBMITTED">Submitted</MenuItem>
                    <MenuItem value="INTERVIEW">Interview</MenuItem>
                    <MenuItem value="OFFER">Offer</MenuItem>
                    <MenuItem value="REJECTED">Rejected</MenuItem>
                    <MenuItem value="CLOSED">Closed</MenuItem>
                  </TextField>
                  <TextField
                    label="Rate"
                    value={formData?.rate || ''}
                    onChange={(e) => handleFieldChange('rate', e.target.value)}
                    size="small"
                    fullWidth
                  />
                  <TextField
                    select
                    label="Work Type"
                    value={String(formData?.remote || '')}
                    onChange={(e) => handleFieldChange('remote', e.target.value)}
                    size="small"
                    fullWidth
                  >
                    <MenuItem value="">Select</MenuItem>
                    <MenuItem value="Remote">Remote</MenuItem>
                    <MenuItem value="Hybrid">Hybrid</MenuItem>
                    <MenuItem value="Onsite">Onsite</MenuItem>
                  </TextField>
                  <TextField
                    label="Duration"
                    value={formData?.duration || ''}
                    onChange={(e) => handleFieldChange('duration', e.target.value)}
                    size="small"
                    fullWidth
                    placeholder="e.g., 6 months"
                  />
                  <TextField
                    label="Tech Stack"
                    value={formData?.primary_tech_stack || ''}
                    onChange={(e) => handleFieldChange('primary_tech_stack', e.target.value)}
                    size="small"
                    fullWidth
                    multiline
                    rows={2}
                  />
                  <TextField
                    label="Vendor Company"
                    value={formData?.vendor_company || ''}
                    onChange={(e) => handleFieldChange('vendor_company', e.target.value)}
                    size="small"
                    fullWidth
                  />
                  <TextField
                    label="Vendor Contact"
                    value={formData?.vendor_person_name || ''}
                    onChange={(e) => handleFieldChange('vendor_person_name', e.target.value)}
                    size="small"
                    fullWidth
                  />
                  <TextField
                    label="Vendor Email"
                    type="email"
                    value={formData?.vendor_email || ''}
                    onChange={(e) => handleFieldChange('vendor_email', e.target.value)}
                    size="small"
                    fullWidth
                  />
                  <TextField
                    label="Vendor Phone"
                    type="text"
                    value={formData?.vendor_phone || ''}
                    onChange={(e) => handleFieldChange('vendor_phone', e.target.value)}
                    size="small"
                    fullWidth
                  />
                  <TextField
                    label="Vendor Website"
                    type="url"
                    value={formData?.vendor_website || ''}
                    onChange={(e) => handleFieldChange('vendor_website', e.target.value)}
                    size="small"
                    fullWidth
                    placeholder="https://example.com"
                  />
                </Box>
              )}
            </Box>
          )}

          {/* Activity Tab (Emails) */}
          {activeTab === 'emails' && (
            <Box sx={{ p: 4 }}>
              <RequirementEmailManager
                requirementId={requirement.id}
                requirementTitle={requirement.title}
                vendorEmail={requirement.vendor_email}
              />
            </Box>
          )}

          {/* Job Description Tab */}
          {activeTab === 'description' && !isEditing && (
            <Box sx={{ maxWidth: '900px' }}>
              <Paper
                variant="outlined"
                sx={{
                  padding: '32px',
                  borderRadius: '12px',
                  borderColor: '#E2E8F0',
                  backgroundColor: '#FFFFFF',
                  marginBottom: '32px',
                }}
              >
                <Typography
                  variant="h6"
                  sx={{
                    fontWeight: 700,
                    color: '#0F172A',
                    marginBottom: '16px',
                    fontSize: '16px',
                  }}
                >
                  Role Description
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    color: '#475569',
                    lineHeight: 1.8,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontSize: '14px',
                  }}
                >
                  {formData?.description || 'No description provided'}
                </Typography>
              </Paper>
            </Box>
          )}

          {/* Job Description Tab - Edit Mode */}
          {activeTab === 'description' && isEditing && (
            <Box sx={{ maxWidth: '900px' }}>
              <Paper
                variant="outlined"
                sx={{
                  padding: '32px',
                  borderRadius: '12px',
                  borderColor: '#E2E8F0',
                  backgroundColor: '#FFFFFF',
                }}
              >
                <TextField
                  label="Role Description"
                  value={formData?.description || ''}
                  onChange={(e) => handleFieldChange('description', e.target.value)}
                  fullWidth
                  multiline
                  rows={12}
                  placeholder="Full job description and key responsibilities..."
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: '8px',
                    },
                  }}
                />
              </Paper>
            </Box>
          )}

          {/* History Tab */}
          {activeTab === 'history' && (
            <Box sx={{ p: 4 }}>
              <EmailHistoryPanel requirementId={requirement.id} />
            </Box>
          )}

          {/* Similar Jobs Tab - Phase 2 RAG Search */}
          {activeTab === 'similar' && requirement && (
            <Box sx={{ maxWidth: '1200px' }}>
              <SimilarRequirementsPanel
                requirementId={requirement.id}
                onViewOriginal={(id) => {
                  // Could implement navigation to another requirement here
                  console.log('View original:', id);
                }}
                showDuplicates={true}
                maxResults={8}
              />
            </Box>
          )}
        </Box>
      </Box>

      {/* Sticky Footer with Actions */}
      <Box
        sx={{
          position: 'sticky',
          bottom: 0,
          backgroundColor: '#FFFFFF',
          borderTop: '1px solid #E2E8F0',
          padding: '20px 32px',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 2,
          flexShrink: 0,
          boxShadow: '0 -4px 12px rgba(0, 0, 0, 0.05)',
        }}
      >
        {isEditing ? (
          // Save & Cancel in edit mode
          <Stack direction="row" spacing={2} sx={{ width: '100%', maxWidth: '400px' }}>
            <Button
              variant="outlined"
              color="inherit"
              onClick={() => {
                setFormData(requirement);
                setIsEditing(false);
              }}
              sx={{
                flex: 1,
                fontWeight: 600,
                textTransform: 'none',
                fontSize: '14px',
                borderColor: '#E2E8F0',
              }}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              color="primary"
              onClick={handleSave}
              disabled={isLoading}
              startIcon={isLoading ? <span className="w-4 h-4"><LogoLoader size="sm" /></span> : undefined}
              sx={{
                flex: 1,
                fontWeight: 600,
                textTransform: 'none',
                fontSize: '14px',
              }}
            >
              {isLoading ? 'Saving...' : 'Save Changes'}
            </Button>
          </Stack>
        ) : (
          // Edit & Close in view mode
          <Stack direction="row" spacing={2} sx={{ width: '100%', maxWidth: '400px' }}>
            <Button
              variant="outlined"
              color="inherit"
              onClick={onClose}
              sx={{
                flex: 1,
                fontWeight: 600,
                textTransform: 'none',
                fontSize: '14px',
                borderColor: '#E2E8F0',
              }}
            >
              Close
            </Button>
            <Button
              variant="contained"
              color="primary"
              onClick={() => setIsEditing(true)}
              startIcon={<Edit2 className="w-4 h-4" />}
              sx={{
                flex: 1,
                fontWeight: 600,
                textTransform: 'none',
                fontSize: '14px',
              }}
            >
              Edit Record
            </Button>
          </Stack>
        )}
      </Box>
    </Dialog>
  );
};
