import { useState, useCallback, memo, useMemo } from 'react';
import { X, Trash2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../contexts/ToastContext';
import { createConsultant } from '../../lib/api/consultants';
import { validateConsultantForm } from '../../lib/formValidation';
import { ErrorAlert } from '../common/ErrorAlert';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import type { SelectChangeEvent } from '@mui/material/Select';

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
  options?: FormFieldOption[];
  error?: string;
  helperText?: string;
}

const FormField = memo(function FormField({
  label,
  name,
  type = 'text',
  placeholder,
  value,
  onChange,
  required = false,
  options,
  error,
  helperText,
}: FormFieldProps) {
  const textFieldSx = {
    '& .MuiFormHelperText-root': {
      marginLeft: 0,
      marginRight: 0,
      minHeight: helperText || error ? '18px' : 0,
      fontSize: '0.75rem',
      color: error ? '#B42318' : '#667085',
    },
    '& .MuiOutlinedInput-root': {
      backgroundColor: '#FFFFFF',
      borderRadius: '10px',
      transition: 'all 0.18s ease',
      '& fieldset': {
        borderColor: '#D1D5DB',
      },
      '&:hover fieldset': {
        borderColor: '#9CA3AF',
      },
      '&.Mui-focused fieldset': {
        borderColor: '#4F46E5',
        borderWidth: '1px',
      },
      '&.Mui-focused': {
        boxShadow: '0 0 0 3px rgba(79, 70, 229, 0.16)',
      },
    },
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <label htmlFor={name} style={{ fontSize: '0.85rem', fontWeight: 600, color: '#111827' }}>
        {label}
        {required && <span style={{ color: '#DC2626', marginLeft: '4px' }}>*</span>}
      </label>
      {type === 'select' ? (
        <TextField
          select
          id={name}
          name={name}
          value={value}
          onChange={onChange}
          required={required}
          error={Boolean(error)}
          helperText={error || helperText}
          size="small"
          fullWidth
          sx={textFieldSx}
        >
          <MenuItem value="">Select</MenuItem>
          {options?.map((opt: FormFieldOption) => (
            <MenuItem key={opt.value} value={opt.value}>
              {opt.label}
            </MenuItem>
          ))}
        </TextField>
      ) : (
        <TextField
          id={name}
          name={name}
          type={type === 'textarea' ? 'text' : type}
          value={value}
          onChange={onChange as unknown as (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void}
          placeholder={placeholder}
          required={required}
          error={Boolean(error)}
          helperText={error || helperText}
          size="small"
          fullWidth
          multiline={type === 'textarea'}
          rows={type === 'textarea' ? 4 : undefined}
          sx={textFieldSx}
        />
      )}
    </div>
  );
});

interface CreateConsultantFormProps {
  onClose: () => void;
  onSuccess: () => void;
}

type WizardStep = {
  key: string;
  title: string;
  description: string;
  optional?: boolean;
};

export const CreateConsultantForm = ({ onClose, onSuccess }: CreateConsultantFormProps) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [animationDirection, setAnimationDirection] = useState<'forward' | 'backward'>('forward');
  const [showMoreBackground, setShowMoreBackground] = useState(false);
  const [showMoreAdditional, setShowMoreAdditional] = useState(false);

  const [formData, setFormData] = useState({
    status: 'Active',
    name: '',
    email: '',
    phone: '',
    location: '',
    primary_skills: '',
    secondary_skills: '',
    total_experience: '',
    linkedin_profile: '',
    portfolio_link: '',
    availability: 'Immediate',
    visa_status: '',
    date_of_birth: '',
    address: '',
    timezone: 'UTC',
    degree_name: '',
    university: '',
    year_of_passing: '',
    ssn: '',
    how_got_visa: '',
    year_came_to_us: '',
    country_of_origin: '',
    why_looking_for_job: '',
    preferred_work_location: '',
    preferred_work_type: '',
    expected_rate: '',
    payroll_company: '',
    payroll_contact_info: '',
  });

  const [projectForm, setProjectForm] = useState({
    name: '',
    domain: '',
    city: '',
    state: '',
    start_date: '',
    end_date: '',
    currently_working: false,
    description: '',
  });

  const steps: WizardStep[] = useMemo(
    () => [
      {
        key: 'basic',
        title: 'Basic Information',
        description: 'Core details we need to create the consultant profile.',
      },
      {
        key: 'skills',
        title: 'Skills & Experience',
        description: 'Capture technical strengths and current availability.',
      },
      {
        key: 'online',
        title: 'Online Presence',
        description: 'Add public links to make shortlisting easier.',
        optional: true,
      },
      {
        key: 'background',
        title: 'Background Details',
        description: 'Personal, education, and work preference context.',
      },
      {
        key: 'additional',
        title: 'Additional Info',
        description: 'Payroll and project details to complete the profile.',
        optional: true,
      },
    ],
    []
  );

  const isLastStep = currentStep === steps.length - 1;
  const completionPercent = Math.round(((currentStep + 1) / steps.length) * 100);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | SelectChangeEvent<string>) => {
    const { name, value } = e.target as { name: string; value: string };
    setFormData(prevState => ({ ...prevState, [name]: value }));
  }, []);

  const handleProjectFormChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setProjectForm(prevState => ({
      ...prevState,
      [name]: type === 'checkbox' ? checked : value,
    }));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    // Validate form
    const validation = validateConsultantForm({
      name: formData.name,
      email: formData.email,
      phone: formData.phone,
      date_of_birth: formData.date_of_birth,
      expected_rate: formData.expected_rate,
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
    setSubmitError(null);
    setLoading(true);

    try {
      const result = await createConsultant(
        {
          user_id: user.id,
          status: formData.status,
          name: formData.name,
          email: formData.email || null,
          phone: formData.phone || null,
          location: formData.location || null,
          primary_skills: formData.primary_skills || null,
          secondary_skills: formData.secondary_skills || null,
          total_experience: formData.total_experience || null,
          linkedin_profile: formData.linkedin_profile || null,
          portfolio_link: formData.portfolio_link || null,
          availability: formData.availability || null,
          visa_status: formData.visa_status || null,
          date_of_birth: formData.date_of_birth || null,
          address: formData.address || null,
          timezone: formData.timezone || null,
          degree_name: formData.degree_name || null,
          university: formData.university || null,
          year_of_passing: formData.year_of_passing || null,
          ssn: formData.ssn || null,
          how_got_visa: formData.how_got_visa || null,
          year_came_to_us: formData.year_came_to_us || null,
          country_of_origin: formData.country_of_origin || null,
          why_looking_for_job: formData.why_looking_for_job || null,
          preferred_work_location: formData.preferred_work_location || null,
          preferred_work_type: formData.preferred_work_type || null,
          expected_rate: formData.expected_rate || null,
          payroll_company: formData.payroll_company || null,
          payroll_contact_info: formData.payroll_contact_info || null,
          projects: projects.length > 0 ? projects : null,
          company: null,
        },
        user.id
      );

      setLoading(false);
      if (result.success) {
        showToast({
          type: 'success',
          title: 'Consultant Added',
          message: 'New consultant has been successfully added',
        });
        onSuccess();
      } else {
        setSubmitError(result.error || 'Failed to add consultant');
        showToast({
          type: 'error',
          title: 'Failed',
          message: result.error || 'Failed to add consultant',
        });
      }
    } catch (error) {
      setLoading(false);
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
      setSubmitError(errorMessage);
      showToast({
        type: 'error',
        title: 'Error',
        message: errorMessage,
      });
    }
  };

  const handleAddProject = () => {
    if (projectForm.name && projectForm.domain) {
      setProjects([
        ...projects,
        {
          id: Date.now().toString(),
          ...projectForm,
        },
      ]);
      setProjectForm({
        name: '',
        domain: '',
        city: '',
        state: '',
        start_date: '',
        end_date: '',
        currently_working: false,
        description: '',
      });
      setShowProjectForm(false);
    }
  };

  const handleRemoveProject = (id: string) => {
    setProjects(projects.filter(p => p.id !== id));
  };

  const validateStep = useCallback(() => {
    const nextErrors: Record<string, string> = {};

    if (currentStep === 0) {
      if (!formData.name.trim()) nextErrors.name = 'Name is required';
      if (formData.email.trim() && !formData.email.includes('@')) nextErrors.email = 'Enter a valid email';
      if (formData.phone.trim() && formData.phone.trim().length < 7) nextErrors.phone = 'Enter a valid phone number';
    }

    if (currentStep === 3) {
      if (formData.date_of_birth.trim() && Number.isNaN(Date.parse(formData.date_of_birth))) {
        nextErrors.date_of_birth = 'Enter a valid date';
      }
      if (formData.expected_rate.trim() && formData.expected_rate.trim().length < 2) {
        nextErrors.expected_rate = 'Expected rate looks too short';
      }
    }

    setFormErrors(prev => ({ ...prev, ...nextErrors }));
    return Object.keys(nextErrors).length === 0;
  }, [currentStep, formData]);

  const handleNext = () => {
    if (!validateStep()) {
      showToast({
        type: 'error',
        title: 'Check this step',
        message: 'Please fix the highlighted fields before continuing',
      });
      return;
    }
    setAnimationDirection('forward');
    setCurrentStep(prev => Math.min(prev + 1, steps.length - 1));
  };

  const handleBack = () => {
    setAnimationDirection('backward');
    setCurrentStep(prev => Math.max(prev - 1, 0));
  };

  const handleSkip = () => {
    setAnimationDirection('forward');
    setCurrentStep(prev => Math.min(prev + 1, steps.length - 1));
  };

  const handleStepPillClick = (targetIndex: number) => {
    if (targetIndex === currentStep) return;

    if (targetIndex > currentStep) {
      if (!validateStep()) {
        showToast({
          type: 'error',
          title: 'Finish this step first',
          message: 'Please resolve required or invalid fields before jumping ahead',
        });
        return;
      }
      setAnimationDirection('forward');
      setCurrentStep(targetIndex);
      return;
    }

    setAnimationDirection('backward');
    setCurrentStep(targetIndex);
  };

  const stepContent = (
    <Box
      key={steps[currentStep].key}
      sx={{
        display: 'grid',
        gridTemplateColumns: '1fr',
        rowGap: '16px',
        animation: `${animationDirection === 'forward' ? 'wizardStepInForward' : 'wizardStepInBackward'} 180ms ease`,
        '@keyframes wizardStepInForward': {
          '0%': { opacity: 0, transform: 'translateX(12px) translateY(2px)' },
          '100%': { opacity: 1, transform: 'translateX(0) translateY(0)' },
        },
        '@keyframes wizardStepInBackward': {
          '0%': { opacity: 0, transform: 'translateX(-12px) translateY(2px)' },
          '100%': { opacity: 1, transform: 'translateX(0) translateY(0)' },
        },
      }}
    >
      {currentStep === 0 && (
        <>
          <FormField
            label="Status"
            name="status"
            type="select"
            value={formData.status}
            onChange={handleChange}
            options={[
              { label: 'Active', value: 'Active' },
              { label: 'Inactive', value: 'Inactive' },
              { label: 'Recently Placed', value: 'Recently Placed' },
              { label: 'Not Available', value: 'Not Available' },
            ]}
            required
          />
          <FormField label="Full Name" name="name" value={formData.name} onChange={handleChange} required error={formErrors.name} />
          <FormField label="Email" name="email" type="email" value={formData.email} onChange={handleChange} error={formErrors.email} />
          <FormField label="Phone" name="phone" type="tel" value={formData.phone} onChange={handleChange} error={formErrors.phone} />
          <FormField label="Location" name="location" value={formData.location} onChange={handleChange} />
        </>
      )}

      {currentStep === 1 && (
        <>
          <FormField label="Primary Skills" name="primary_skills" value={formData.primary_skills} onChange={handleChange} />
          <FormField label="Secondary Skills" name="secondary_skills" value={formData.secondary_skills} onChange={handleChange} />
          <FormField label="Total Experience" name="total_experience" value={formData.total_experience} onChange={handleChange} />
          <FormField
            label="Availability"
            name="availability"
            type="select"
            value={formData.availability}
            onChange={handleChange}
            options={[
              { label: 'Immediate', value: 'Immediate' },
              { label: 'Two Weeks', value: 'Two Weeks' },
              { label: 'One Month', value: 'One Month' },
              { label: 'Two Months', value: 'Two Months' },
              { label: 'Flexible', value: 'Flexible' },
            ]}
          />
        </>
      )}

      {currentStep === 2 && (
        <>
          <FormField label="LinkedIn Profile" name="linkedin_profile" type="url" value={formData.linkedin_profile} onChange={handleChange} />
          <FormField label="Portfolio Link" name="portfolio_link" type="url" value={formData.portfolio_link} onChange={handleChange} />
        </>
      )}

      {currentStep === 3 && (
        <>
          <FormField label="Date of Birth" name="date_of_birth" type="date" value={formData.date_of_birth} onChange={handleChange} error={formErrors.date_of_birth} />
          <FormField label="Address" name="address" value={formData.address} onChange={handleChange} />
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
              { label: 'GST (UTC+4)', value: 'GST' },
            ]}
          />
          <FormField label="Degree Name" name="degree_name" value={formData.degree_name} onChange={handleChange} />
          <FormField
            label="Visa Status"
            name="visa_status"
            type="select"
            value={formData.visa_status}
            onChange={handleChange}
            options={[
              { label: 'US Citizen', value: 'US Citizen' },
              { label: 'Green Card', value: 'Green Card' },
              { label: 'H1B', value: 'H1B' },
              { label: 'L1', value: 'L1' },
              { label: 'E2', value: 'E2' },
              { label: 'O1', value: 'O1' },
              { label: 'Other', value: 'Other' },
            ]}
          />
          <FormField label="Expected Rate" name="expected_rate" value={formData.expected_rate} onChange={handleChange} error={formErrors.expected_rate} />
          <Button type="button" variant="text" color="inherit" onClick={() => setShowMoreBackground(prev => !prev)} sx={{ justifySelf: 'start', px: 0 }}>
            {showMoreBackground ? 'Hide extra background details' : 'Add more background details'}
          </Button>
          {showMoreBackground && (
            <>
              <FormField label="University" name="university" value={formData.university} onChange={handleChange} />
              <FormField label="Year of Passing" name="year_of_passing" type="number" value={formData.year_of_passing} onChange={handleChange} />
              <FormField label="Country of Origin" name="country_of_origin" value={formData.country_of_origin} onChange={handleChange} />
              <FormField label="How Got Visa" name="how_got_visa" value={formData.how_got_visa} onChange={handleChange} />
              <FormField label="Year Came to US" name="year_came_to_us" type="number" value={formData.year_came_to_us} onChange={handleChange} />
              <FormField label="SSN (last 4)" name="ssn" value={formData.ssn} onChange={handleChange} />
            </>
          )}
        </>
      )}

      {currentStep === 4 && (
        <>
          <FormField
            label="Why Looking For Job"
            name="why_looking_for_job"
            type="textarea"
            value={formData.why_looking_for_job}
            onChange={handleChange}
          />
          <FormField
            label="Preferred Work Location"
            name="preferred_work_location"
            type="select"
            value={formData.preferred_work_location}
            onChange={handleChange}
            options={[
              { label: 'Remote', value: 'Remote' },
              { label: 'Hybrid', value: 'Hybrid' },
              { label: 'Onsite', value: 'Onsite' },
              { label: 'Flexible', value: 'Flexible' },
            ]}
          />
          <FormField
            label="Preferred Work Type"
            name="preferred_work_type"
            type="select"
            value={formData.preferred_work_type}
            onChange={handleChange}
            options={[
              { label: 'Full-time', value: 'Full-time' },
              { label: 'Contract', value: 'Contract' },
              { label: 'Freelance', value: 'Freelance' },
              { label: 'Permanent', value: 'Permanent' },
            ]}
          />
          <FormField label="Payroll Company" name="payroll_company" value={formData.payroll_company} onChange={handleChange} />
          <FormField label="Payroll Contact Info" name="payroll_contact_info" value={formData.payroll_contact_info} onChange={handleChange} />
          <Button type="button" variant="text" color="inherit" onClick={() => setShowMoreAdditional(prev => !prev)} sx={{ justifySelf: 'start', px: 0 }}>
            {showMoreAdditional ? 'Hide project details' : 'Add project details'}
          </Button>

          {showMoreAdditional && projects.length > 0 && (
            <div style={{ display: 'grid', rowGap: '12px' }}>
              {projects.map(project => (
                <Paper key={project.id} variant="outlined" sx={{ p: 2, borderRadius: '10px' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                        {project.name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {project.domain} {project.city ? `• ${project.city}` : ''}
                      </Typography>
                    </Box>
                    <IconButton type="button" onClick={() => handleRemoveProject(project.id)} color="error" aria-label="Remove project">
                      <Trash2 className="w-4 h-4" />
                    </IconButton>
                  </Box>
                </Paper>
              ))}
            </div>
          )}

          {showMoreAdditional && !showProjectForm ? (
            <Button type="button" variant="outlined" onClick={() => setShowProjectForm(true)}>
              Add Project
            </Button>
          ) : showMoreAdditional ? (
            <Paper variant="outlined" sx={{ p: 2, borderRadius: '10px', backgroundColor: '#F9FAFB' }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr', gap: 2, mb: 2 }}>
                <TextField label="Project Name" name="name" value={projectForm.name} onChange={handleProjectFormChange} size="small" fullWidth />
                <TextField label="Domain" name="domain" value={projectForm.domain} onChange={handleProjectFormChange} size="small" fullWidth />
                <TextField label="City" name="city" value={projectForm.city} onChange={handleProjectFormChange} size="small" fullWidth />
                <TextField label="State" name="state" value={projectForm.state} onChange={handleProjectFormChange} size="small" fullWidth />
                <TextField label="Start Date" type="date" name="start_date" value={projectForm.start_date} onChange={handleProjectFormChange} size="small" fullWidth InputLabelProps={{ shrink: true }} />
                <TextField label="End Date" type="date" name="end_date" disabled={projectForm.currently_working} value={projectForm.end_date} onChange={handleProjectFormChange} size="small" fullWidth InputLabelProps={{ shrink: true }} />
                <FormControlLabel
                  control={<Checkbox name="currently_working" checked={projectForm.currently_working} onChange={handleProjectFormChange} />}
                  label="Currently Working"
                />
                <TextField label="Description" name="description" value={projectForm.description} onChange={handleProjectFormChange} size="small" fullWidth multiline rows={3} />
              </Box>

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <Button type="button" variant="contained" onClick={handleAddProject} sx={{ flex: 1 }}>
                  Save Project
                </Button>
                <Button type="button" variant="outlined" color="inherit" onClick={() => setShowProjectForm(false)} sx={{ flex: 1 }}>
                  Cancel
                </Button>
              </Stack>
            </Paper>
          ) : null}
        </>
      )}
    </Box>
  );

  return (
    <Dialog
      open
      onClose={onClose}
      fullWidth
      maxWidth="sm"
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
      <DialogTitle sx={{ pr: 7, fontWeight: 700, fontSize: '1.05rem', py: 2.25, borderBottom: '1px solid #F2F4F7' }}>
        Add New Consultant
        <IconButton onClick={onClose} sx={{ position: 'absolute', right: 12, top: 10 }} aria-label="Close">
          <X className="w-6 h-6" />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 3, backgroundColor: '#FCFCFD', overflowY: 'auto' }}>
        <form onSubmit={handleSubmit}>
          {submitError && (
            <ErrorAlert
              title="Failed to Add Consultant"
              message={submitError}
              onDismiss={() => setSubmitError(null)}
              retryLabel="Try Again"
            />
          )}

          <Box sx={{ mb: 3.5 }}>
            <Typography sx={{ fontSize: '1.35rem', fontWeight: 700, color: '#0F172A', letterSpacing: '-0.01em' }}>
              {steps[currentStep].title}
              {steps[currentStep].optional && (
                <Typography
                  component="span"
                  sx={{
                    ml: 1.25,
                    px: 1,
                    py: 0.3,
                    fontSize: '0.68rem',
                    color: '#344054',
                    fontWeight: 700,
                    borderRadius: 999,
                    border: '1px solid #D0D5DD',
                    backgroundColor: '#FFFFFF',
                    verticalAlign: 'middle',
                  }}
                >
                  Optional
                </Typography>
              )}
            </Typography>
            <Typography sx={{ mt: 0.75, color: '#667085', fontSize: '0.9rem', lineHeight: 1.5 }}>
              {steps[currentStep].description}
            </Typography>
            <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
              <Typography sx={{ fontSize: '0.78rem', color: '#475467', fontWeight: 600 }}>
                Step {currentStep + 1} of {steps.length}
              </Typography>
              <Typography sx={{ fontSize: '0.78rem', color: '#667085', fontWeight: 600 }}>
                {completionPercent}% Complete
              </Typography>
            </Box>
            <Box sx={{ mt: 1, height: 7, backgroundColor: '#EAECF0', borderRadius: 999, overflow: 'hidden' }}>
              <Box
                sx={{
                  height: '100%',
                  width: `${((currentStep + 1) / steps.length) * 100}%`,
                  background: 'linear-gradient(90deg, #5B4BFF 0%, #6941C6 100%)',
                  borderRadius: 999,
                  transition: 'width 180ms ease',
                }}
              />
            </Box>
            <Box
              sx={{
                mt: 1.5,
                display: 'flex',
                gap: 1,
                overflowX: 'auto',
                pb: 0.5,
                '&::-webkit-scrollbar': { height: 6 },
                '&::-webkit-scrollbar-thumb': { backgroundColor: '#D0D5DD', borderRadius: 999 },
              }}
            >
              {steps.map((step, idx) => {
                const active = idx === currentStep;
                const completed = idx < currentStep;
                return (
                  <Button
                    key={step.key}
                    type="button"
                    variant={active ? 'contained' : 'outlined'}
                    onClick={() => handleStepPillClick(idx)}
                    sx={{
                      whiteSpace: 'nowrap',
                      minWidth: 'fit-content',
                      px: 1.4,
                      py: 0.45,
                      borderRadius: 999,
                      textTransform: 'none',
                      fontSize: '0.74rem',
                      fontWeight: 700,
                      borderColor: active ? 'transparent' : '#D0D5DD',
                      color: active ? '#FFFFFF' : completed ? '#344054' : '#475467',
                      background: active ? 'linear-gradient(90deg, #5B4BFF 0%, #6941C6 100%)' : '#FFFFFF',
                      cursor: 'pointer',
                    }}
                  >
                    {step.title}
                    {step.optional ? ' (Optional)' : ''}
                  </Button>
                );
              })}
            </Box>
          </Box>

          {stepContent}

          <Box
            sx={{
              mt: 4,
              pt: 2.5,
              borderTop: '1px solid #E5E7EB',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1.5,
            }}
          >
            <Box sx={{ display: 'flex', gap: 1 }}>
              {currentStep > 0 && (
                <Button
                  type="button"
                  variant="outlined"
                  color="inherit"
                  onClick={handleBack}
                  sx={{ textTransform: 'none', fontWeight: 600, borderColor: '#D0D5DD', color: '#344054' }}
                >
                  Back
                </Button>
              )}
              <Button
                type="button"
                variant="text"
                color="inherit"
                onClick={onClose}
                sx={{ textTransform: 'none', fontWeight: 600, color: '#475467' }}
              >
                Cancel
              </Button>
            </Box>

            <Box sx={{ display: 'flex', gap: 1 }}>
              {steps[currentStep].optional && !isLastStep && (
                <Button type="button" variant="text" color="inherit" onClick={handleSkip} sx={{ textTransform: 'none', fontWeight: 600, color: '#475467' }}>
                  Skip
                </Button>
              )}
              {isLastStep ? (
                <Button
                  type="submit"
                  variant="contained"
                  disabled={loading}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 700,
                    px: 2.2,
                    background: 'linear-gradient(90deg, #5B4BFF 0%, #6941C6 100%)',
                    boxShadow: '0 1px 2px rgba(16, 24, 40, 0.05), 0 8px 20px rgba(91, 75, 255, 0.25)',
                  }}
                >
                  {loading ? 'Adding...' : 'Submit'}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="contained"
                  onClick={handleNext}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 700,
                    px: 2.2,
                    background: 'linear-gradient(90deg, #5B4BFF 0%, #6941C6 100%)',
                    boxShadow: '0 1px 2px rgba(16, 24, 40, 0.05), 0 8px 20px rgba(91, 75, 255, 0.25)',
                  }}
                >
                  Next
                </Button>
              )}
            </Box>
          </Box>
        </form>
      </DialogContent>
    </Dialog>
  );
};
