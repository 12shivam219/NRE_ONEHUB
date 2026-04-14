import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { AlertCircle, Mail, Loader, X, Briefcase, Users, FileText, Clock } from 'lucide-react';
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
import DialogContent from '@mui/material/DialogContent';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import { JDParserDialog } from './JDParserDialog';
import { BatchJDParserDialog } from './BatchJDParserDialog';
import type { SelectChangeEvent } from '@mui/material/Select';

// Spinner animation
const spinnerStyle = `
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  .spinner-spin {
    animation: spin 1s linear infinite;
  }
`;

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
  options,
  error,
  id,
  autoComplete,
  rows,
  helperText,
}: FormFieldProps) {
  const fieldId = id || `field-${name}`;

  return (
    <div style={{ marginBottom: '1.25rem', width: '100%' }}>
      <label 
        htmlFor={fieldId}
        style={{
          display: 'block',
          fontSize: '0.875rem',
          fontWeight: 600,
          color: '#1F2937',
          marginBottom: '0.5rem',
          letterSpacing: '0.3px',
        }}
      >
        {label}
        {required && <span style={{ color: '#EF4444', marginLeft: '0.25rem' }}>*</span>}
      </label>
      
      {type === 'select' ? (
        <TextField
          select
          id={fieldId}
          name={name}
          value={value}
          onChange={onChange}
          required={required}
          error={Boolean(error)}
          helperText={error || helperText}
          size="small"
          fullWidth
          InputLabelProps={{
            shrink: false,
            sx: { display: 'none' }
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: '10px',
              backgroundColor: '#F9FAFB',
              fontSize: '0.9rem',
              transition: 'all 0.2s ease',
              border: '1px solid #E5E7EB',
              '& fieldset': {
                borderColor: '#E5E7EB',
              },
              '&:hover': {
                backgroundColor: '#F3F4F6',
                '& fieldset': {
                  borderColor: '#D1D5DB',
                },
              },
              '&.Mui-focused fieldset': {
                borderColor: '#4F46E5',
                boxShadow: '0 0 0 3px rgba(79, 70, 229, 0.1)',
              },
              '& .MuiOutlinedInput-input': {
                padding: '0.75rem',
                color: '#1F2937',
                '&::placeholder': {
                  color: '#9CA3AF',
                  opacity: 1,
                },
              },
            },
            '& .MuiFormHelperText-root': {
              fontSize: '0.75rem',
              marginTop: '0.375rem',
              color: error ? '#EF4444' : '#6B7280',
            },
          }}
        >
          <MenuItem value="" disabled>
            <span style={{ color: '#9CA3AF' }}>Select {label.toLowerCase()}</span>
          </MenuItem>
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
          type={type === 'textarea' ? 'text' : type}
          value={value}
          onChange={onChange as unknown as (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void}
          placeholder={placeholder}
          required={required}
          error={Boolean(error)}
          helperText={error || helperText}
          size="small"
          fullWidth
          autoComplete={autoComplete}
          multiline={type === 'textarea'}
          rows={type === 'textarea' ? (rows ?? 4) : undefined}
          InputLabelProps={{
            shrink: false,
            sx: { display: 'none' }
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: '10px',
              backgroundColor: '#F9FAFB',
              fontSize: '0.9rem',
              transition: 'all 0.2s ease',
              border: '1px solid #E5E7EB',
              '& fieldset': {
                borderColor: '#E5E7EB',
              },
              '&:hover': {
                backgroundColor: '#F3F4F6',
                '& fieldset': {
                  borderColor: '#D1D5DB',
                },
              },
              '&.Mui-focused fieldset': {
                borderColor: '#4F46E5',
                boxShadow: '0 0 0 3px rgba(79, 70, 229, 0.1)',
              },
              '& .MuiOutlinedInput-input, & .MuiOutlinedInput-inputMultiline': {
                padding: '0.75rem',
                color: '#1F2937',
                '&::placeholder': {
                  color: '#9CA3AF',
                  opacity: 1,
                },
              },
            },
            '& .MuiFormHelperText-root': {
              fontSize: '0.75rem',
              marginTop: '0.375rem',
              color: error ? '#EF4444' : '#6B7280',
            },
          }}
        />
      )}
    </div>
  );
});

