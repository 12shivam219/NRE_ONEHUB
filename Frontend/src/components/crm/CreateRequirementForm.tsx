import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { AlertCircle, Mail, Loader, X } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../contexts/ToastContext';
import { useOfflineCache } from '../../hooks/useOfflineCache';
import { createRequirement, getRequirements } from '../../lib/api/requirements';
import { getConsultants } from '../../lib/api/consultants';
import { findSimilarRequirements } from '../../lib/requirementUtils';
import { validateRequirementForm } from '../../lib/formValidation';
import { sanitizeText } from '../../lib/utils';
import { ErrorAlert } from '../common/ErrorAlert';
import { cacheRequirements, type CachedRequirement } from '../../lib/offlineDB';
import { supabase } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import { JDParserDialog } from './JDParserDialog';
import { BatchJDParserDialog } from './BatchJDParserDialog';
import type { SelectChangeEvent } from '@mui/material/Select';

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
  options?: FormFieldOption[];
  error?: string;
  id?: string;
  autoComplete?: string;
  rows?: number;
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
  id,
  autoComplete,
  rows,
}: FormFieldProps) {
  // Generate a unique ID if one isn't provided to ensure accessibility
  const fieldId = id || `field-${name}`;

  return (
    <div>
      {type === 'select' ? (
        <TextField
          select
          id={fieldId}
          name={name}
          label={label}
          value={value}
          onChange={onChange}
          required={required}
          error={Boolean(error)}
          helperText={error}
          size="small"
          fullWidth
          // MUI handles accessibility automatically when 'id' is provided.
          // Manually setting htmlFor in InputLabelProps can cause mismatches, especially with Select.
          InputLabelProps={{
            shrink: true,
            sx: {
              fontSize: '0.75rem',
              fontWeight: 600,
              color: '#3A445D',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              '&.Mui-focused': { color: '#4F46E5' },
            }
          }}
          sx={{
            mb: 1,
            '& .MuiOutlinedInput-root': {
              borderRadius: '8px',
              backgroundColor: '#fff',
              fontSize: '0.9rem',
              '& fieldset': {
                borderColor: '#D5DAE1',
              },
              '&:hover fieldset': {
                borderColor: '#C7CEDB',
              },
              '&.Mui-focused fieldset': {
                borderColor: '#4F46E5',
                boxShadow: '0 0 0 3px rgba(79, 70, 229, 0.08)',
              },
            },
            '& .MuiFormHelperText-root': {
              fontSize: '0.75rem',
              mt: 0.5,
              color: '#ef4444',
            },
            '& .MuiOutlinedInput-input::placeholder': {
              color: '#9CA3B0',
              opacity: 1,
              fontSize: '0.9rem',
            },
          }}
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
          id={fieldId}
          name={name}
          label={label}
          type={type === 'textarea' ? 'text' : type}
          value={value}
          onChange={onChange as unknown as (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void}
          placeholder={placeholder}
          required={required}
          error={Boolean(error)}
          helperText={error}
          size="small"
          fullWidth
          autoComplete={autoComplete}
          multiline={type === 'textarea'}
          rows={type === 'textarea' ? (rows ?? 2) : undefined}
          // Rely on MUI's default label-input association via the 'id' prop
          InputLabelProps={{
            shrink: true,
            sx: {
              fontSize: '0.75rem',
              fontWeight: 600,
              color: '#3A445D',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              '&.Mui-focused': { color: '#4F46E5' },
            }
          }}
          sx={{
            mb: 1,
            '& .MuiOutlinedInput-root': {
              borderRadius: '8px',
              backgroundColor: '#fff',
              fontSize: '0.9rem',
              '& fieldset': {
                borderColor: '#D5DAE1',
              },
              '&:hover fieldset': {
                borderColor: '#C7CEDB',
              },
              '&.Mui-focused fieldset': {
                borderColor: '#4F46E5',
                boxShadow: '0 0 0 3px rgba(79, 70, 229, 0.08)',
              },
            },
            '& .MuiFormHelperText-root': {
              fontSize: '0.75rem',
              mt: 0.5,
              color: '#ef4444',
            },
            '& .MuiOutlinedInput-input::placeholder': {
              color: '#9CA3B0',
              opacity: 1,
              fontSize: '0.9rem',
            },
          }}
        />
      )}
    </div>
  );
});

