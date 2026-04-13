import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../contexts/ToastContext';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Chip from '@mui/material/Chip';
import { CheckCircle, AlertCircle, Clock, Zap } from 'lucide-react';

interface JobExtractionLog {
  id: number;
  execution_start_time: string;
  execution_end_time: string;
  total_emails_processed: number;
  total_jobs_found: number;
  total_requirements_created: number;
  execution_status: string;
  error_message: string | null;
  duration_seconds: number;
  created_at: string;
}

interface ProcessedEmail {
  id: number;
  gmail_message_id: string;
  subject: string;
  sender: string;
  extraction_status: string;
  confidence_score: number;
  auto_created_at: string;
  requirement_id: string | null;
}

export const JobExtractionAgentDashboard = () => {
  const { user, isAdmin } = useAuth();
  const { showToast } = useToast();
  const [logs, setLogs] = useState<JobExtractionLog[]>([]);
  const [processedEmails, setProcessedEmails] = useState<ProcessedEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const loadLogs = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('job_extraction_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setLogs(data || []);
    } catch (error) {
      console.error('Error loading logs:', error);
      showToast({
        type: 'error',
        message: 'Failed to load agent logs',
      });
    }
  }, [user, showToast]);

  const loadProcessedEmails = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('processed_job_emails')
        .select('*')
        .eq('user_id', user.id)
        .order('auto_created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setProcessedEmails(data || []);
    } catch (error) {
      console.error('Error loading processed emails:', error);
      showToast({
        type: 'error',
        message: 'Failed to load processed emails',
      });
    }
  }, [user, showToast]);

  useEffect(() => {
    loadLogs();
    loadProcessedEmails();
    setLoading(false);
  }, [loadLogs, loadProcessedEmails]);

  const handleRunAgent = async () => {
    try {
      setRunning(true);
      
      // Call the agent endpoint
      const response = await fetch('/api/job-extraction/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to run agent: ${response.status}`);
      }

      showToast({
        type: 'success',
        title: 'Agent Started',
        message: 'Job extraction agent is running in the background',
      });

      // Reload logs after a delay
      setTimeout(() => {
        loadLogs();
        loadProcessedEmails();
      }, 2000);
    } catch (error) {
      console.error('Error running agent:', error);
      showToast({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to run agent',
      });
    } finally {
      setRunning(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'success';
      case 'failed':
        return 'error';
      case 'partial':
        return 'warning';
      case 'skipped':
        return 'default';
      default:
        return 'default';
    }
  };

  const getExtractionStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle size={16} />;
      case 'failed':
        return <AlertCircle size={16} />;
      case 'skipped':
        return <Clock size={16} />;
      default:
        return null;
    }
  };

  if (!isAdmin) {
    return (
      <Card>
        <CardContent>
          <Typography color="error">
            You don't have permission to access this feature
          </Typography>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={400}>
        <CircularProgress />
      </Box>
    );
  }

  const latestLog = logs[0];
  const totalStats = logs.reduce(
    (acc, log) => ({
      emails: acc.emails + log.total_emails_processed,
      jobs: acc.jobs + log.total_jobs_found,
      created: acc.created + log.total_requirements_created,
    }),
    { emails: 0, jobs: 0, created: 0 }
  );

  return (
    <Stack spacing={3}>
      {/* Header */}
      <Box>
        <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Zap size={24} /> Job Extraction Agent
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Automated background agent that extracts jobs from emails and creates requirements
        </Typography>
      </Box>

      {/* Control Panel */}
      <Card>
        <CardHeader title="Agent Control" />
        <CardContent>
          <Stack direction="row" spacing={2}>
            <Button
              variant="contained"
              onClick={handleRunAgent}
              disabled={running}
              startIcon={running ? <CircularProgress size={20} /> : <Zap size={20} />}
            >
              {running ? 'Running...' : 'Run Agent Now'}
            </Button>
            <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center' }}>
              Agent runs automatically every 30 minutes
            </Typography>
          </Stack>
        </CardContent>
      </Card>

      {/* Statistics */}
      <Box display="grid" gridTemplateColumns={{ xs: '1fr', sm: '1fr 1fr 1fr' }} gap={2}>
        <Card>
          <CardContent>
            <Typography color="text.secondary" variant="body2">
              Total Emails Processed
            </Typography>
            <Typography variant="h4">{totalStats.emails}</Typography>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Typography color="text.secondary" variant="body2">
              Total Jobs Found
            </Typography>
            <Typography variant="h4">{totalStats.jobs}</Typography>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Typography color="text.secondary" variant="body2">
              Requirements Created
            </Typography>
            <Typography variant="h4">{totalStats.created}</Typography>
          </CardContent>
        </Card>
      </Box>

      {/* Latest Execution */}
      {latestLog && (
        <Card>
          <CardHeader title="Latest Execution" />
          <CardContent>
            <Stack spacing={1}>
              <Box display="flex" justifyContent="space-between">
                <Typography variant="body2">Status:</Typography>
                <Chip
                  label={latestLog.execution_status}
                  color={getStatusColor(latestLog.execution_status) as any}
                  size="small"
                />
              </Box>
              <Box display="flex" justifyContent="space-between">
                <Typography variant="body2">Executed:</Typography>
                <Typography variant="body2">
                  {new Date(latestLog.created_at).toLocaleString()}
                </Typography>
              </Box>
              <Box display="flex" justifyContent="space-between">
                <Typography variant="body2">Duration:</Typography>
                <Typography variant="body2">{latestLog.duration_seconds}s</Typography>
              </Box>
              <Box display="flex" justifyContent="space-between">
                <Typography variant="body2">Emails Processed:</Typography>
                <Typography variant="body2">{latestLog.total_emails_processed}</Typography>
              </Box>
              <Box display="flex" justifyContent="space-between">
                <Typography variant="body2">Jobs Found:</Typography>
                <Typography variant="body2">{latestLog.total_jobs_found}</Typography>
              </Box>
              <Box display="flex" justifyContent="space-between">
                <Typography variant="body2">Requirements Created:</Typography>
                <Typography variant="body2">{latestLog.total_requirements_created}</Typography>
              </Box>
              {latestLog.error_message && (
                <Box sx={{ mt: 2, p: 1.5, bgcolor: '#fff3cd', borderRadius: 1 }}>
                  <Typography variant="body2" color="error">
                    <strong>Error:</strong> {latestLog.error_message}
                  </Typography>
                </Box>
              )}
            </Stack>
          </CardContent>
        </Card>
      )}

      {/* Processed Emails Table */}
      <Card>
        <CardHeader title="Recently Processed Emails" subheader={`${processedEmails.length} emails`} />
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                <TableCell>Subject</TableCell>
                <TableCell>From</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Confidence</TableCell>
                <TableCell>Requirement Created</TableCell>
                <TableCell>Date</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {processedEmails.map(email => (
                <TableRow key={email.id}>
                  <TableCell>
                    <Typography variant="body2" sx={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {email.subject}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {email.sender}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Box display="flex" alignItems="center" gap={1}>
                      {getExtractionStatusIcon(email.extraction_status)}
                      <Typography variant="body2">{email.extraction_status}</Typography>
                    </Box>
                  </TableCell>
                  <TableCell align="right">
                    <Chip
                      label={`${email.confidence_score}%`}
                      size="small"
                      color={email.confidence_score >= 75 ? 'success' : 'warning'}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    {email.requirement_id ? (
                      <Chip label="✓ Yes" size="small" color="success" />
                    ) : (
                      <Typography variant="body2" color="text.secondary">—</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {new Date(email.auto_created_at).toLocaleDateString()}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      {/* Execution Logs Table */}
      <Card>
        <CardHeader title="Execution Logs" subheader={`${logs.length} recent runs`} />
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                <TableCell>Time</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Emails</TableCell>
                <TableCell align="right">Jobs</TableCell>
                <TableCell align="right">Created</TableCell>
                <TableCell align="right">Duration</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {logs.map(log => (
                <TableRow key={log.id}>
                  <TableCell>
                    <Typography variant="body2">
                      {new Date(log.created_at).toLocaleString()}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={log.execution_status}
                      color={getStatusColor(log.execution_status) as any}
                      size="small"
                    />
                  </TableCell>
                  <TableCell align="right">{log.total_emails_processed}</TableCell>
                  <TableCell align="right">{log.total_jobs_found}</TableCell>
                  <TableCell align="right">{log.total_requirements_created}</TableCell>
                  <TableCell align="right">{log.duration_seconds}s</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
    </Stack>
  );
};