/** Modern Section Component for organizing form fields */
const FormSection = ({ 
  title, 
  description, 
  icon,
  children 
}: { 
  title: string
  description?: string
  icon?: React.ReactNode
  children: React.ReactNode 
}) => (
  <div
    style={{
      backgroundColor: '#FFFFFF',
      border: '1px solid #E5E7EB',
      borderRadius: '12px',
      padding: '24px',
      marginBottom: '20px',
      transition: 'all 0.2s ease',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '16px' }}>
      {icon && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '32px',
          height: '32px',
          borderRadius: '8px',
          backgroundColor: '#EEF3FF',
          color: '#4F46E5',
          flexShrink: 0,
        }}>
          {icon}
        </div>
      )}
      <div style={{ flex: 1 }}>
        <h3 style={{
          fontSize: '1rem',
          fontWeight: 700,
          color: '#1F2937',
          margin: '0 0 4px 0',
          letterSpacing: '0.2px',
        }}>
          {title}
        </h3>
        {description && (
          <p style={{
            fontSize: '0.8125rem',
            color: '#6B7280',
            margin: 0,
            fontWeight: 400,
          }}>
            {description}
          </p>
        )}
      </div>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
      {children}
    </div>
  </div>
);

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
    <>
      <style>{spinnerStyle}</style>
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
          padding: '32px 32px 24px',
          borderBottom: '1px solid #E5E7EB',
          backgroundColor: '#FFFFFF',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <h1 style={{
            margin: '0 0 8px 0',
            fontSize: '1.5rem',
            fontWeight: 700,
            color: '#1F2937',
            letterSpacing: '-0.02em',
          }}>
            Create Requirement
          </h1>
          <p style={{
            margin: 0,
            fontSize: '0.9rem',
            color: '#6B7280',
            fontWeight: 400,
          }}>
            Add a new job requirement to your pipeline
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
          backgroundColor: '#F9FAFB',
          padding: '32px',
          overflowY: 'auto',
          flex: 1,
          '&::-webkit-scrollbar': {
            width: '8px',
          },
          '&::-webkit-scrollbar-track': {
            backgroundColor: '#F3F4F6',
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
        <div style={{ padding: '0' }}>
          {/* Error Alert - Top of form */}
          {submitError && (
            <div style={{ marginBottom: '24px' }}>
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
            <div style={{ 
              backgroundColor: '#FFFBEB', 
              border: '1px solid #FCD34D', 
              borderRadius: '12px', 
              padding: '16px', 
              marginBottom: '24px',
              display: 'flex',
              gap: '12px',
              alignItems: 'flex-start'
            }}>
              <AlertCircle size={20} style={{ color: '#B45309', flexShrink: 0, marginTop: '2px' }} />
              <div>
                <p style={{ fontWeight: 600, color: '#92400E', margin: '0 0 4px 0', fontSize: '0.9rem' }}>
                  Similar requirements found
                </p>
                <p style={{ color: '#92400E', margin: 0, fontSize: '0.85rem' }}>
                  {similarRequirements.length} similar requirement(s) exist. Review before creating.
                </p>
              </div>
            </div>
          )}

          {/* Gmail Jobs Scanner - As Card */}
          {showGmailJobs && gmailJobs.length > 0 ? (
            <div style={{ 
              backgroundColor: '#F0F9FF', 
              border: '1px solid #BAE6FD', 
              borderRadius: '12px', 
              padding: '20px', 
              marginBottom: '24px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontWeight: 700, color: '#0369A1', margin: 0, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Mail size={18} />
                  Jobs Found in Gmail ({gmailJobs.length})
                </h3>
                <button
                  type="button"
                  onClick={() => setShowGmailJobs(false)}
                  style={{ 
                    padding: '6px 12px', 
                    backgroundColor: 'transparent', 
                    color: '#0369A1', 
                    border: '1px solid #BAE6FD', 
                    borderRadius: '8px', 
                    cursor: 'pointer', 
                    fontSize: '0.85rem', 
                    fontWeight: 500,
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#EFF6FF';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  Close
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {gmailJobs.map((job, idx) => (
                  <div
                    key={idx}
                    onClick={() => handleSelectGmailJob(job)}
                    style={{
                      padding: '12px',
                      backgroundColor: selectedGmailJob === idx ? '#F5F4FF' : '#ffffff',
                      border: selectedGmailJob === idx ? '2px solid #0369A1' : '1px solid #E0F2FE',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      if (selectedGmailJob !== idx) {
                        e.currentTarget.style.backgroundColor = '#F0F9FF';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedGmailJob !== idx) {
                        e.currentTarget.style.backgroundColor = '#ffffff';
                      }
                    }}
                  >
                    <div style={{ fontWeight: 600, color: '#1F2937', marginBottom: '4px', fontSize: '0.95rem' }}>{job.title}</div>
                    <div style={{ fontSize: '0.85rem', color: '#6B7280', marginBottom: '4px' }}>{job.company}</div>
                    {job.skills && <div style={{ fontSize: '0.75rem', color: '#0369A1', marginBottom: '4px' }}>Skills: {job.skills}</div>}
                    <div style={{ fontSize: '0.8rem', color: '#6B7280', maxHeight: '60px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {job.description}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ marginBottom: '24px' }}>
              <button
                type="button"
                onClick={handleScanGmail}
                disabled={scanningGmail}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '12px 16px',
                  backgroundColor: scanningGmail ? '#F3F4F6' : '#ffffff',
                  border: '1px solid #E5E7EB',
                  color: scanningGmail ? '#9CA3AF' : '#4F46E5',
                  borderRadius: '10px',
                  cursor: scanningGmail ? 'not-allowed' : 'pointer',
                  fontWeight: 500,
                  width: '100%',
                  fontSize: '0.9rem',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => !scanningGmail && (
                  e.currentTarget.style.backgroundColor = '#F9FAFB',
                  e.currentTarget.style.borderColor = '#D1D5DB'
                )}
                onMouseLeave={(e) => !scanningGmail && (
                  e.currentTarget.style.backgroundColor = '#ffffff',
                  e.currentTarget.style.borderColor = '#E5E7EB'
                )}
              >
                {scanningGmail ? (
                  <>
                    <Loader size={16} className="spinner-spin" />
                    <span>Scanning Gmail...</span>
                  </>
                ) : (
                  <>
                    <Mail size={16} />
                    <span>Scan Gmail for Jobs</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Parser Buttons - Modern Card Style */}
          <div style={{ 
            backgroundColor: '#FFFFFF', 
            border: '1px solid #E5E7EB', 
            borderRadius: '12px', 
            padding: '20px', 
            marginBottom: '24px'
          }}>
            <p style={{ margin: '0 0 12px 0', fontSize: '0.875rem', fontWeight: 600, color: '#6B7280' }}>
              Quick Import
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <button
                type="button"
                onClick={() => setShowJDParser(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '10px 16px',
                  backgroundColor: '#F3F4F6',
                  border: '1px solid #D1D5DB',
                  color: '#4F46E5',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  fontWeight: 500,
                  fontSize: '0.85rem',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#E9EBF0';
                  e.currentTarget.style.borderColor = '#C7CEDB';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#F3F4F6';
                  e.currentTarget.style.borderColor = '#D1D5DB';
                }}
              >
                <FileText size={16} />
                <span>Parse JD</span>
              </button>
              <button
                type="button"
                onClick={() => setShowBatchJDParser(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '10px 16px',
                  backgroundColor: '#F3F4F6',
                  border: '1px solid #D1D5DB',
                  color: '#4F46E5',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  fontWeight: 500,
                  fontSize: '0.85rem',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#E9EBF0';
                  e.currentTarget.style.borderColor = '#C7CEDB';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#F3F4F6';
                  e.currentTarget.style.borderColor = '#D1D5DB';
                }}
              >
                <FileText size={16} />
                <span>Batch Parse</span>
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            {/* Core Details Section */}
          <FormSection 
            title="Core Details" 
            description="Job title, partner, and client information"
            icon={<Briefcase size={18} />}
          >
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
            <div style={{ gridColumn: '1 / -1' }}>
              <FormField
                label="Assigned Consultant"
                name="consultant_id"
                id="req-consultant"
                type="select"
                value={formData.consultant_id}
                onChange={handleChange}
                options={consultantOptions}
              />
            </div>
          </FormSection>

          {/* Assignment & Actions Section */}
          <FormSection 
            title="Assignment & Actions" 
            description="Next steps and workflow tracking"
            icon={<Clock size={18} />}
          >
            <div style={{ gridColumn: '1 / -1' }}>
              <FormField
                label="Next Action"
                name="next_step"
                id="req-next-step"
                autoComplete="off"
                placeholder="e.g., Send profile, Schedule interview"
                value={formData.next_step}
                onChange={handleChange}
                helperText="Brief description of the next step"
              />
            </div>
          </FormSection>

          {/* Work Details Section */}
          <FormSection 
            title="Work Details" 
            description="Skills, compensation, and engagement terms"
            icon={<Briefcase size={18} />}
          >
            <FormField
              label="Key Skills"
              name="primary_tech_stack"
              id="req-tech-stack"
              autoComplete="off"
              placeholder="e.g., Java, Spring Boot, AWS"
              value={formData.primary_tech_stack}
              onChange={handleChange}
              helperText="Comma-separated list of required skills"
            />
            <FormField
              label="Rate / Salary"
              name="rate"
              id="req-rate"
              autoComplete="off"
              placeholder="$80k, $80k-$120k, £50-70k, etc."
              value={formData.rate}
              onChange={handleChange}
              error={formErrors.rate}
              helperText="Any format: hourly, annual, or range"
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

          {/* Vendor Information Section */}
          <FormSection 
            title="Vendor Information" 
            description="Staffing partner details and contact"
            icon={<Users size={18} />}
          >
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
              label="Contact Person"
              name="vendor_person_name"
              id="req-vendor-contact"
              autoComplete="name"
              placeholder="e.g., Jane Doe"
              value={formData.vendor_person_name}
              onChange={handleChange}
            />
            <FormField
              label="Phone"
              name="vendor_phone"
              id="req-vendor-phone"
              autoComplete="tel"
              type="text"
              placeholder="(555) 123-4567 Ext-1234"
              value={formData.vendor_phone}
              onChange={handleChange}
            />
            <FormField
              label="Email"
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

          {/* Description Section */}
          <FormSection 
            title="Description" 
            description="Full job description and key responsibilities"
            icon={<FileText size={18} />}
          >
            <div style={{ gridColumn: '1 / -1' }}>
              <FormField
                label="Role Description"
                name="description"
                id="req-description"
                type="textarea"
                autoComplete="off"
                placeholder="Full job description, key responsibilities, and any other relevant details..."
                value={formData.description}
                onChange={handleChange}
                rows={6}
              />
            </div>
          </FormSection>

          </form>
        </div>
      </DialogContent>

      {/* Sticky Footer with Actions */}
      <div
        style={{
          padding: '20px 32px',
          borderTop: '1px solid #E5E7EB',
          backgroundColor: '#FFFFFF',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '12px',
          alignItems: 'center',
          borderRadius: '0 0 16px 16px',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            backgroundColor: '#F3F4F6',
            color: '#374151',
            border: '1px solid #D1D5DB',
            padding: '10px 20px',
            borderRadius: '10px',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: '0.9rem',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#E5E7EB';
            e.currentTarget.style.borderColor = '#B4B4B8';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#F3F4F6';
            e.currentTarget.style.borderColor = '#D1D5DB';
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
            padding: '10px 24px',
            borderRadius: '10px',
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '0.9rem',
            transition: 'all 0.2s ease',
            opacity: loading ? 0.7 : 1,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: !loading ? '0 1px 3px rgba(79, 70, 229, 0.3)' : 'none',
          }}
          onMouseEnter={(e) => !loading && (
            e.currentTarget.style.backgroundColor = '#4338CA',
            e.currentTarget.style.boxShadow = '0 4px 6px rgba(79, 70, 229, 0.4)'
          )}
          onMouseLeave={(e) => !loading && (
            e.currentTarget.style.backgroundColor = '#4F46E5',
            e.currentTarget.style.boxShadow = '0 1px 3px rgba(79, 70, 229, 0.3)'
          )}
          onClick={handleSubmit}
        >
          {loading && <Loader size={16} className="spinner-spin" />}
          {loading ? 'Creating...' : 'Create Requirement'}
        </button>
      </div>

      {/* Parser Dialogs */}
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
    </Dialog>
    </>
  );
};