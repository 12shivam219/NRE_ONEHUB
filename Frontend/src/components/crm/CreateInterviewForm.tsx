import { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import { mutate as globalMutate } from 'swr';
import { X, Calendar, Clock, Users, Briefcase, MessageSquare } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../contexts/ToastContext';
import { createInterview, getInterviewsByRequirementGrouped } from '../../lib/api/interviews';
import { getRequirements } from '../../lib/api/requirements';
import { getConsultants } from '../../lib/api/consultants';
import { validateInterviewForm, getAllInterviewStatuses } from '../../lib/interviewValidation';
import { sanitizeText } from '../../lib/utils';
import type { Database } from '../../lib/database.types';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import ListSubheader from '@mui/material/ListSubheader';
import type { SelectChangeEvent } from '@mui/material/Select';


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
  helperText?: string;
}

// Modern FormField component with clean styling
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
  helperText,
}: FormFieldProps) {
  return (
    <div style={{ marginBottom: '0', width: '100%' }}>
      <label
        htmlFor={name}
        style={{
          display: 'block',
          fontSize: '0.8rem',
          fontWeight: 500,
          color: '#374151',
          marginBottom: '8px',
          letterSpacing: '0.2px',
        }}
      >
        {label}
        {required && <span style={{ color: '#EF4444', marginLeft: '4px' }}>*</span>}
      </label>

      {type === 'select' ? (
        <TextField
          select
          id={name}
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
          SelectProps={{
            displayEmpty: true,
            renderValue: (selected) => {
              const selectedValue = String(selected ?? '');
              if (!selectedValue) {
                return <span style={{ color: '#9CA3AF' }}>Select {label.toLowerCase()}</span>;
              }
              const selectedOption = options?.find((opt) => opt.value === selectedValue);
              return selectedOption?.label || selectedValue;
            },
            MenuProps: {
              PaperProps: {
                sx: {
                  mt: 0.75,
                  borderRadius: '12px',
                  border: '1px solid #E5E7EB',
                  boxShadow: '0 14px 30px rgba(15, 23, 42, 0.12)',
                  maxHeight: 320,
                  '& .MuiMenuItem-root': {
                    minHeight: 38,
                    px: 1.5,
                    py: 1,
                    fontSize: '0.88rem',
                    '&.Mui-selected': {
                      backgroundColor: 'rgba(79, 70, 229, 0.08)',
                      color: '#312E81',
                      fontWeight: 600,
                    },
                    '&.Mui-selected:hover': {
                      backgroundColor: 'rgba(79, 70, 229, 0.12)',
                    },
                    '&:hover': {
                      backgroundColor: '#F9FAFB',
                    },
                  },
                },
              },
            },
          }}
          InputLabelProps={{ shrink: false, sx: { display: 'none' } }}
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: '8px',
              backgroundColor: '#FFFFFF',
              fontSize: '0.9rem',
              transition: 'all 0.15s ease',
              border: '1px solid #D1D5DB',
              '& fieldset': { borderColor: '#D1D5DB' },
              '&:hover fieldset': { borderColor: '#9CA3AF' },
              '&.Mui-focused': {
                boxShadow: '0 0 0 1px #4F46E5, 0 0 0 3px rgba(79, 70, 229, 0.1)',
              },
              '&.Mui-focused fieldset': {
                borderColor: '#4F46E5 !important',
              },
              '& .MuiOutlinedInput-input': {
                padding: '11px 13px',
                color: '#1F2937',
                fontWeight: 500,
              },
            },
            '& .MuiSelect-select': {
              display: 'flex',
              alignItems: 'center',
            },
          }}
        >
          <ListSubheader
            disableSticky
            sx={{
              fontSize: '0.7rem',
              fontWeight: 700,
              letterSpacing: '0.06em',
              color: '#9CA3AF',
              py: 1.25,
              px: 1.5,
              lineHeight: 1,
              textTransform: 'uppercase',
              backgroundColor: '#FFFFFF',
            }}
          >
            {label}
          </ListSubheader>
          {options && options.length > 0 ? (
            options.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.label}
              </MenuItem>
            ))
          ) : (
            <MenuItem value="__empty__" disabled>
              <span style={{ color: '#9CA3AF' }}>No {label.toLowerCase()} found</span>
            </MenuItem>
          )}
        </TextField>
      ) : (
        <TextField
          id={name}
          name={name}
          type={type === 'textarea' ? 'text' : type}
          value={value}
          onChange={onChange as any}
          placeholder={placeholder}
          required={required}
          disabled={readOnly}
          error={Boolean(error)}
          size="small"
          fullWidth
          variant="outlined"
          multiline={type === 'textarea'}
          rows={type === 'textarea' ? 4 : undefined}
          InputLabelProps={{ shrink: false, sx: { display: 'none' } }}
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: '8px',
              backgroundColor: '#FFFFFF',
              fontSize: '0.9rem',
              transition: 'all 0.15s ease',
              border: '1px solid #D1D5DB',
              '& fieldset': { borderColor: '#D1D5DB' },
              '&:hover fieldset': { borderColor: '#9CA3AF' },
              '&.Mui-focused': {
                boxShadow: '0 0 0 1px #4F46E5, 0 0 0 3px rgba(79, 70, 229, 0.1)',
              },
              '&.Mui-focused fieldset': {
                borderColor: '#4F46E5 !important',
              },
              '& .MuiOutlinedInput-input, & .MuiOutlinedInput-inputMultiline': {
                padding: '11px 13px',
                color: '#1F2937',
                fontWeight: 500,
                '&::placeholder': {
                  color: '#9CA3AF',
                  opacity: 1,
                },
              },
            },
          }}
        />
      )}

      {error && (
        <div
          style={{
            fontSize: '0.75rem',
            color: '#DC2626',
            marginTop: '6px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontWeight: 500,
          }}
        >
          {error}
        </div>
      )}

      {helperText && !error && (
        <div style={{ fontSize: '0.75rem', color: '#6B7280', marginTop: '6px', fontWeight: 400 }}>
          {helperText}
        </div>
      )}
    </div>
  );
});