interface CreateRequirementFormProps {
  onClose: () => void;
  onSuccess: () => void;
  initialData?: {
    title?: string;
    implementation_partner?: string;
    client?: string;
    primary_tech_stack?: string;
    rate?: string;
    remote?: string;
    location?: string;
    duration?: string;
    vendor_company?: string;
    vendor_person_name?: string;
    vendor_phone?: string;
    vendor_email?: string;
    description?: string;
  };
}

const FormSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section
    style={{
      background: 'transparent',
      border: 'none',
      borderRadius: '0',
      padding: '0',
      marginBottom: '2rem',
    }}
  >
    <h3 style={{ fontSize: '0.7rem', fontWeight: 700, color: '#6B7280', marginBottom: '1.25rem', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
      {title}
    </h3>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
      {children}
    </div>
  </section>
);

export const CreateRequirementForm = ({ onClose, onSuccess, initialData }: CreateRequirementFormProps) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { isOnline, queueOfflineOperation } = useOfflineCache();
  const [consultants, setConsultants] = useState<Consultant[]>([]);
  const [allRequirements, setAllRequirements] = useState<Database['public']['Tables']['requirements']['Row'][]>([]);
  const [loading, setLoading] = useState(false);
  const [scanningGmail, setScanningGmail] = useState(false);
  const [gmailJobs, setGmailJobs] = useState<Array<{ title: string; company: string; description: string; skills: string; location: string; vendor: string; vendorContact: string; vendorEmail: string; vendorPhone: string }>>([]);
  const [showGmailJobs, setShowGmailJobs] = useState(false);
  const [selectedGmailJob, setSelectedGmailJob] = useState<number | null>(null);
  const [showJDParser, setShowJDParser] = useState(false);
  const [showBatchJDParser, setShowBatchJDParser] = useState(false);
  const [similarRequirements, setSimilarRequirements] = useState<Database['public']['Tables']['requirements']['Row'][]>([]);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    title: initialData?.title || '',
    implementation_partner: initialData?.implementation_partner || '',
    client: initialData?.client || '',
    status: 'NEW' as const,
    consultant_id: '',
    rate: initialData?.rate || '',
    primary_tech_stack: initialData?.primary_tech_stack || '',
    vendor_company: initialData?.vendor_company || '',
    vendor_website: '',
    vendor_person_name: initialData?.vendor_person_name || '',
    vendor_phone: initialData?.vendor_phone || '',
    vendor_email: initialData?.vendor_email || '',
    description: initialData?.description || '',
    next_step: '',
    remote: initialData?.remote || '',
    duration: initialData?.duration || '',
  });

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | SelectChangeEvent<string>) => {
    const { name, value } = e.target as { name: string; value: string };
    setFormData(prevState => ({ ...prevState, [name]: value }));
  }, []);

  // Separate effect for debounced similarity check
  useEffect(() => {
    const timer = setTimeout(() => {
      const similar = findSimilarRequirements(
        { 
          title: formData.title, 
          company: formData.implementation_partner, 
          primary_tech_stack: formData.primary_tech_stack 
        },
        allRequirements
      );
      setSimilarRequirements(similar);
    }, 300); // Wait 300ms after user stops typing

    return () => clearTimeout(timer);
  }, [formData.title, formData.implementation_partner, formData.primary_tech_stack, allRequirements]);

  const loadConsultants = useCallback(async () => {
    if (!user) return;
    const result = await getConsultants(user.id);
    if (result.success && result.consultants) {
      setConsultants(result.consultants);
    }
  }, [user]);

  const loadRequirements = useCallback(async () => {
    if (!user) return;
    const result = await getRequirements(user.id);
    if (result.success && result.requirements) {
      setAllRequirements(result.requirements);
    }
  }, [user]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      await Promise.resolve();
      if (cancelled) return;
      await loadConsultants();
      await loadRequirements();
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [loadConsultants, loadRequirements]);

  const consultantOptions = useMemo(
    () => consultants.map(c => ({ label: c.name, value: c.id })),
    [consultants]
  );

  const handleScanGmail = useCallback(async () => {
    try {
      setScanningGmail(true);
      
      // Get the user's auth token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        showToast({
          type: 'error',
          message: 'You need to be logged in to scan emails',
        });
        return;
      }

      // Fetch emails from Gmail
      const { data: emailsData, error: emailsError } = await supabase.functions.invoke('fetch-gmail-emails', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: {
          userId: user?.id,
          query: 'subject:(job OR hiring OR position OR opening OR role OR career)',
          maxResults: 10,
        },
      });

      if (emailsError || !emailsData?.success) {
        showToast({
          type: 'error',
          message: emailsData?.error || 'Failed to fetch emails',
        });
        return;
      }

      // Process each email with job extraction
      const jobs: Array<{ title: string; company: string; description: string; skills: string; location: string; vendor: string; vendorContact: string; vendorEmail: string; vendorPhone: string }> = [];
      
      for (const email of emailsData.emails || []) {
        const { data: jobData } = await supabase.functions.invoke('extract-job-details', {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          body: {
            userId: user?.id,
            emailContent: email.body,
            emailSubject: email.subject,
            emailFrom: email.from,
          },
        });

        if (jobData?.success && jobData.data) {
          const data = jobData.data;
          // Filter for remote jobs only
          const isRemote = data.workLocationType?.toLowerCase().includes('remote');
          
          if (isRemote) {
            jobs.push({
              title: data.jobTitle || 'N/A',
              company: data.hiringCompany || 'N/A',
              description: data.jobDescription || '',
              skills: Array.isArray(data.keySkills) ? data.keySkills.join(', ') : '',
              location: data.workLocationType || 'Remote',
              vendor: data.vendor || '',
              vendorContact: data.vendorContact || '',
              vendorEmail: data.vendorEmail || '',
              vendorPhone: data.vendorPhone || '',
            });
          }
        }
      }

      if (jobs.length === 0) {
        showToast({
          type: 'info',
          message: 'No remote job postings found in recent emails',
        });
        return;
      }

      setGmailJobs(jobs);
      setShowGmailJobs(true);
      setSelectedGmailJob(0);
      
      showToast({
        type: 'success',
        message: `Found ${jobs.length} job posting(s)`,
      });
    } catch {
      // Silently handle Gmail scanning error
      showToast({
        type: 'error',
        message: 'Error scanning Gmail emails',
      });
    } finally {
      setScanningGmail(false);
    }
  }, [showToast, user?.id]);

  const handleSelectGmailJob = useCallback((job: { title: string; company: string; description: string; skills: string; location: string; vendor: string; vendorContact: string; vendorEmail: string; vendorPhone: string }) => {
    setFormData(prevState => ({
      ...prevState,
      title: job.title,
      implementation_partner: job.vendor,
      client: job.company,
      description: job.description,
      primary_tech_stack: job.skills,
      vendor_person_name: job.vendorContact,
      vendor_email: job.vendorEmail,
      vendor_phone: job.vendorPhone,
    }));
    setShowGmailJobs(false);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || loading) return; // Prevent double-submit

    // Validate form
    const validation = validateRequirementForm({
      title: formData.title,
      company: formData.implementation_partner,
      vendor_email: formData.vendor_email,
      vendor_website: formData.vendor_website,
      rate: formData.rate,
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
      const requirementData = {
        user_id: user.id,
        title: sanitizeText(formData.title),
        implementation_partner: sanitizeText(formData.implementation_partner),
        client: sanitizeText(formData.client),
        status: formData.status,
        consultant_id: formData.consultant_id || null,
        rate: formData.rate || null,
        primary_tech_stack: sanitizeText(formData.primary_tech_stack),
        vendor_company: sanitizeText(formData.vendor_company),
        vendor_website: formData.vendor_website || null,
        vendor_person_name: sanitizeText(formData.vendor_person_name),
        // 📱 Store phone exactly as user entered - database trigger auto-normalizes for search
        vendor_phone: formData.vendor_phone || null,
        vendor_email: formData.vendor_email || null,
        description: sanitizeText(formData.description),
        next_step: sanitizeText(formData.next_step),
        remote: formData.remote || null,
        duration: formData.duration || null,
      };

      // Check if offline - queue operation
      if (!isOnline) {
        const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        await queueOfflineOperation('CREATE', 'requirement', tempId, requirementData);
        
        // Optimistically add to local cache
        const optimisticRequirement = {
          id: tempId,
          ...requirementData,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          requirement_number: 0, // Will be assigned on sync
        } as Database['public']['Tables']['requirements']['Row'];
        
        await cacheRequirements([optimisticRequirement as CachedRequirement], user.id);
        
        setLoading(false);
        showToast({
          type: 'info',
          title: 'Queued for Sync',
          message: 'Requirement will be created when you come back online',
        });
        onSuccess(); // Close form and refresh
        return;
      }

      // Online - create normally
      const result = await createRequirement(requirementData, user.id);

      setLoading(false);
      if (result.success) {
        // Use returned requirement or create an optimistic one if fetch failed on server
        const createdRequirement = result.requirement || ({
          id: `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          requirement_number: 0,
          user_id: user.id,
          title: sanitizeText(formData.title),
          implementation_partner: sanitizeText(formData.implementation_partner),
          client: sanitizeText(formData.client),
          status: formData.status,
          consultant_id: formData.consultant_id || null,
          rate: formData.rate || null,
          primary_tech_stack: sanitizeText(formData.primary_tech_stack),
          vendor_company: sanitizeText(formData.vendor_company),
          vendor_website: formData.vendor_website || null,
          vendor_person_name: sanitizeText(formData.vendor_person_name),
          // 📱 Store phone exactly as user entered - database trigger auto-normalizes for search
          vendor_phone: formData.vendor_phone || null,
          vendor_email: formData.vendor_email || null,
          description: sanitizeText(formData.description),
          next_step: sanitizeText(formData.next_step),
          remote: formData.remote || null,
          duration: formData.duration || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          created_by: user.id,
          updated_by: user.id,
        } as any);

        // Create initial next step comment if next_step has a value
        if (formData.next_step.trim() && result.requirement?.id) {
          try {
            await supabase
              .from('next_step_comments' as const)
              .insert([
                {
                  requirement_id: result.requirement.id,
                  user_id: user.id,
                  comment_text: formData.next_step.trim(),
                } as Database['public']['Tables']['next_step_comments']['Insert'],
              ]);
          } catch {
            // Silently handle comment creation error
            // Don't fail the whole operation if comment creation fails
          }
        }

        showToast({
          type: 'success',
          title: 'Requirement Created',
          message: 'New requirement has been successfully created',
        });
        // Dispatch event to refresh requirements list
        window.dispatchEvent(new CustomEvent('requirement-created', { detail: createdRequirement }));
        onSuccess();
      } else {
        setSubmitError(result.error || 'Failed to create requirement');
        showToast({
          type: 'error',
          title: 'Failed',
          message: result.error || 'Failed to create requirement',
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

  return (
    <Dialog 
      open 
      onClose={onClose} 
      fullWidth 
      maxWidth="sm" 
      scroll="paper"
      PaperProps={{
        sx: {
          borderRadius: '12px',
          background: '#FFFFFF',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        },
      }}
      slotProps={{
        backdrop: {
          sx: {
            backgroundColor: 'rgba(15, 23, 42, 0.55)',
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
          color: '#0B1220',
          borderBottom: '1px solid #E9EBF0',
          paddingBottom: '16px',
        }}
      >
        Create New Requirement
        <IconButton 
          onClick={onClose} 
          sx={{ 
            position: 'absolute', 
            right: 8, 
            top: 8,
            color: '#6B7280',
            '&:hover': {
              backgroundColor: 'rgba(15, 23, 42, 0.08)',
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
          backgroundColor: '#FFFFFF',
          padding: '32px',
          overflowY: 'auto',
          '&::-webkit-scrollbar': {
            width: '8px',
          },
          '&::-webkit-scrollbar-track': {
            backgroundColor: '#F6F7FB',
          },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: '#D5DAE1',
            borderRadius: '4px',
            '&:hover': {
              backgroundColor: '#C7CEDB',
            },
          },
        }}
      >
        <div style={{ padding: '0' }}>
          {/* Gmail Jobs Scanner */}
          {showGmailJobs && gmailJobs.length > 0 ? (
            <div style={{ marginBottom: '2rem', padding: '1rem', backgroundColor: '#EEF3FF', borderRadius: '8px', border: '1px solid #D5DAE1' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ fontWeight: 600, color: '#4F46E5', margin: 0, fontSize: '0.9rem' }}>Jobs Found in Gmail ({gmailJobs.length})</h3>
                <button
                  type="button"
                  onClick={() => setShowGmailJobs(false)}
                  style={{ padding: '0.5rem 1rem', backgroundColor: 'transparent', color: '#4F46E5', border: '1px solid #D5DAE1', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500 }}
                >
                  Cancel
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {gmailJobs.map((job, idx) => (
                  <div
                    key={idx}
                    onClick={() => handleSelectGmailJob(job)}
                    style={{
                      padding: '1rem',
                      backgroundColor: selectedGmailJob === idx ? '#F5F4FF' : '#ffffff',
                      border: selectedGmailJob === idx ? '2px solid #4F46E5' : '1px solid #E9EBF0',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'all 200ms ease',
                    }}
                  >
                    <div style={{ fontWeight: 600, color: '#0B1220', marginBottom: '0.25rem', fontSize: '0.95rem' }}>{job.title}</div>
                    <div style={{ fontSize: '0.85rem', color: '#6B7280', marginBottom: '0.25rem' }}>{job.company}</div>
                    {job.skills && <div style={{ fontSize: '0.75rem', color: '#4F46E5', marginBottom: '0.25rem' }}>Skills: {job.skills}</div>}
                    <div style={{ fontSize: '0.8rem', color: '#6B7280', maxHeight: '60px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {job.description}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ marginBottom: '2rem' }}>
              <button
                type="button"
                onClick={handleScanGmail}
                disabled={scanningGmail}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  padding: '0.875rem 1.25rem',
                  backgroundColor: scanningGmail ? '#F1F3F8' : '#ffffff',
                  border: '1px solid #D5DAE1',
                  color: scanningGmail ? '#9CA3B0' : '#3A445D',
                  borderRadius: '8px',
                  cursor: scanningGmail ? 'not-allowed' : 'pointer',
                  fontWeight: 500,
                  width: '100%',
                  fontSize: '0.9rem',
                  transition: 'all 200ms ease',
                }}
              >
                {scanningGmail ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Scanning Gmail...
                  </>
                ) : (
                  <>
                    <Mail className="w-4 h-4" />
                    Scan Gmail for Jobs
                  </>
                )}
              </button>
            </div>
          )}
          
          <div style={{ marginBottom: '2rem' }}>
            <Stack direction="row" spacing={1}>
              <Button
                variant="outlined"
                onClick={() => setShowJDParser(true)}
                sx={{ 
                  textTransform: 'none',
                  borderColor: '#D5DAE1',
                  color: '#3A445D',
                  fontSize: '0.9rem',
                  fontWeight: 500,
                  '&:hover': {
                    borderColor: '#C7CEDB',
                    backgroundColor: '#F1F3F8',
                  }
                }}
              >
                📄 JD Parser
              </Button>

              <Button
                variant="outlined"
                onClick={() => setShowBatchJDParser(true)}
                sx={{ 
                  textTransform: 'none',
                  borderColor: '#D5DAE1',
                  color: '#3A445D',
                  fontSize: '0.9rem',
                  fontWeight: 500,
                  '&:hover': {
                    borderColor: '#C7CEDB',
                    backgroundColor: '#F1F3F8',
                  }
                }}
              >
                📑 Batch JD Parser
              </Button>
            </Stack>
          </div>

          <form onSubmit={handleSubmit}>
          {/* Submit Error Alert */}
          {submitError && (
            <div style={{ marginBottom: '2rem' }}>
              <ErrorAlert
                title="Failed to Create Requirement"
                message={submitError}
                onDismiss={() => setSubmitError(null)}
                retryLabel="Try Again"
              />
            </div>
          )}

          {/* Similar Requirements Warning */}
          {similarRequirements.length > 0 && (
            <div style={{ backgroundColor: '#FEF3C7', border: '1px solid #FBCA04', borderRadius: '8px', padding: '1rem', marginBottom: '2rem', display: 'flex', gap: '0.75rem' }}>
              <AlertCircle className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" style={{ marginTop: '2px' }} />
              <div style={{ fontSize: '0.85rem' }}>
                <p style={{ fontWeight: 600, color: '#92400E', marginBottom: '0.25rem' }}>Similar requirements found</p>
                <p style={{ color: '#92400E' }}>
                  {similarRequirements.length} similar requirement(s) exist. Review before creating.
                </p>
              </div>
            </div>
          )}

          {/* Core Details */}
          <FormSection title="Core Details">
            <FormField
              label="Job Title"
              name="title"
              id="req-title"
              autoComplete="organization-title"
              placeholder="e.g., Senior Java Developer"
              value={formData.title}
              onChange={handleChange}
              required
              error={formErrors.title}
            />
            <FormField
              label="Implementation Partner"
              name="implementation_partner"
              id="req-implementation-partner"
              autoComplete="organization"
              placeholder="e.g., ABC Staffing"
              value={formData.implementation_partner}
              onChange={handleChange}
              required
              error={formErrors.implementation_partner}
            />
            <FormField
              label="Client"
              name="client"
              id="req-client"
              autoComplete="organization"
              placeholder="e.g., TechCorp Inc"
              value={formData.client}
              onChange={handleChange}
              error={formErrors.client}
            />
            <FormField
              label="Status"
              name="status"
              id="req-status"
              type="select"
              value={formData.status}
              onChange={handleChange}
              options={[
                { label: 'New', value: 'NEW' },
                { label: 'In Progress', value: 'IN_PROGRESS' },
                { label: 'Submitted', value: 'SUBMITTED' },
                { label: 'Interview', value: 'INTERVIEW' },
                { label: 'Offer', value: 'OFFER' },
                { label: 'Rejected', value: 'REJECTED' },
                { label: 'Closed', value: 'CLOSED' },
              ]}
            />
            <FormField
              label="Assigned Consultant"
              name="consultant_id"
              id="req-consultant"
              type="select"
              value={formData.consultant_id}
              onChange={handleChange}
              options={consultantOptions}
            />
            <FormField
              label="Next Action"
              name="next_step"
              id="req-next-step"
              autoComplete="off"
              placeholder="e.g., Send profile, Schedule interview"
              value={formData.next_step}
              onChange={handleChange}
            />
          </FormSection>

          {/* Work Details */}
          <FormSection title="Work Details">
            <FormField
              label="Key Skills"
              name="primary_tech_stack"
              id="req-tech-stack"
              autoComplete="off"
              placeholder="e.g., Java, Spring Boot, AWS"
              value={formData.primary_tech_stack}
              onChange={handleChange}
            />
            <FormField
              label="Rate / Salary"
              name="rate"
              id="req-rate"
              autoComplete="off"
              placeholder="Any format: $80k, $80,000-$120,000, 80k-120k, £50-70k, $80k/year, etc."
              value={formData.rate}
              onChange={handleChange}
              error={formErrors.rate}
            />
            <FormField
              label="Work Type"
              name="remote"
              id="req-remote"
              autoComplete="off"
              placeholder="e.g., Remote, Hybrid, Onsite"
              value={formData.remote}
              onChange={handleChange}
            />
            <FormField
              label="Duration"
              name="duration"
              id="req-duration"
              autoComplete="off"
              placeholder="e.g., 6 months, Full-time"
              value={formData.duration}
              onChange={handleChange}
            />
          </FormSection>

          {/* Vendor Information */}
          <FormSection title="Vendor">
            <FormField
              label="Vendor Company"
              name="vendor_company"
              id="req-vendor-company"
              autoComplete="organization"
              placeholder="e.g., ABC Staffing"
              value={formData.vendor_company}
              onChange={handleChange}
            />
            <FormField
              label="Vendor Website"
              name="vendor_website"
              id="req-vendor-website"
              autoComplete="url"
              type="url"
              placeholder="https://vendor.com"
              value={formData.vendor_website}
              onChange={handleChange}
              error={formErrors.vendor_website}
            />
            <FormField
              label="Vendor Contact"
              name="vendor_person_name"
              id="req-vendor-contact"
              autoComplete="name"
              placeholder="e.g., Jane Doe"
              value={formData.vendor_person_name}
              onChange={handleChange}
            />
            <FormField
              label="Vendor Phone"
              name="vendor_phone"
              id="req-vendor-phone"
              autoComplete="tel"
              type="text"
              placeholder="(555) 123-4567 Ext-1234"
              value={formData.vendor_phone}
              onChange={handleChange}
            />
            <FormField
              label="Vendor Email"
              name="vendor_email"
              id="req-vendor-email"
              autoComplete="email"
              type="email"
              placeholder="vendor@example.com"
              value={formData.vendor_email}
              onChange={handleChange}
              error={formErrors.vendor_email}
            />
          </FormSection>

          {/* Description */}
          <FormSection title="Description">
            <div style={{ gridColumn: '1 / -1' }}>
              <FormField
                label="Role Description"
                name="description"
                id="req-description"
                type="textarea"
                autoComplete="off"
                placeholder="Full job description and key responsibilities..."
                value={formData.description}
                onChange={handleChange}
                rows={8}
              />
            </div>
          </FormSection>

          {/* Form Actions */}
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '2rem', paddingTop: '2rem', borderTop: '1px solid #E9EBF0' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                backgroundColor: '#F1F3F8',
                color: '#3A445D',
                border: '1px solid #D5DAE1',
                padding: '0.75rem 1.5rem',
                borderRadius: '8px',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '0.9rem',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#E9EBF0';
                e.currentTarget.style.borderColor = '#C7CEDB';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#F1F3F8';
                e.currentTarget.style.borderColor = '#D5DAE1';
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                backgroundColor: loading ? '#8B7EEF' : '#4F46E5',
                color: '#FFFFFF',
                border: 'none',
                padding: '0.75rem 1.5rem',
                borderRadius: '8px',
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '0.9rem',
                transition: 'all 0.2s ease',
                opacity: loading ? 0.85 : 1,
                boxShadow: loading ? 'none' : '0 1px 3px rgba(79, 70, 229, 0.3)',
              }}
              onMouseEnter={(e) => !loading && (
                e.currentTarget.style.backgroundColor = '#4338CA',
                e.currentTarget.style.boxShadow = '0 4px 6px rgba(79, 70, 229, 0.4)'
              )}
              onMouseLeave={(e) => !loading && (
                e.currentTarget.style.backgroundColor = '#4F46E5',
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(79, 70, 229, 0.3)'
              )}
            >
              {loading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
        </div>

        <JDParserDialog
          open={showJDParser}
          onClose={() => setShowJDParser(false)}
          onParsedData={(extraction, cleanedText) => {
            setFormData(prev => ({
              ...prev,
              title: extraction.jobTitle ?? prev.title,
              implementation_partner: extraction.hiringCompany ?? prev.implementation_partner,
              primary_tech_stack: (extraction.keySkills ?? []).length > 0 ? (extraction.keySkills ?? []).join(', ') : prev.primary_tech_stack,
              rate: extraction.rate ?? prev.rate,
              remote: extraction.workLocationType ?? prev.remote,
              duration: extraction.duration ?? prev.duration,
              vendor_company: extraction.vendor ?? prev.vendor_company,
              vendor_person_name: extraction.vendorContact ?? prev.vendor_person_name,
              vendor_phone: extraction.vendorPhone ?? prev.vendor_phone,
              vendor_email: extraction.vendorEmail ?? prev.vendor_email,
              description: cleanedText || prev.description,
            }));
            setShowJDParser(false);
          }}
        />

        <BatchJDParserDialog
          open={showBatchJDParser}
          onClose={() => setShowBatchJDParser(false)}
          onParsedData={(extraction, cleanedText) => {
            setFormData(prev => ({
              ...prev,
              title: extraction.jobTitle ?? prev.title,
              implementation_partner: extraction.hiringCompany ?? prev.implementation_partner,
              primary_tech_stack: (extraction.keySkills ?? []).length > 0 ? (extraction.keySkills ?? []).join(', ') : prev.primary_tech_stack,
              rate: extraction.rate ?? prev.rate,
              remote: extraction.workLocationType ?? prev.remote,
              duration: extraction.duration ?? prev.duration,
              vendor_company: extraction.vendor ?? prev.vendor_company,
              vendor_person_name: extraction.vendorContact ?? prev.vendor_person_name,
              vendor_phone: extraction.vendorPhone ?? prev.vendor_phone,
              vendor_email: extraction.vendorEmail ?? prev.vendor_email,
              description: cleanedText || prev.description,
            }));
            setShowBatchJDParser(false);
          }}
        />

      </DialogContent>
    </Dialog>
  );
};