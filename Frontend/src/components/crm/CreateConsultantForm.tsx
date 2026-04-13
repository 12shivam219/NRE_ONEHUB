import { useState, useCallback, memo } from 'react';
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
}

// Create FormField component outside the parent component for stability
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
}: FormFieldProps) {
  return (
    <div>
      {type === 'select' ? (
        <TextField
          select
          label={label}
          name={name}
          value={value}
          onChange={onChange}
          required={required}
          error={Boolean(error)}
          helperText={error || ' '}
          size="small"
          fullWidth
        >
          <MenuItem value="">Select {label.toLowerCase()}</MenuItem>
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
          error={Boolean(error)}
          helperText={error || ' '}
          size="small"
          fullWidth
          multiline={type === 'textarea'}
          rows={type === 'textarea' ? 4 : undefined}
        />
      )}
    </div>
  );
});

interface CreateConsultantFormProps {
  onClose: () => void;
  onSuccess: () => void;
}

const FormSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="border-t border-gray-200 pt-6 mt-6 first:border-t-0 first:pt-0 first:mt-0">
    <h3 className="text-xs font-medium text-gray-900 mb-4">{title}</h3>
    <div className="space-y-4">{children}</div>
  </div>
);

export const CreateConsultantForm = ({ onClose, onSuccess }: CreateConsultantFormProps) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

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

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="lg" scroll="paper">
      <DialogTitle sx={{ pr: 7, fontWeight: 500 }}>
        Add New Consultant
        <IconButton onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }} aria-label="Close">
          <X className="w-6 h-6" />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Submit Error Alert */}
          {submitError && (
            <ErrorAlert
              title="Failed to Add Consultant"
              message={submitError}
              onDismiss={() => setSubmitError(null)}
              retryLabel="Try Again"
            />
          )}

          {/* Basic Information */}
          <FormSection title="Basic Information">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                label="What's your status?"
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
              <FormField
                label="What's your full name?"
                name="name"
                placeholder="John Smith"
                value={formData.name}
                onChange={handleChange}
                required
                error={formErrors.name}
              />
              <FormField
                label="What's your email address?"
                name="email"
                type="email"
                placeholder="john@example.com"
                value={formData.email}
                onChange={handleChange}
                error={formErrors.email}
              />
              <FormField
                label="What's your phone number?"
                name="phone"
                type="tel"
                placeholder="(555) 123-4567"
                value={formData.phone}
                onChange={handleChange}
                error={formErrors.phone}
              />
            </div>
          </FormSection>

          {/* Skills & Experience */}
          <FormSection title="Skills & Experience">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                label="What's your primary skill set?"
                name="primary_skills"
                placeholder="Java, Python, AWS"
                value={formData.primary_skills}
                onChange={handleChange}
              />
              <FormField
                label="Any secondary skills?"
                name="secondary_skills"
                placeholder="Docker, Kubernetes, SQL"
                value={formData.secondary_skills}
                onChange={handleChange}
              />
              <FormField
                label="How many years of experience do you have?"
                name="total_experience"
                placeholder="5 years, 10+ years"
                value={formData.total_experience}
                onChange={handleChange}
              />
              <FormField
                label="When are you available to start?"
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
            </div>
          </FormSection>

          {/* Online Presence */}
          <FormSection title="Online Presence">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                label="What's your LinkedIn profile URL?"
                name="linkedin_profile"
                type="url"
                placeholder="https://linkedin.com/in/username"
                value={formData.linkedin_profile}
                onChange={handleChange}
              />
              <FormField
                label="Do you have a portfolio website?"
                name="portfolio_link"
                type="url"
                placeholder="https://yourportfolio.com"
                value={formData.portfolio_link}
                onChange={handleChange}
              />
            </div>
          </FormSection>

          {/* Location & Timezone */}
          <FormSection title="Location & Timezone">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                label="What's your current location?"
                name="location"
                placeholder="San Francisco, CA"
                value={formData.location}
                onChange={handleChange}
              />
              <FormField
                label="What's your timezone?"
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
              <FormField
                label="What's your full address?"
                name="address"
                placeholder="123 Main St, City, State, ZIP"
                value={formData.address}
                onChange={handleChange}
              />
            </div>
          </FormSection>

          {/* Education */}
          <FormSection title="Education">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                label="What degree did you earn?"
                name="degree_name"
                placeholder="Bachelor's in Computer Science"
                value={formData.degree_name}
                onChange={handleChange}
              />
              <FormField
                label="Which university did you attend?"
                name="university"
                placeholder="University Name"
                value={formData.university}
                onChange={handleChange}
              />
              <FormField
                label="When did you graduate?"
                name="year_of_passing"
                type="number"
                placeholder="2020"
                value={formData.year_of_passing}
                onChange={handleChange}
              />
            </div>
          </FormSection>

          {/* Immigration & Personal */}
          <FormSection title="Immigration & Personal Information">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                label="What's your country of origin?"
                name="country_of_origin"
                placeholder="India, Canada, etc."
                value={formData.country_of_origin}
                onChange={handleChange}
              />
              <FormField
                label="What's your visa status?"
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
              <FormField
                label="How did you obtain your visa?"
                name="how_got_visa"
                placeholder="Sponsorship, Self-sponsored, etc."
                value={formData.how_got_visa}
                onChange={handleChange}
              />
              <FormField
                label="What year did you come to the US?"
                name="year_came_to_us"
                type="number"
                placeholder="2018"
                value={formData.year_came_to_us}
                onChange={handleChange}
              />
              <FormField
                label="What's your date of birth?"
                name="date_of_birth"
                type="date"
                value={formData.date_of_birth}
                onChange={handleChange}
                error={formErrors.date_of_birth}
              />
              <FormField
                label="What's your SSN (last 4 digits)?"
                name="ssn"
                placeholder="1234"
                value={formData.ssn}
                onChange={handleChange}
              />
            </div>
          </FormSection>

          {/* Work Preferences */}
          <FormSection title="Work Preferences">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                label="What's your preferred work location?"
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
                label="What type of work are you looking for?"
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
              <FormField
                label="What's your expected rate?"
                name="expected_rate"
                placeholder="$80-120/hr or $100k-150k/year"
                value={formData.expected_rate}
                onChange={handleChange}
                error={formErrors.expected_rate}
              />
              <FormField
                label="Why are you looking for a new opportunity?"
                name="why_looking_for_job"
                type="textarea"
                placeholder="Career growth, new challenges, relocation, etc."
                value={formData.why_looking_for_job}
                onChange={handleChange}
              />
            </div>
          </FormSection>

          {/* Payroll Information */}
          <FormSection title="Payroll Information">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                label="Which payroll company do you prefer?"
                name="payroll_company"
                placeholder="ADP, Paychex, etc."
                value={formData.payroll_company}
                onChange={handleChange}
              />
              <FormField
                label="What's your payroll contact information?"
                name="payroll_contact_info"
                placeholder="Name, email, or phone"
                value={formData.payroll_contact_info}
                onChange={handleChange}
              />
            </div>
          </FormSection>

          {/* Projects */}
          <FormSection title="Project Experience">
            <div className="space-y-4">
              {projects.length > 0 && (
                <div className="space-y-3">
                  {projects.map(project => (
                    <Paper
                      key={project.id}
                      variant="outlined"
                      sx={{ p: 2, display: 'flex', justifyContent: 'space-between', gap: 2, bgcolor: 'rgba(212,175,55,0.08)' }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                          {project.name}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {project.domain} • {project.city}, {project.state}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {project.start_date} - {project.currently_working ? 'Present' : project.end_date}
                        </Typography>
                        {project.description && (
                          <Typography variant="body2" sx={{ mt: 1, whiteSpace: 'pre-wrap' }}>
                            {project.description}
                          </Typography>
                        )}
                      </Box>
                      <IconButton
                        type="button"
                        onClick={() => handleRemoveProject(project.id)}
                        color="error"
                        aria-label="Remove project"
                      >
                        <Trash2 className="w-4 h-4" />
                      </IconButton>
                    </Paper>
                  ))}
                </div>
              )}

              {!showProjectForm ? (
                <Button
                  type="button"
                  variant="outlined"
                  onClick={() => setShowProjectForm(true)}
                  sx={{ width: '100%', borderStyle: 'dashed', borderWidth: 2 }}
                >
                  + Add Project
                </Button>
              ) : (
                <Paper variant="outlined" sx={{ p: 2, bgcolor: 'grey.50' }}>
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                      gap: 2,
                      mb: 2,
                    }}
                  >
                    <TextField
                      label="Project name"
                      name="name"
                      value={projectForm.name}
                      onChange={handleProjectFormChange}
                      size="small"
                      fullWidth
                    />
                    <TextField
                      label="Project domain"
                      name="domain"
                      value={projectForm.domain}
                      onChange={handleProjectFormChange}
                      size="small"
                      fullWidth
                    />
                    <TextField
                      label="City"
                      name="city"
                      value={projectForm.city}
                      onChange={handleProjectFormChange}
                      size="small"
                      fullWidth
                    />
                    <TextField
                      label="State"
                      name="state"
                      value={projectForm.state}
                      onChange={handleProjectFormChange}
                      size="small"
                      fullWidth
                    />
                    <TextField
                      label="Start date"
                      type="date"
                      name="start_date"
                      value={projectForm.start_date}
                      onChange={handleProjectFormChange}
                      size="small"
                      fullWidth
                      InputLabelProps={{ shrink: true }}
                    />
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr', gap: 1 }}>
                      <TextField
                        label="End date"
                        type="date"
                        name="end_date"
                        disabled={projectForm.currently_working}
                        value={projectForm.end_date}
                        onChange={handleProjectFormChange}
                        size="small"
                        fullWidth
                        InputLabelProps={{ shrink: true }}
                      />
                      <FormControlLabel
                        control={
                          <Checkbox
                            name="currently_working"
                            checked={projectForm.currently_working}
                            onChange={handleProjectFormChange}
                          />
                        }
                        label="Currently working"
                      />
                    </Box>
                  </Box>

                  <TextField
                    label="Project description"
                    name="description"
                    value={projectForm.description}
                    onChange={handleProjectFormChange}
                    size="small"
                    fullWidth
                    multiline
                    rows={3}
                    sx={{ mb: 2 }}
                  />

                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <Button
                      type="button"
                      variant="contained"
                      onClick={handleAddProject}
                      sx={{ flex: 1 }}
                    >
                      Save Project
                    </Button>
                    <Button
                      type="button"
                      variant="outlined"
                      color="inherit"
                      onClick={() => setShowProjectForm(false)}
                      sx={{ flex: 1 }}
                    >
                      Cancel
                    </Button>
                  </Stack>
                </Paper>
              )}
            </div>
          </FormSection>

          {/* Form Actions */}
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            sx={{ pt: 3, borderTop: 1, borderColor: 'divider' }}
          >
            <Button
              type="submit"
              variant="contained"
              disabled={loading}
              sx={{ flex: 1 }}
            >
              {loading ? 'Adding...' : 'Add Consultant'}
            </Button>
            <Button
              type="button"
              variant="outlined"
              color="inherit"
              onClick={onClose}
              sx={{ flex: 1 }}
            >
              Cancel
            </Button>
          </Stack>
        </form>
      </DialogContent>
    </Dialog>
  );
};
