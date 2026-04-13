import React, { useState } from 'react';
import { useToast } from '@/contexts/ToastContext';
import { useRunAutomation } from '@/hooks/useRunAutomation';
import { useAuth } from '@/hooks/useAuth';
import { useDocumentsInfinite } from '@/hooks/useDocumentsInfinite';
import { BrandButton } from '../brand/BrandButton';
import {
  Box,
  Card,
  TextField,
  Slider,
  Typography,
  CircularProgress,
  Alert,
  Paper,
  LinearProgress,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';
import {
  CheckCircle,
  FileText,
  Zap,
  AlertCircle,
} from 'lucide-react';

interface AutomationFormData {
  job_title: string;
  job_description: string;
  recruiter_email: string;
  points_per_tech: number;
  personal_message?: string;
  document_id?: string;
}

interface AutoSelectedResume {
  name: string;
  person_name?: string;
  technologies?: string[];
  matching_techs?: string[];
  missing_techs?: string[];
}

type WorkflowPhase = 'form' | 'auto_selected' | 'processing' | 'completed';

export const AutomationPage: React.FC = () => {
  const { showToast } = useToast();
  const { user } = useAuth();
  const { documents } = useDocumentsInfinite({
    userId: user?.id,
    pageSize: 50,
    search: '',
  });

  const [formData, setFormData] = useState<AutomationFormData>({
    job_title: '',
    job_description: '',
    recruiter_email: '',
    points_per_tech: 2,
    personal_message: '',
    document_id: undefined,
  });

  const [phase, setPhase] = useState<WorkflowPhase>('form');
  const [autoSelectedResume, setAutoSelectedResume] = useState<AutoSelectedResume | null>(null);
  const [matchScore, setMatchScore] = useState<number>(0);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | undefined>(undefined);

  const { mutate: runAutomation, isPending, data: result } = useRunAutomation();

  const handleInitialSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.job_title.trim()) {
      showToast({
        message: '❌ Job title is required',
        type: 'error',
      });
      return;
    }

    if (formData.job_description.length < 50) {
      showToast({
        message: '❌ Job description too short (min 50 characters)',
        type: 'error',
      });
      return;
    }

    if (!formData.recruiter_email.includes('@')) {
      showToast({
        message: '❌ Invalid email address',
        type: 'error',
      });
      return;
    }

    // Submit WITHOUT document_id - let backend auto-select
    setPhase('processing');
    runAutomation(
      {
        job_title: formData.job_title,
        job_description: formData.job_description,
        recruiter_email: formData.recruiter_email,
        points_per_tech: formData.points_per_tech,
        personal_message: formData.personal_message,
        document_id: undefined, // No document_id - backend will auto-select
      },
      {
        onSuccess: (data: any) => {
          if (data?.status === 'auto_selected' && data?.auto_selected_resume) {
            // Show auto-selected resume with override option
            setAutoSelectedResume(data.auto_selected_resume);
            setMatchScore(data.match_score || 0);
            setSelectedDocumentId(data.document_id); // Store the auto-selected document ID
            setPhase('auto_selected');
            showToast({
              message: `✅ Best match found: ${data.auto_selected_resume.name} (${data.match_score?.toFixed(1)}%)`,
              type: 'success',
            });
          } else if (data?.status === 'completed') {
            // Workflow completed
            setPhase('completed');
            showToast({
              message: '✅ Resume automation completed!',
              type: 'success',
            });
          }
        },
        onError: (error: any) => {
          setPhase('form');
          showToast({
            message: `❌ Error: ${error?.message || 'Automation failed'}`,
            type: 'error',
          });
        },
      }
    );
  };

  const handleConfirmSelection = () => {
    // Proceed with auto-selected resume - re-run automation with the selected document_id
    if (autoSelectedResume && selectedDocumentId) {
      setPhase('processing');
      runAutomation(
        {
          job_title: formData.job_title,
          job_description: formData.job_description,
          recruiter_email: formData.recruiter_email,
          points_per_tech: formData.points_per_tech,
          personal_message: formData.personal_message,
          document_id: selectedDocumentId, // Use the auto-selected document ID
        },
        {
          onSuccess: (data: any) => {
            if (data?.status === 'completed') {
              setPhase('completed');
              showToast({
                message: `✅ Processing complete: ${data.filename}`,
                type: 'success',
              });
            }
          },
          onError: (error: any) => {
            setPhase('auto_selected');
            showToast({
              message: `❌ Processing failed: ${error?.message || 'Unknown error'}`,
              type: 'error',
            });
          },
        }
      );
    }
  };

  const handleOverrideResume = () => {
    // User wants to manually select different resume
    setPhase('form');
    setAutoSelectedResume(null);
    setSelectedDocumentId(undefined);
    showToast({
      message: '📄 Select a different resume and try again',
      type: 'info',
    });
  };

  const handleDownload = () => {
    if (result?.document_id) {
      showToast({
        message: '✅ Processed resume saved to your Documents',
        type: 'success',
      });
    }
  };

  const handleNewAutomation = () => {
    // Reset for new automation
    setFormData({
      job_title: '',
      job_description: '',
      recruiter_email: '',
      points_per_tech: 2,
      personal_message: '',
      document_id: undefined,
    });
    setPhase('form');
    setAutoSelectedResume(null);
    setMatchScore(0);
    setSelectedDocumentId(undefined);
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: 'linear-gradient(to bottom right, #f9fafb, #f3f4f6)',
        p: 4,
      }}
    >
      <Box sx={{ maxWidth: '1200px', mx: 'auto' }}>
        {/* Header */}
        <Box sx={{ mb: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
            <Zap size={32} style={{ color: '#2563eb' }} />
            <Typography variant="h3" sx={{ fontWeight: 'bold' }}>
              Resume Automation
            </Typography>
          </Box>
          <Typography variant="h6" sx={{ color: '#4b5563' }}>
            Auto-Select Resume → Job Description → Generate Points → Inject → Save
          </Typography>
        </Box>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' },
            gap: 3,
          }}
        >
          {/* Form Section */}
          <Box>
            {phase === 'form' && (
              <Card sx={{ p: 3, boxShadow: 3 }}>
                <form onSubmit={handleInitialSubmit}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {/* Info: Auto-selection enabled */}
                    <Alert severity="info" variant="outlined">
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <AlertCircle size={20} />
                        <Typography variant="body2">
                          Resume will be automatically selected based on job description. Or manually override below.
                        </Typography>
                      </Box>
                    </Alert>

                    {/* Step 0: Manual Override (Optional) */}
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                        📄 Resume (Optional - Leave Blank for Auto-Selection)
                      </Typography>
                      <FormControl fullWidth>
                        <InputLabel>Choose to override auto-selection...</InputLabel>
                        <Select
                          value={formData.document_id || ''}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              document_id: e.target.value || undefined,
                            })
                          }
                          label="Choose to override auto-selection..."
                        >
                          {documents.map((doc: any) => (
                            <MenuItem key={doc.id} value={doc.id}>
                              {doc.original_filename || doc.filename}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                      <Typography variant="caption" sx={{ color: '#6b7280', mt: 1, display: 'block' }}>
                        Leave empty to use AI-powered auto-selection based on job description
                      </Typography>
                    </Box>

                    {/* Step 1: Job Title */}
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                        📝 Job Title
                      </Typography>
                      <TextField
                        fullWidth
                        placeholder="e.g., Senior Python Developer"
                        value={formData.job_title}
                        onChange={(e) =>
                          setFormData({ ...formData, job_title: e.target.value })
                        }
                        variant="outlined"
                      />
                    </Box>

                    {/* Step 2: Job Description */}
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                        📋 Job Description
                      </Typography>
                      <TextField
                        fullWidth
                        placeholder="Paste the full job description here..."
                        value={formData.job_description}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            job_description: e.target.value,
                          })
                        }
                        multiline
                        rows={6}
                        variant="outlined"
                      />
                      <Typography variant="caption" sx={{ color: '#6b7280', mt: 0.5, display: 'block' }}>
                        Min 50 characters required
                      </Typography>
                    </Box>

                    {/* Step 3: Points Per Tech */}
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                        ⭐ Points Per Technology
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Box sx={{ flex: 1 }}>
                          <Slider
                            min={1}
                            max={5}
                            value={formData.points_per_tech}
                            onChange={(_, value) =>
                              setFormData({
                                ...formData,
                                points_per_tech: value as number,
                              })
                            }
                            marks={[
                              { value: 1, label: '1' },
                              { value: 3, label: '3' },
                              { value: 5, label: '5' },
                            ]}
                            valueLabelDisplay="auto"
                          />
                        </Box>
                        <Typography variant="h6" sx={{ fontWeight: 600, color: '#2563eb', minWidth: 30 }}>
                          {formData.points_per_tech}
                        </Typography>
                      </Box>
                    </Box>

                    {/* Step 4: Recruiter Email */}
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                        📧 Recruiter Email
                      </Typography>
                      <TextField
                        fullWidth
                        type="email"
                        placeholder="recruiting@company.com"
                        value={formData.recruiter_email}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            recruiter_email: e.target.value,
                          })
                        }
                        variant="outlined"
                      />
                    </Box>

                    {/* Step 5: Personal Message (Optional) */}
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                        💬 Personal Message (Optional)
                      </Typography>
                      <TextField
                        fullWidth
                        placeholder="Leave blank for auto-generated message..."
                        value={formData.personal_message}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            personal_message: e.target.value,
                          })
                        }
                        multiline
                        rows={3}
                        variant="outlined"
                      />
                    </Box>

                    {/* Submit Button */}
                    <BrandButton
                      type="submit"
                      disabled={isPending}
                      variant="primary"
                      size="lg"
                      fullWidth
                    >
                      {isPending ? (
                        <>
                          <CircularProgress size={20} style={{ marginRight: 8, display: 'inline' }} />
                          Analyzing...
                        </>
                      ) : (
                        <>
                          <Zap size={20} style={{ marginRight: 8, display: 'inline' }} />
                          Find & Process Resume
                        </>
                      )}
                    </BrandButton>
                  </Box>
                </form>
              </Card>
            )}

            {phase === 'auto_selected' && autoSelectedResume && (
              <Card sx={{ p: 3, boxShadow: 3 }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <Alert severity="success" variant="outlined">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <CheckCircle size={20} />
                      <Typography>
                        ✅ Best resume matched: <strong>{autoSelectedResume.name}</strong>
                      </Typography>
                    </Box>
                  </Alert>

                  {/* Auto-Selected Resume Details */}
                  <Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
                      📄 Selected Resume
                    </Typography>

                    {autoSelectedResume.person_name && (
                      <Box sx={{ mb: 1.5 }}>
                        <Typography variant="caption" sx={{ fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                          Person Name
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#111827' }}>
                          {autoSelectedResume.person_name}
                        </Typography>
                      </Box>
                    )}

                    {matchScore > 0 && (
                      <Box sx={{ mb: 1.5 }}>
                        <Typography variant="caption" sx={{ fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                          Match Score
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                          <Box sx={{ flex: 1 }}>
                            <LinearProgress
                              variant="determinate"
                              value={matchScore}
                              sx={{
                                height: 8,
                                borderRadius: 4,
                                backgroundColor: '#e5e7eb',
                                '& .MuiLinearProgress-bar': {
                                  backgroundColor: '#2563eb',
                                },
                              }}
                            />
                          </Box>
                          <Typography variant="body2" sx={{ fontWeight: 600, color: '#2563eb', minWidth: 40 }}>
                            {Math.round(matchScore)}%
                          </Typography>
                        </Box>
                      </Box>
                    )}

                    {autoSelectedResume.matching_techs && autoSelectedResume.matching_techs.length > 0 && (
                      <Box sx={{ mb: 1.5 }}>
                        <Typography variant="caption" sx={{ fontWeight: 600, color: '#10b981', textTransform: 'uppercase' }}>
                          ✓ Matching Technologies
                        </Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 0.5 }}>
                          {autoSelectedResume.matching_techs.map((tech: string, idx: number) => (
                            <Typography
                              key={idx}
                              variant="caption"
                              sx={{
                                backgroundColor: '#d1fae5',
                                color: '#065f46',
                                px: 1.5,
                                py: 0.5,
                                borderRadius: 1,
                              }}
                            >
                              {tech}
                            </Typography>
                          ))}
                        </Box>
                      </Box>
                    )}

                    {autoSelectedResume.missing_techs && autoSelectedResume.missing_techs.length > 0 && (
                      <Box sx={{ mb: 1.5 }}>
                        <Typography variant="caption" sx={{ fontWeight: 600, color: '#ef4444', textTransform: 'uppercase' }}>
                          ✗ Missing Technologies
                        </Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 0.5 }}>
                          {autoSelectedResume.missing_techs.map((tech: string, idx: number) => (
                            <Typography
                              key={idx}
                              variant="caption"
                              sx={{
                                backgroundColor: '#fee2e2',
                                color: '#7f1d1d',
                                px: 1.5,
                                py: 0.5,
                                borderRadius: 1,
                              }}
                            >
                              {tech}
                            </Typography>
                          ))}
                        </Box>
                      </Box>
                    )}
                  </Box>

                  {/* Action Buttons */}
                  <Box sx={{ display: 'flex', gap: 2, flexDirection: 'column' }}>
                    <BrandButton
                      onClick={handleConfirmSelection}
                      variant="primary"
                      size="lg"
                      fullWidth
                      disabled={isPending}
                    >
                      {isPending ? (
                        <>
                          <CircularProgress size={20} style={{ marginRight: 8, display: 'inline' }} />
                          Processing...
                        </>
                      ) : (
                        <>
                          <Zap size={20} style={{ marginRight: 8, display: 'inline' }} />
                          Confirm & Process
                        </>
                      )}
                    </BrandButton>

                    <BrandButton
                      onClick={handleOverrideResume}
                      variant="secondary"
                      size="lg"
                      fullWidth
                      disabled={isPending}
                    >
                      Choose Different Resume
                    </BrandButton>
                  </Box>
                </Box>
              </Card>
            )}

            {phase === 'completed' && result && (
              <Card sx={{ p: 3, boxShadow: 3 }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <Alert severity="success" variant="outlined">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <CheckCircle size={20} />
                      <Typography>✅ Automation Complete!</Typography>
                    </Box>
                  </Alert>

                  {/* Filename */}
                  {result?.filename && (
                    <Box>
                      <Typography variant="caption" sx={{ fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                        Processed File
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 500, color: '#111827' }}>
                        {result.filename}
                      </Typography>
                    </Box>
                  )}

                  {/* Match Score */}
                  {result?.match_score !== undefined && result?.match_score > 0 && (
                    <Box>
                      <Typography variant="caption" sx={{ fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                        Match Score
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                        <Box sx={{ flex: 1 }}>
                          <LinearProgress
                            variant="determinate"
                            value={result.match_score}
                            sx={{
                              height: 8,
                              borderRadius: 4,
                              backgroundColor: '#e5e7eb',
                              '& .MuiLinearProgress-bar': {
                                backgroundColor: '#2563eb',
                              },
                            }}
                          />
                        </Box>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: '#2563eb', minWidth: 40 }}>
                          {Math.round(result.match_score)}%
                        </Typography>
                      </Box>
                    </Box>
                  )}

                  {/* Action Buttons */}
                  <Box sx={{ display: 'flex', gap: 2, flexDirection: 'column' }}>
                    {result?.document_id && (
                      <BrandButton
                        onClick={handleDownload}
                        variant="primary"
                        size="lg"
                        fullWidth
                      >
                        <FileText size={18} style={{ marginRight: 8, display: 'inline' }} />
                        View in Documents
                      </BrandButton>
                    )}

                    <BrandButton
                      onClick={handleNewAutomation}
                      variant="secondary"
                      size="lg"
                      fullWidth
                    >
                      Process Another Resume
                    </BrandButton>
                  </Box>
                </Box>
              </Card>
            )}
          </Box>

          {/* Results/Info Section */}
          <Box>
            <Card sx={{ p: 3, boxShadow: 3, height: 'fit-content', position: 'sticky', top: 90 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                📊 Workflow
              </Typography>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Paper sx={{ p: 2, backgroundColor: phase !== 'form' ? '#f0f9ff' : '#e3f2fd' }}>
                  <Box sx={{ display: 'flex', gap: 2 }}>
                    <Typography variant="h4" sx={{ opacity: phase !== 'form' ? 1 : 0.5 }}>
                      1️⃣
                    </Typography>
                    <Box>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                        Fill Job Info
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#6b7280' }}>
                        Provide job title, description & email
                      </Typography>
                    </Box>
                  </Box>
                </Paper>

                <Paper sx={{ p: 2, backgroundColor: phase === 'auto_selected' ? '#f0fdf4' : '#f3f4f6' }}>
                  <Box sx={{ display: 'flex', gap: 2 }}>
                    <Typography variant="h4" sx={{ opacity: phase === 'auto_selected' ? 1 : 0.5 }}>
                      2️⃣
                    </Typography>
                    <Box>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                        Auto-Select Resume
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#6b7280' }}>
                        AI finds best matching resume
                      </Typography>
                    </Box>
                  </Box>
                </Paper>

                <Paper sx={{ p: 2, backgroundColor: phase === 'completed' ? '#fef3c7' : '#f3f4f6' }}>
                  <Box sx={{ display: 'flex', gap: 2 }}>
                    <Typography variant="h4" sx={{ opacity: phase === 'completed' ? 1 : 0.5 }}>
                      3️⃣
                    </Typography>
                    <Box>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                        Generate & Inject
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#6b7280' }}>
                        Generate points & save processed resume
                      </Typography>
                    </Box>
                  </Box>
                </Paper>
              </Box>

              {/* Info Cards */}
              <Box sx={{ mt: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Paper sx={{ p: 2 }}>
                  <Box sx={{ display: 'flex', gap: 2 }}>
                    <Typography variant="h5">🤖</Typography>
                    <Box>
                      <Typography variant="caption" sx={{ fontWeight: 600, display: 'block' }}>
                        AI-Powered Selection
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#6b7280' }}>
                        Analyzes job requirements
                      </Typography>
                    </Box>
                  </Box>
                </Paper>

                <Paper sx={{ p: 2 }}>
                  <Box sx={{ display: 'flex', gap: 2 }}>
                    <Typography variant="h5">⚡</Typography>
                    <Box>
                      <Typography variant="caption" sx={{ fontWeight: 600, display: 'block' }}>
                        One-Click Automation
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#6b7280' }}>
                        Or manually override
                      </Typography>
                    </Box>
                  </Box>
                </Paper>

                <Paper sx={{ p: 2 }}>
                  <Box sx={{ display: 'flex', gap: 2 }}>
                    <Typography variant="h5">☁️</Typography>
                    <Box>
                      <Typography variant="caption" sx={{ fontWeight: 600, display: 'block' }}>
                        Cloud Storage
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#6b7280' }}>
                        Saved to your Documents
                      </Typography>
                    </Box>
                  </Box>
                </Paper>
              </Box>
            </Card>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};
