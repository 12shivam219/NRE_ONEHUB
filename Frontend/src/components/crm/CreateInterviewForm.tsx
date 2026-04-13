import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { mutate as globalMutate } from 'swr';
import { X, AlertCircle, CheckCircle2, Info, Calendar, Clock, Users, Briefcase, MessageSquare, MapPin, FileText, CheckCircle } from 'lucide-react';
import { keyframes } from '@mui/system';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../contexts/ToastContext';
import { createInterview, getInterviewsByRequirementGrouped } from '../../lib/api/interviews';
import { getRequirements } from '../../lib/api/requirements';
import { getConsultants } from '../../lib/api/consultants';
// Interview focus generator removed per request
import { validateInterviewForm, getAllInterviewStatuses } from '../../lib/interviewValidation';
import { sanitizeText } from '../../lib/utils';
import type { Database } from '../../lib/database.types';
import { BrandButton } from '../brand';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Box from '@mui/material/Box';
import FormHelperText from '@mui/material/FormHelperText';
import FormControl from '@mui/material/FormControl';
import type { SelectChangeEvent } from '@mui/material/Select';

// Animation keyframes
const slideIn = keyframes`
  from { 
    opacity: 0; 
    transform: translateY(20px); 
  }
  to { 
    opacity: 1; 
    transform: translateY(0); 
  }
`;

const successPulse = keyframes`
  0% { 
    transform: scale(0.95);
    opacity: 0;
  }
  50% {
    transform: scale(1.05);
  }
  100% { 
    transform: scale(1);
    opacity: 1;
  }
`;

const fadeInOut = keyframes`
  0%, 10% { 
    opacity: 0;
  }
  20%, 80% {
    opacity: 1;
  }
  90%, 100% {
    opacity: 0;
  }
`;

const glow = keyframes`
  0%, 100% { 
    box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7);
  }
  50% { 
    box-shadow: 0 0 0 10px rgba(34, 197, 94, 0);
  }
`;

type Requirement = Database['public']['Tables']['requirements']['Row'];
type Consultant = Database['public']['Tables']['consultants']['Row'];

interface FormFieldOption {
  label: string;
  value: string;
}

interface FormFieldProps {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | SelectChangeEvent<string>) => void;
  required?: boolean;
  readOnly?: boolean;
  options?: FormFieldOption[];
  error?: string;
  icon?: React.ReactNode;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
}

// Success animation overlay component
const SuccessOverlay = ({ isVisible }: { isVisible: boolean }) => {
  if (!isVisible) return null;
  
  return (
    <Box
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        pointerEvents: 'none',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
          animation: `${successPulse} 0.6s ease-out forwards`,
        }}
      >
        <Box
          sx={{
            width: 80,
            height: 80,
            borderRadius: '50%',
            backgroundColor: '#22c55e',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 20px 25px -5px rgba(34, 197, 94, 0.3)',
            animation: `${glow} 1.5s ease-in-out infinite`,
          }}
        >
          <CheckCircle size={48} color="white" strokeWidth={1.5} />
        </Box>
        <Typography 
          variant="h6" 
          sx={{ 
            color: '#22c55e',
            fontWeight: 700,
            fontSize: '1.25rem',
            textAlign: 'center',
            animation: `${fadeInOut} 2s ease-in-out`,
          }}
        >
          Interview Scheduled Successfully! 🎉
        </Typography>
      </Box>
    </Box>
  );
};