interface CreateInterviewFormProps {
  onClose: () => void;
  onSuccess: () => void;
  requirementId?: string;
  showDialog?: boolean;
}

// Modern Section component (replaces heavy accordions)
const FormSection = ({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <div
    style={{
      backgroundColor: '#FFFFFF',
      border: '1px solid #E5E7EB',
      borderRadius: '10px',
      padding: '28px',
      marginBottom: '28px',
      boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
      transition: 'all 0.2s ease',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '20px' }}>
      {icon && (
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            backgroundColor: '#EEF3FF',
            color: '#4F46E5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            fontSize: '18px',
          }}
        >
          {icon}
        </div>
      )}
      <div style={{ flex: 1 }}>
        <h3
          style={{
            margin: '0 0 6px 0',
            fontSize: '1.0625rem',
            fontWeight: 700,
            color: '#1F2937',
            letterSpacing: '-0.01em',
          }}
        >
          {title}
        </h3>
        {description && (
          <p
            style={{
              margin: 0,
              fontSize: '0.8125rem',
              color: '#6B7280',
              fontWeight: 400,
              lineHeight: '1.4',
            }}
          >
            {description}
          </p>
        )}
      </div>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
      {children}
    </div>
  </div>
);

export const CreateInterviewForm = ({
  onClose,
  onSuccess,
  requirementId,
  showDialog = true,
}: CreateInterviewFormProps) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [consultants, setConsultants] = useState<Consultant[]>([]);
  const [loading, setLoading] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [roundOptions, setRoundOptions] = useState<FormFieldOption[]>([
    { label: '1st Round', value: '1st Round' },
    { label: '2nd Round', value: '2nd Round' },
    { label: '3rd Round', value: '3rd Round' },
    { label: 'Final Round', value: 'Final Round' },
  ]);
  const initializedFromPropRef = useRef(false);
  const lastRequirementIdRef = useRef('');

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

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | SelectChangeEvent<string>) => {
      const { name, value } = e.target as { name: string; value: string };
      setFormData((prevState) => ({ ...prevState, [name]: value }));
    },
    []
  );

  const loadData = useCallback(async () => {
    if (!user) return;
    const [reqResult, consResult] = await Promise.all([
      getRequirements(user.id),
      getConsultants(),
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

  // Auto-populate requirement if passed as prop
  useEffect(() => {
    if (requirementId && requirements.length > 0 && !initializedFromPropRef.current) {
      const requirementExists = requirements.some((r) => r.id === requirementId);
      if (requirementExists && formData.requirement_id !== requirementId) {
        setFormData((prev) => ({ ...prev, requirement_id: requirementId }));
        initializedFromPropRef.current = true;
        lastRequirementIdRef.current = requirementId;
      }
    }
  }, [requirementId, requirements, formData.requirement_id]);

  // Validate requirement exists
  useEffect(() => {
    if (formData.requirement_id && requirements.length > 0) {
      const requirementExists = requirements.some((r) => r.id === formData.requirement_id);
      if (!requirementExists && lastRequirementIdRef.current !== formData.requirement_id) {
        setFormData((prev) => ({ ...prev, requirement_id: '' }));
        lastRequirementIdRef.current = '';
      }
    }
  }, [requirements, formData.requirement_id]);

  // Auto-populate fields from requirement
  useEffect(() => {
    if (!formData.requirement_id) return;

    let cancelled = false;
    const run = async () => {
      await Promise.resolve();
      if (cancelled) return;

      const requirement = requirements.find((r) => r.id === formData.requirement_id);
      if (requirement) {
        setFormData((prev) => ({
          ...prev,
          job_description_excerpt: requirement.description || '',
          vendor_company: requirement.implementation_partner || '',
          consultant_id: requirement.consultant_id || prev.consultant_id || '',
          interview_focus:
            requirement.primary_tech_stack && requirement.primary_tech_stack.length > 0
              ? requirement.primary_tech_stack
              : prev.interview_focus,
        }));

        // Fetch existing interviews to suggest new rounds
        if (user) {
          const result = await getInterviewsByRequirementGrouped(formData.requirement_id, user.id);
          if (result.success && result.grouped) {
            const existingRounds = Object.keys(result.grouped);
            const roundLabels: FormFieldOption[] = [];

            existingRounds.sort().forEach((round) => {
              roundLabels.push({ label: round, value: round });
            });

            const standardOptions = [
              { label: '1st Round', value: '1st Round' },
              { label: '2nd Round', value: '2nd Round' },
              { label: '3rd Round', value: '3rd Round' },
              { label: 'Final Round', value: 'Final Round' },
            ];
            standardOptions.forEach((opt) => {
              if (!roundLabels.find((r) => r.value === opt.value)) {
                roundLabels.push(opt);
              }
            });

            if (existingRounds.length > 0) {
              const nextRoundNum = existingRounds.length + 1;
              const suffix = nextRoundNum === 1 ? 'st' : nextRoundNum === 2 ? 'nd' : nextRoundNum === 3 ? 'rd' : 'th';
              const newRoundLabel = `${nextRoundNum}${suffix} Round`;
              if (!roundLabels.find((r) => r.value === newRoundLabel)) {
                roundLabels.push({ label: newRoundLabel, value: newRoundLabel });
              }
            }

            setRoundOptions(roundLabels);
          }
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [formData.requirement_id, requirements, user]);

  // Auto-generate subject line
  useEffect(() => {
    if (!formData.subject_line.trim() && formData.requirement_id && formData.round && formData.type) {
      const requirement = requirements.find((r) => r.id === formData.requirement_id);
      if (requirement) {
        const generatedSubject = `${requirement.title} - ${formData.type} - ${formData.round}`;
        if (generatedSubject !== formData.subject_line) {
          setFormData((prev) => ({ ...prev, subject_line: generatedSubject }));
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.requirement_id, formData.round, formData.type, requirements]);

  const requirementOptions = useMemo(
    () => requirements.map((r) => ({ label: `${r.title} - ${r.implementation_partner}`, value: r.id })),
    [requirements]
  );

  const consultantOptions = useMemo(
    () => consultants.map((c) => ({ label: c.name, value: c.id })),
    [consultants]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || loading) return;

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
        message: 'Please fix the required fields',
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
      showToast({
        type: 'success',
        title: 'Interview Scheduled',
        message: 'The interview has been created successfully',
      });

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

      try {
        void globalMutate('interviews', (curr: any) => {
          if (!curr) return [created];
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
        // swallow errors
      }

      try {
        window.dispatchEvent(new CustomEvent('interview-created', { detail: created }));
      } catch {
        // ignore
      }

      setTimeout(() => {
        onSuccess();
      }, 500);
    } else if (result.error) {
      showToast({
        type: 'error',
        title: 'Failed to Schedule',
        message: result.error,
      });
    }
  };

  const formContent = (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
      {/* Core Details Section */}
      <FormSection
        title="Schedule Details"
        description="Basic information required to schedule the interview"
        icon={<Calendar size={18} />}
      >
        <FormField
          label="Requirement"
          name="requirement_id"
          type="select"
          value={formData.requirement_id}
          onChange={handleChange}
          options={requirementOptions}
          required
          readOnly={!!requirementId}
          error={formErrors.requirement_id}
        />
        <FormField
          label="Interview Date"
          name="scheduled_date"
          type="date"
          value={formData.scheduled_date}
          onChange={handleChange}
          required
          error={formErrors.scheduled_date}
        />
        <FormField
          label="Interviewee Name"
          name="interview_with"
          placeholder="Full name"
          value={formData.interview_with}
          onChange={handleChange}
          required
          error={formErrors.interview_with}
        />
        <FormField
          label="Interview Time"
          name="scheduled_time"
          type="time"
          value={formData.scheduled_time}
          onChange={handleChange}
          helperText="Optional"
        />
      </FormSection>

      {/* Interview Details */}
      <FormSection
        title="Interview Type"
        description="Configure the interview type and round"
        icon={<Briefcase size={18} />}
      >
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
        />
        <FormField
          label="Round"
          name="round"
          type="select"
          value={formData.round}
          onChange={handleChange}
          options={roundOptions}
        />
        <FormField
          label="Status"
          name="status"
          type="select"
          value={formData.status}
          onChange={handleChange}
          options={getAllInterviewStatuses()}
        />
        <FormField
          label="Result"
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
          helperText="Optional"
        />
      </FormSection>

      {/* Meeting Details */}
      <FormSection
        title="Meeting Configuration"
        description="Set up the meeting details and logistics"
        icon={<Clock size={18} />}
      >
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
          helperText="Optional"
        />
        <FormField
          label="Duration (minutes)"
          name="duration_minutes"
          type="number"
          placeholder="60"
          value={formData.duration_minutes}
          onChange={handleChange}
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
        />
        <div style={{ gridColumn: '1 / -1' }}>
          <FormField
            label="Meeting Link or Location"
            name="location"
            placeholder="Zoom link, meeting room, or address"
            value={formData.location}
            onChange={handleChange}
            helperText="Optional"
          />
        </div>
      </FormSection>

      {/* Participants */}
      <FormSection
        title="Participants"
        description="Add people involved in the interview"
        icon={<Users size={18} />}
      >
        <FormField
          label="Consultant"
          name="consultant_id"
          type="select"
          value={formData.consultant_id}
          onChange={handleChange}
          options={consultantOptions}
          helperText={`${consultantOptions.length} consultant${consultantOptions.length === 1 ? '' : 's'} available`}
        />
        <FormField
          label="Interviewer"
          name="interviewer"
          placeholder="Interviewer name"
          value={formData.interviewer}
          onChange={handleChange}
          helperText="Optional"
        />
        <FormField
          label="Vendor Company"
          name="vendor_company"
          placeholder="Staffing company name"
          value={formData.vendor_company}
          onChange={handleChange}
          helperText="Auto-filled from requirement"
        />
        <FormField
          label="Subject Line"
          name="subject_line"
          placeholder="Auto-generated if left blank"
          value={formData.subject_line}
          onChange={handleChange}
          helperText="Optional"
        />
      </FormSection>

      {/* Notes & Feedback */}
      <FormSection
        title="Interview Focus & Notes"
        description="Document key areas and feedback"
        icon={<MessageSquare size={18} />}
      >
        <div style={{ gridColumn: '1 / -1' }}>
          <FormField
            label="Interview Focus"
            name="interview_focus"
            type="textarea"
            placeholder="Key areas to discuss, technical focus, preparation points..."
            value={formData.interview_focus}
            onChange={handleChange}
            helperText="Auto-filled from job skills"
          />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <FormField
            label="Special Notes"
            name="special_note"
            type="textarea"
            placeholder="Any special instructions or red flags..."
            value={formData.special_note}
            onChange={handleChange}
            helperText="Optional"
          />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <FormField
            label="Job Description Excerpt"
            name="job_description_excerpt"
            type="textarea"
            placeholder="Key job requirements"
            value={formData.job_description_excerpt}
            onChange={handleChange}
            helperText="Auto-filled from requirement"
          />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <FormField
            label="Feedback Notes"
            name="feedback_notes"
            type="textarea"
            placeholder="Post-interview observations and feedback"
            value={formData.feedback_notes}
            onChange={handleChange}
            helperText="Optional"
          />
        </div>
      </FormSection>
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
      maxWidth="md"
      scroll="paper"
      PaperProps={{
        sx: {
          borderRadius: '16px',
          background: '#FFFFFF',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.12)',
          maxHeight: '96vh',
          display: 'flex',
          flexDirection: 'column',
        },
      }}
      slotProps={{
        backdrop: {
          sx: {
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
          },
        },
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '40px 40px 32px',
          borderBottom: '1px solid #E5E7EB',
          backgroundColor: '#FFFFFF',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ flex: 1 }}>
          <h1
            style={{
              margin: '0 0 12px 0',
              fontSize: '1.875rem',
              fontWeight: 700,
              color: '#1F2937',
              letterSpacing: '-0.02em',
              lineHeight: '1.2',
            }}
          >
            Schedule Interview
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: '0.95rem',
              color: '#6B7280',
              fontWeight: 400,
              lineHeight: '1.5',
            }}
          >
            Complete the form below to schedule a new interview
          </p>
        </div>
        <IconButton
          onClick={onClose}
          sx={{
            color: '#6B7280',
            width: 40,
            height: 40,
            '&:hover': {
              backgroundColor: '#F3F4F6',
              color: '#374151',
            },
          }}
          aria-label="Close"
        >
          <X size={20} />
        </IconButton>
      </div>

      {/* Content */}
      <DialogContent
        sx={{
          backgroundColor: '#FFFFFF',
          padding: '40px',
          overflowY: 'auto',
          flex: 1,
          '&::-webkit-scrollbar': {
            width: '8px',
          },
          '&::-webkit-scrollbar-track': {
            backgroundColor: '#F9FAFB',
          },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: '#D1D5DB',
            borderRadius: '4px',
            '&:hover': {
              backgroundColor: '#9CA3AF',
            },
          },
        }}
      >
        {formContent}
      </DialogContent>

      {/* Sticky Footer */}
      <div
        style={{
          padding: '24px 40px',
          borderTop: '1px solid #E5E7EB',
          backgroundColor: '#FFFFFF',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '12px',
          alignItems: 'center',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            backgroundColor: '#FFFFFF',
            color: '#374151',
            border: '1px solid #D1D5DB',
            padding: '10px 24px',
            borderRadius: '8px',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: '0.9375rem',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#F9FAFB';
            e.currentTarget.style.borderColor = '#9CA3AF';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#FFFFFF';
            e.currentTarget.style.borderColor = '#D1D5DB';
          }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          onClick={() => {
            const form = document.querySelector('form') as HTMLFormElement;
            if (form) form.dispatchEvent(new Event('submit', { bubbles: true }));
          }}
          style={{
            backgroundColor: loading ? '#818CF8' : '#4F46E5',
            color: '#FFFFFF',
            border: 'none',
            padding: '10px 28px',
            borderRadius: '8px',
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '0.9375rem',
            transition: 'all 0.15s ease',
            opacity: loading ? 0.8 : 1,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: !loading ? '0 2px 4px rgba(79, 70, 229, 0.2)' : 'none',
          }}
          onMouseEnter={(e) =>
            !loading && (
              (e.currentTarget.style.backgroundColor = '#4338CA'),
              (e.currentTarget.style.boxShadow = '0 4px 12px rgba(79, 70, 229, 0.3)')
            )
          }
          onMouseLeave={(e) =>
            !loading && (
              (e.currentTarget.style.backgroundColor = '#4F46E5'),
              (e.currentTarget.style.boxShadow = '0 2px 4px rgba(79, 70, 229, 0.2)')
            )
          }
        >
          {loading ? 'Scheduling...' : 'Schedule Interview'}
        </button>
      </div>
    </Dialog>
  );
};