// Create FormField component outside the parent component for stability
const FormField = memo(function FormField({
  label,
  name,
  type = 'text',
  placeholder,
  value,
  onChange,
  required = false,
  readOnly = false,
  options,
  error,
  icon,
  onKeyDown,
}: FormFieldProps) {
  // Helper text based on field type
  const getHelperText = () => {
    if (error) return undefined;
    if (type === 'date') return 'Format: MM/DD/YYYY';
    if (type === 'time') return 'Format: HH:MM (24-hour)';
    if (type === 'textarea') return 'Optional field';
    return undefined;
  };

  // Input props for date/time fields
  const getInputProps = () => {
    if (type === 'date') {
      return { placeholder: 'MM/DD/YYYY' };
    }
    if (type === 'time') {
      return { placeholder: 'HH:MM' };
    }
    return {};
  };

  const commonInputSx = {
    transition: 'all 0.2s ease',
    borderRadius: 1,
    backgroundColor: 'background.paper',
    padding: '6px',
    '&:hover': {
      borderColor: 'primary.main',
      boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)',
    },
    '&.Mui-focused': {
      boxShadow: '0 8px 22px rgba(15, 23, 42, 0.08)',
    },
    '& .MuiOutlinedInput-notchedOutline': {
      borderWidth: '1px',
      borderColor: 'rgba(0,0,0,0.08)'
    },
  };

  return (
    <FormControl fullWidth variant="outlined" error={Boolean(error)} size="small">
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {icon && (
          <Box sx={{ display: 'flex', alignItems: 'center', color: 'primary.main', mt: 1 }}>
            {icon}
          </Box>
        )}
        <Box sx={{ flex: 1 }}>
          {type === 'select' ? (
            <TextField
              select
              label={label}
              name={name}
              value={value}
              onChange={onChange}
              disabled={readOnly}
              required={required}
              error={Boolean(error)}
              placeholder={placeholder}
              size="small"
              fullWidth
              variant="outlined"
              sx={{
                '& .MuiOutlinedInput-root': commonInputSx,
                '& .MuiInputBase-input': {
                  fontFamily: '"Poppins", sans-serif',
                },
              }}
              inputProps={{ 'aria-label': label, onKeyDown }}
            >
              <MenuItem value="">
                <span style={{ color: '#999' }}>Select {label.toLowerCase()}</span>
              </MenuItem>
              {options?.map((opt: FormFieldOption) => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </TextField>
          ) : (
            <TextField
              label={label}
              name={name}
              type={type === 'textarea' ? 'text' : type}
              value={value}
              onChange={onChange as unknown as (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void}
              placeholder={placeholder}
              required={required}
              disabled={readOnly}
              error={Boolean(error)}
              size="small"
              fullWidth
              variant="outlined"
              multiline={type === 'textarea'}
              rows={type === 'textarea' ? 3 : undefined}
              InputLabelProps={type === 'date' || type === 'time' ? { shrink: true } : undefined}
              inputProps={type === 'date' || type === 'time' ? getInputProps() : { 'aria-label': label, onKeyDown }}
              sx={{
                '& .MuiOutlinedInput-root': commonInputSx,
                '& .MuiInputBase-input': {
                  fontFamily: '"Poppins", sans-serif',
                  fontSize: '0.95rem',
                  letterSpacing: type === 'time' ? '0.05em' : 'normal',
                },
                ...(type === 'date' || type === 'time' ? {
                  '& input[type="date"]::-webkit-calendar-picker-indicator': {
                    cursor: 'pointer',
                    filter: 'invert(0.7)',
                  },
                  '& input[type="time"]::-webkit-calendar-picker-indicator': {
                    cursor: 'pointer',
                    filter: 'invert(0.7)',
                  },
                } : {}),
              }}
            />
          )}
          {error && (
            <FormHelperText sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5, color: '#ef4444' }}>
              <AlertCircle size={14} />
              {error}
            </FormHelperText>
          )}
          {!error && getHelperText() && (
            <FormHelperText sx={{ mt: 0.5, color: '#6b7280' }}>
              {getHelperText()}
            </FormHelperText>
          )}
        </Box>
      </Box>
    </FormControl>
  );
});

interface CreateInterviewFormProps {
  onClose: () => void;
  onSuccess: () => void;
  requirementId?: string;
  showDialog?: boolean;
}

const AccordionSection = ({ title, children, defaultOpen = false, icon }: { title: string; children: React.ReactNode; defaultOpen?: boolean; icon?: React.ReactNode }) => {
  const [expanded, setExpanded] = useState(defaultOpen);
  const isRequired = title.includes('Required');
  
  return (
    <Accordion
      expanded={expanded}
      onChange={(_, next) => setExpanded(next)}
      disableGutters
      elevation={0}
      sx={{
        border: '1px solid rgba(234, 179, 8, 0.2)',
        borderRadius: 1.5,
        overflow: 'hidden',
        backgroundColor: expanded ? 'rgba(234, 179, 8, 0.04)' : 'transparent',
        transition: 'all 0.2s ease',
        '&:before': {
          display: 'none',
        },
        '&.Mui-expanded': {
          margin: 0,
        },
      }}
    >
      <AccordionSummary 
        expandIcon={<ExpandMoreIcon sx={{ color: 'primary.main' }} />}
        sx={{
          padding: '12px 16px',
          backgroundColor: isRequired ? 'rgba(234, 179, 8, 0.08)' : 'transparent',
          borderBottom: expanded ? '1px solid rgba(234, 179, 8, 0.15)' : 'none',
          transition: 'all 0.2s ease',
          '&:hover': {
            backgroundColor: 'rgba(234, 179, 8, 0.08)',
          },
        }}
      >
        <Stack direction="row" spacing={1} alignItems="center">
          {icon && icon}
          <Typography 
            variant="subtitle2" 
            sx={{ 
              fontWeight: 700,
              fontFamily: '"Poppins", sans-serif',
              fontSize: '0.95rem',
              color: 'text.primary',
            }}
          >
            {title}
          </Typography>
          {isRequired && (
            <CheckCircle2 size={16} style={{ color: '#22c55e', marginLeft: '4px' }} />
          )}
        </Stack>
      </AccordionSummary>
      <AccordionDetails sx={{ padding: '16px' }}>
        <Stack spacing={2}>
          {children}
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
};

export const CreateInterviewForm = ({ onClose, onSuccess, requirementId, showDialog = true }: CreateInterviewFormProps) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [consultants, setConsultants] = useState<Consultant[]>([]);
  const [loading, setLoading] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  // interview focus generation disabled
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);
  const [roundOptions, setRoundOptions] = useState<FormFieldOption[]>([
    { label: '1st Round', value: '1st Round' },
    { label: '2nd Round', value: '2nd Round' },
    { label: '3rd Round', value: '3rd Round' },
    { label: 'Final Round', value: 'Final Round' },
  ]);


  const [formData, setFormData] = useState({
    requirement_id: '',
    scheduled_date: '',
    scheduled_time: '',
    timezone: 'UTC',
    duration_minutes: '60',
    type: 'Technical',
    status: 'Scheduled',
    consultant_id: '',
    vendor_company: '',
    interview_with: '',
    result: '',
    round: '1st Round',
    mode: 'Video Call',
    meeting_type: '',
    subject_line: '',
    interviewer: '',
    location: '',
    interview_focus: '',
    special_note: '',
    job_description_excerpt: '',
    feedback_notes: '',
  });

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | SelectChangeEvent<string>) => {
    const { name, value } = e.target as { name: string; value: string };
    // Don't trim during typing - only set the value as-is
    setFormData(prevState => ({ ...prevState, [name]: value }));
  }, []);

  const loadData = useCallback(async () => {
    if (!user) return;
    const [reqResult, consResult] = await Promise.all([
      getRequirements(user.id),
      getConsultants(user.id),
    ]);
    if (reqResult.success && reqResult.requirements) {
      setRequirements(reqResult.requirements);
    }
    if (consResult.success && consResult.consultants) {
      setConsultants(consResult.consultants);
    }
  }, [user]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      await Promise.resolve();
      if (cancelled) return;
      await loadData();
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [loadData]);

  // Set the passed requirementId only after requirements have loaded
  useEffect(() => {
    if (requirementId && requirements.length > 0) {
      const requirementExists = requirements.some(r => r.id === requirementId);
      if (requirementExists) {
        setFormData(prev => ({ ...prev, requirement_id: requirementId }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requirements]);

  // Validate requirement_id exists in available options, reset if not found
  // This effect validates the selected requirement still exists after requirements load/change
  useEffect(() => {
    if (formData.requirement_id && requirements.length > 0) {
      const requirementExists = requirements.some(r => r.id === formData.requirement_id);
      // Only update if the current selection is invalid
      if (!requirementExists) {
        setFormData(prev => ({ ...prev, requirement_id: '' }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requirements]);

  // Auto-populate fields from requirement data and generate interview focus with AI
  useEffect(() => {
    if (!formData.requirement_id) return;

    let cancelled = false;

    const run = async () => {
      await Promise.resolve();
      if (cancelled) return;

      const requirement = requirements.find(r => r.id === formData.requirement_id);
      if (requirement) {
        // Auto-populate job description excerpt
        const jobDescExcerpt = requirement.description || '';
        
        // Auto-populate vendor company
        const vendorCompany = requirement.implementation_partner || '';
        
        // Update form with these values
        setFormData(prev => ({
          ...prev,
          job_description_excerpt: jobDescExcerpt,
          vendor_company: vendorCompany,
          // Prefill consultant from requirement if present
          consultant_id: requirement.consultant_id || prev.consultant_id || '',
          // Use primary_tech_stack (key skills) as interview focus
          interview_focus: (requirement.primary_tech_stack && requirement.primary_tech_stack.length > 0) ? requirement.primary_tech_stack : prev.interview_focus,
        }));

        // Fetch existing interviews for this requirement to suggest new rounds
        if (user) {
          const result = await getInterviewsByRequirementGrouped(formData.requirement_id, user.id);
          if (result.success && result.grouped) {
            // Extract round labels from grouped result
            const existingRounds = Object.keys(result.grouped);

            // Build round options: existing rounds first, then standard options, then "New Round" option
            const roundLabels: FormFieldOption[] = [];
            
            // Add existing rounds
            existingRounds.sort().forEach(round => {
              roundLabels.push({ label: round, value: round });
            });

            // Add standard options if not already present
            const standardOptions = [
              { label: '1st Round', value: '1st Round' },
              { label: '2nd Round', value: '2nd Round' },
              { label: '3rd Round', value: '3rd Round' },
              { label: 'Final Round', value: 'Final Round' },
            ];
            standardOptions.forEach(opt => {
              if (!roundLabels.find(r => r.value === opt.value)) {
                roundLabels.push(opt);
              }
            });

            // Add "New Round" option if there are existing interviews
            if (existingRounds.length > 0) {
              const nextRoundNum = existingRounds.length + 1;
              const newRoundLabel = `${nextRoundNum}${nextRoundNum === 1 ? 'st' : nextRoundNum === 2 ? 'nd' : nextRoundNum === 3 ? 'rd' : 'th'} Round`;
              if (!roundLabels.find(r => r.value === newRoundLabel)) {
                roundLabels.push({ label: newRoundLabel, value: newRoundLabel });
              }
            }

            setRoundOptions(roundLabels);
          }
        }

        // Check local cache first to avoid regenerating on every open
        // Interview focus auto-generation has been removed.
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [formData.requirement_id, requirements, user]);

  // Auto-generate subject_line if it's empty and key fields are set
  useEffect(() => {
    if (!formData.subject_line.trim() && formData.requirement_id && formData.round && formData.type) {
      const requirement = requirements.find(r => r.id === formData.requirement_id);
      if (requirement) {
        const generatedSubject = `${requirement.title} - ${formData.type} - ${formData.round}`;
        setFormData(prev => ({ ...prev, subject_line: generatedSubject }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.requirement_id, formData.round, formData.type, requirements]);

  const requirementOptions = useMemo(
    () => requirements.map(r => ({ label: `${r.title} - ${r.implementation_partner}`, value: r.id })),
    [requirements]
  );

  const consultantOptions = useMemo(
    () => consultants.map(c => ({ label: c.name, value: c.id })),
    [consultants]
  );

  // Keyboard navigation handler
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    // Tab to move forward, Shift+Tab to move backward
    if (e.key === 'Enter' && e.ctrlKey) {
      // Ctrl+Enter to submit form - capture as form event
      const formElement = (e.target as HTMLElement).closest('form');
      if (formElement) {
        formElement.dispatchEvent(new Event('submit', { bubbles: true }));
      }
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || loading) return; // Prevent double-submit

    // Validate form data
    const validation = validateInterviewForm({
      requirement_id: formData.requirement_id,
      scheduled_date: formData.scheduled_date,
      scheduled_time: formData.scheduled_time,
      interview_with: formData.interview_with,
    });

    if (!validation.isValid) {
      setFormErrors(validation.errors);
      showToast({
        type: 'error',
        title: 'Validation Error',
        message: 'Please fix the errors below',
      });
      return;
    }

    setFormErrors({});
    setLoading(true);
    const result = await createInterview(
      {
        user_id: user.id,
        requirement_id: formData.requirement_id,
        scheduled_date: formData.scheduled_date,
        scheduled_time: formData.scheduled_time || null,
        timezone: formData.timezone || null,
        duration_minutes: parseInt(formData.duration_minutes),
        type: formData.type || null,
        status: formData.status,
        consultant_id: formData.consultant_id || null,
        vendor_company: sanitizeText(formData.vendor_company),
        interview_with: sanitizeText(formData.interview_with),
        result: sanitizeText(formData.result),
        round: formData.round || null,
        mode: formData.mode || null,
        meeting_type: formData.meeting_type || null,
        subject_line: sanitizeText(formData.subject_line),
        interviewer: sanitizeText(formData.interviewer),
        location: sanitizeText(formData.location),
        interview_focus: sanitizeText(formData.interview_focus),
        special_note: sanitizeText(formData.special_note),
        job_description_excerpt: sanitizeText(formData.job_description_excerpt),
        feedback_notes: sanitizeText(formData.feedback_notes),
      },
      user.id
    );

    setLoading(false);
    if (result.success) {
      // Show success animation
      setShowSuccessAnimation(true);
      showToast({
        type: 'success',
        title: 'Interview Scheduled',
        message: 'The interview has been created successfully',
      });
      
      // Close dialog and trigger callback after animation completes
      // Dispatch a global event so listing views can update optimistically
      // Prepare optimistic interview object for SWR mutation and event dispatch
      const created = result.interview ?? {
        id: `temp-${Date.now()}`,
        user_id: user.id,
        requirement_id: formData.requirement_id,
        scheduled_date: formData.scheduled_date,
        scheduled_time: formData.scheduled_time || null,
        timezone: formData.timezone || null,
        duration_minutes: parseInt(formData.duration_minutes),
        type: formData.type || null,
        status: formData.status,
        consultant_id: formData.consultant_id || null,
        vendor_company: sanitizeText(formData.vendor_company),
        interview_with: sanitizeText(formData.interview_with),
        result: sanitizeText(formData.result),
        round: formData.round || null,
        mode: formData.mode || null,
        meeting_type: formData.meeting_type || null,
        subject_line: sanitizeText(formData.subject_line),
        interviewer: sanitizeText(formData.interviewer),
        location: sanitizeText(formData.location),
        interview_focus: sanitizeText(formData.interview_focus),
        special_note: sanitizeText(formData.special_note),
        job_description_excerpt: sanitizeText(formData.job_description_excerpt),
        feedback_notes: sanitizeText(formData.feedback_notes),
        created_by: user.id,
        updated_by: user.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any;

      // Optimistically update common SWR keys if present
      try {
        void globalMutate('interviews', (curr: any) => {
          if (!curr) return [created];
          // if curr is array
          if (Array.isArray(curr)) {
            if (curr.some((c: any) => c.id === created.id)) return curr;
            return [created, ...curr];
          }
          return curr;
        }, false);

        if (created.requirement_id) {
          const key = `interviews:requirement:${created.requirement_id}`;
          void globalMutate(key, (curr: any) => {
            if (!curr) return [created];
            if (Array.isArray(curr)) {
              if (curr.some((c: any) => c.id === created.id)) return curr;
              return [created, ...curr];
            }
            return curr;
          }, false);
        }
      } catch {
        // swallow SWR mutation errors
      }

      try {
        window.dispatchEvent(new CustomEvent('interview-created', { detail: created }));
      } catch {
        // ignore
      }

      setTimeout(() => {
        onSuccess();
      }, 1500);
    } else if (result.error) {
      showToast({
        type: 'error',
        title: 'Failed to Schedule',
        message: result.error,
      });
    }
  };

  const formContent = (
    <form onSubmit={handleSubmit}>
      <Stack spacing={3}>
        {/* Info Banner */}
        <Box sx={{
          p: 2,
          backgroundColor: 'rgba(59, 130, 246, 0.08)',
          border: '1px solid rgba(59, 130, 246, 0.2)',
          borderRadius: 1.5,
          display: 'flex',
          gap: 1.5,
          alignItems: 'flex-start',
        }}>
          <Info size={20} style={{ color: '#3b82f6', marginTop: '2px', flexShrink: 0 }} />
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600, color: '#3b82f6', mb: 0.25 }}>
              Pro Tip
            </Typography>
            <Typography variant="caption" sx={{ color: '#1e40af' }}>
              Fill out the basic information first (marked with ✓), then customize additional details as needed.
            </Typography>
          </Box>
        </Box>

        {/* Required Information Accordion - Open by default */}
        <AccordionSection title="✓ Basic Information (Required)" defaultOpen={true}>
          <Box sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
            gap: 2,
            animation: `${slideIn} 0.4s ease-out`,
          }}>
            <FormField
              label="Requirement *"
              name="requirement_id"
              type="select"
              value={formData.requirement_id}
              onChange={handleChange}
              options={requirementOptions}
              required
              readOnly={!!requirementId}
              error={formErrors.requirement_id}
              icon={<Briefcase size={18} />}
              onKeyDown={(e) => handleKeyDown(e)}
            />
            <FormField
              label="Interview Date *"
              name="scheduled_date"
              type="date"
              value={formData.scheduled_date}
              onChange={handleChange}
              required
              error={formErrors.scheduled_date}
              icon={<Calendar size={18} />}
              onKeyDown={(e) => handleKeyDown(e)}
            />
            <FormField
              label="Interviewee Name *"
              name="interview_with"
              placeholder="Enter interviewee name"
              value={formData.interview_with}
              onChange={handleChange}
              required
              error={formErrors.interview_with}
              icon={<Users size={18} />}
              onKeyDown={(e) => handleKeyDown(e)}
            />
            <FormField
              label="Interview Time"
              name="scheduled_time"
              type="time"
              value={formData.scheduled_time}
              onChange={handleChange}
              icon={<Clock size={18} />}
              onKeyDown={(e) => handleKeyDown(e)}
            />
          </Box>
          <Box sx={{
            p: 2,
            backgroundColor: 'rgba(249, 115, 22, 0.08)',
            border: '1px solid rgba(249, 115, 22, 0.2)',
            borderRadius: 1,
            display: 'flex',
            gap: 1,
            alignItems: 'flex-start',
          }}>
            <AlertCircle size={18} style={{ color: '#f97316', marginTop: '2px', flexShrink: 0 }} />
            <Typography variant="caption" sx={{ color: '#92400e' }}>
              <strong>Required fields:</strong> Requirement, Interview Date, and Candidate Name must be filled to create an interview.
            </Typography>
          </Box>
        </AccordionSection>

        {/* Interview Details */}
        <AccordionSection title="Interview Details" defaultOpen={false}>
          <Box sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
            gap: 2,
            animation: `${slideIn} 0.4s ease-out 0.1s backwards`,
          }}>
            <FormField
              label="Interview Type"
              name="type"
              type="select"
              value={formData.type}
              onChange={handleChange}
              options={[
                { label: 'Technical', value: 'Technical' },
                { label: 'HR', value: 'HR' },
                { label: 'Behavioral', value: 'Behavioral' },
                { label: 'Final Round', value: 'Final Round' },
                { label: 'Screening', value: 'Screening' },
              ]}
              icon={<Briefcase size={18} />}
              onKeyDown={(e) => handleKeyDown(e)}
            />
            <FormField
              label="Round"
              name="round"
              type="select"
              value={formData.round}
              onChange={handleChange}
              options={roundOptions}
              icon={<MessageSquare size={18} />}
              onKeyDown={(e) => handleKeyDown(e)}
            />
            <FormField
              label="Status"
              name="status"
              type="select"
              value={formData.status}
              onChange={handleChange}
              options={getAllInterviewStatuses()}
              icon={<CheckCircle size={18} />}
              onKeyDown={(e) => handleKeyDown(e)}
            />
            <FormField
              label="Result (optional)"
              name="result"
              type="select"
              value={formData.result}
              onChange={handleChange}
              options={[
                { label: 'Positive', value: 'Positive' },
                { label: 'Negative', value: 'Negative' },
                { label: 'On Hold', value: 'On Hold' },
                { label: 'Pending', value: 'Pending' },
              ]}
              icon={<CheckCircle2 size={18} />}
              onKeyDown={(e) => handleKeyDown(e)}
            />
          </Box>
        </AccordionSection>

        {/* Meeting Configuration */}
        <AccordionSection title="Meeting Configuration" defaultOpen={false}>
          <Box sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
            gap: 2,
            animation: `${slideIn} 0.4s ease-out 0.2s backwards`,
          }}>
            <FormField
              label="Mode"
              name="mode"
              type="select"
              value={formData.mode}
              onChange={handleChange}
              options={[
                { label: 'Video Call', value: 'Video Call' },
                { label: 'Phone Call', value: 'Phone Call' },
                { label: 'In Person', value: 'In Person' },
                { label: 'Panel Interview', value: 'Panel Interview' },
              ]}
              icon={<MessageSquare size={18} />}
              onKeyDown={(e) => handleKeyDown(e)}
            />
            <FormField
              label="Duration (minutes)"
              name="duration_minutes"
              type="number"
              placeholder="60"
              value={formData.duration_minutes}
              onChange={handleChange}
              icon={<Clock size={18} />}
              onKeyDown={(e) => handleKeyDown(e)}
            />
            <FormField
              label="Timezone"
              name="timezone"
              type="select"
              value={formData.timezone}
              onChange={handleChange}
              options={[
                { label: 'UTC', value: 'UTC' },
                { label: 'EST (UTC-5)', value: 'EST' },
                { label: 'CST (UTC-6)', value: 'CST' },
                { label: 'MST (UTC-7)', value: 'MST' },
                { label: 'PST (UTC-8)', value: 'PST' },
                { label: 'IST (UTC+5:30)', value: 'IST' },
              ]}
              icon={<Clock size={18} />}
              onKeyDown={(e) => handleKeyDown(e)}
            />
            <FormField
              label="Platform"
              name="meeting_type"
              type="select"
              value={formData.meeting_type}
              onChange={handleChange}
              options={[
                { label: 'GMeet', value: 'GMeet' },
                { label: 'Zoom', value: 'Zoom' },
                { label: 'Webex', value: 'Webex' },
                { label: 'MS Teams', value: 'MS Teams' },
              ]}
              icon={<Briefcase size={18} />}
              onKeyDown={(e) => handleKeyDown(e)}
            />
            <Box sx={{ gridColumn: { xs: 'auto', sm: 'span 2' } }}>
              <FormField
                label="Meeting Link or Location"
                name="location"
                placeholder="Enter Zoom link, Meeting room, or Address"
                value={formData.location}
                onChange={handleChange}
                icon={<MapPin size={18} />}
                onKeyDown={(e) => handleKeyDown(e)}
              />
            </Box>
          </Box>
        </AccordionSection>

        {/* Participants */}
        <AccordionSection title="Participants & Interviewer" defaultOpen={false}>
          <Box sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
            gap: 2,
            animation: `${slideIn} 0.4s ease-out 0.3s backwards`,
          }}>
            <FormField
              label="Consultant"
              name="consultant_id"
              type="select"
              value={formData.consultant_id}
              onChange={handleChange}
              options={consultantOptions}
              icon={<Users size={18} />}
              onKeyDown={(e) => handleKeyDown(e)}
            />
            <FormField
              label="Interviewer"
              name="interviewer"
              placeholder="Enter interviewer name"
              value={formData.interviewer}
              onChange={handleChange}
              icon={<Users size={18} />}
              onKeyDown={(e) => handleKeyDown(e)}
            />
            <FormField
              label="Vendor Company"
              name="vendor_company"
              placeholder="e.g., ABC Staffing"
              value={formData.vendor_company}
              onChange={handleChange}
              icon={<Briefcase size={18} />}
              onKeyDown={(e) => handleKeyDown(e)}
            />
            <FormField
              label="Subject Line"
              name="subject_line"
              placeholder="Will auto-generate if left blank"
              value={formData.subject_line}
              onChange={handleChange}
              icon={<MessageSquare size={18} />}
              onKeyDown={(e) => handleKeyDown(e)}
            />
          </Box>
        </AccordionSection>

        {/* Interview Notes & Feedback */}
        <AccordionSection title="Notes & Feedback" defaultOpen={false}>
          <Stack spacing={2.5} sx={{ animation: `${slideIn} 0.4s ease-out 0.4s backwards` }}>
            {/* Interview Focus (manual entry) */}
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <MessageSquare size={18} style={{ color: '#2563EB' }} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary' }}>
                    Interview Focus
                  </Typography>
                </Box>
              </Box>
              <TextField
                fullWidth
                multiline
                minRows={5}
                maxRows={20}
                placeholder="Enter key areas to discuss, technical focus areas, and preparation points..."
                value={formData.interview_focus}
                onChange={handleChange}
                name="interview_focus"
                slotProps={{
                  input: {
                    sx: {
                      fontFamily: 'inherit',
                      fontSize: '0.9rem',
                      lineHeight: 1.6,
                      color: formData.interview_focus ? 'text.primary' : 'text.secondary',
                      backgroundColor: formData.interview_focus ? 'rgba(212, 175, 55, 0.03)' : 'background.paper',
                      transition: 'all 0.3s ease',
                      resize: 'vertical',
                      '&:hover': {
                        backgroundColor: formData.interview_focus ? 'rgba(212, 175, 55, 0.05)' : 'background.paper',
                        borderColor: formData.interview_focus ? 'rgba(212, 175, 55, 0.4)' : 'action.hover',
                      },
                      '&.Mui-focused': {
                        backgroundColor: formData.interview_focus 
                          ? 'rgba(212, 175, 55, 0.05)' 
                          : 'background.paper',
                        borderColor: 'primary.main',
                        boxShadow: '0 0 0 3px rgba(212, 175, 55, 0.1)',
                      },
                      '&.Mui-disabled': {
                        backgroundColor: 'rgba(59, 130, 246, 0.04)',
                        opacity: 1,
                      },
                    },
                  },
                }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderColor: formData.interview_focus ? 'rgba(212, 175, 55, 0.3)' : 'divider',
                    '& fieldset': {
                      borderColor: formData.interview_focus ? 'rgba(212, 175, 55, 0.3)' : 'divider',
                      transition: 'border-color 0.3s ease',
                    },
                  },
                }}
              />
              {formData.interview_focus && (
                <Typography variant="caption" sx={{ 
                  display: 'block',
                  mt: 1,
                  color: 'text.secondary',
                  fontSize: '0.8rem',
                }}>
                  💡 Tip: This content is editable. Customize it to match your interview style.
                </Typography>
              )}
            </Box>

            {/* Special Note */}
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <FileText size={18} style={{ color: '#2563EB' }} />
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary' }}>
                  Special Note
                </Typography>
              </Box>
              <TextField
                fullWidth
                multiline
                minRows={3}
                maxRows={8}
                placeholder="Any special instructions, red flags to discuss, or notes about the candidate..."
                value={formData.special_note}
                onChange={handleChange}
                name="special_note"
                slotProps={{
                  input: {
                    sx: {
                      fontFamily: 'inherit',
                      fontSize: '0.9rem',
                      lineHeight: 1.6,
                      backgroundColor: formData.special_note 
                        ? 'rgba(168, 85, 247, 0.03)' 
                        : 'background.paper',
                      '&:hover': {
                        backgroundColor: formData.special_note 
                          ? 'rgba(168, 85, 247, 0.05)' 
                          : 'background.paper',
                      },
                      '&.Mui-focused': {
                        boxShadow: '0 0 0 3px rgba(168, 85, 247, 0.1)',
                      },
                    },
                  },
                }}
              />
            </Box>
            <FormField
              label="Job Description Excerpt"
              name="job_description_excerpt"
              type="textarea"
              placeholder="Key job requirements or description"
              value={formData.job_description_excerpt}
              onChange={handleChange}
              icon={<FileText size={18} />}
              onKeyDown={(e) => handleKeyDown(e)}
            />
            <FormField
              label="Feedback Notes"
              name="feedback_notes"
              type="textarea"
              placeholder="Post-interview feedback and observations"
              value={formData.feedback_notes}
              onChange={handleChange}
              icon={<MessageSquare size={18} />}
              onKeyDown={(e) => handleKeyDown(e)}
            />
          </Stack>
        </AccordionSection>

        {/* Form Actions */}
        <Box sx={{
          pt: 2,
          mt: 2,
          borderTop: '1px solid rgba(234, 179, 8, 0.2)',
          display: 'flex',
          gap: 2,
          flexDirection: { xs: 'column', sm: 'row' },
          animation: `${slideIn} 0.4s ease-out 0.5s backwards`,
        }}>
          <Box sx={{ flex: 1 }}>
            <BrandButton
              type="submit"
              variant="primary"
              size="md"
              disabled={loading}
            >
              {loading ? '⏳ Scheduling...' : '✓ Schedule Interview'}
            </BrandButton>
          </Box>
          <Box sx={{ flex: 1 }}>
            <BrandButton
              type="button"
              variant="secondary"
              size="md"
              onClick={onClose}
            >
              Cancel
            </BrandButton>
          </Box>
        </Box>
      </Stack>
    </form>
  );

  if (!showDialog) {
    return formContent;
  }

  return (
    <Dialog 
      open 
      onClose={onClose} 
      fullWidth 
      maxWidth="lg" 
      scroll="paper"
      PaperProps={{
        sx: {
          borderRadius: '12px',
          background: 'linear-gradient(135deg, #ffffff 0%, #f9fafb 100%)',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        },
      }}
      slotProps={{
        backdrop: {
          sx: {
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
          },
        },
      }}
    >
      <DialogTitle 
        sx={{ 
          pr: 7, 
          fontWeight: 700,
          fontSize: '1.25rem',
          fontFamily: '"Poppins", sans-serif',
          color: '#1f2937',
          borderBottom: '1px solid #e5e7eb',
          paddingBottom: '16px',
        }}
      >
        Schedule Interview
        <IconButton 
          onClick={onClose} 
          sx={{ 
            position: 'absolute', 
            right: 8, 
            top: 8,
            color: '#6b7280',
            '&:hover': {
              backgroundColor: 'rgba(0, 0, 0, 0.08)',
            },
          }} 
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </IconButton>
      </DialogTitle>

      <DialogContent 
        dividers 
        sx={{ 
          backgroundColor: '#ffffff',
          padding: '24px',
          minHeight: 520,
          gap: 16,
          overflowY: 'auto',
          '&::-webkit-scrollbar': {
            width: '8px',
          },
          '&::-webkit-scrollbar-track': {
            background: 'transparent',
          },
          '&::-webkit-scrollbar-thumb': {
            background: '#d1d5db',
            borderRadius: '4px',
            '&:hover': {
              background: '#9ca3af',
            },
          },
        }}
      >
        {formContent}
      </DialogContent>
      <SuccessOverlay isVisible={showSuccessAnimation} />
    </Dialog>
  );
};
