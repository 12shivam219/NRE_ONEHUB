import { useState } from 'react';
import {
  Stack,
  Paper,
  Typography,
  Button,
  TextField,
  FormControlLabel,
  Switch,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
} from '@mui/material';
import { Zap } from 'lucide-react';

export interface ScheduleOptions {
  enabled: boolean;
  sendAt?: string; // ISO datetime
  timezone?: string;
  recurring?: 'once' | 'daily' | 'weekly' | 'monthly';
  recurringDays?: number; // For daily/weekly
  recurringEndDate?: string; // ISO date
}

interface ScheduleSendProps {
  onScheduleChange?: (options: ScheduleOptions) => void;
  disabled?: boolean;
}

export const ScheduleSend = ({
  onScheduleChange,
  disabled = false,
}: ScheduleSendProps) => {
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [formData, setFormData] = useState({
    date: '',
    time: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    recurring: 'once' as 'once' | 'daily' | 'weekly' | 'monthly',
    recurringDays: 1,
    recurringEndDate: '',
  });

  // Get timezone
  const getTimezones = () => {
    const timezones = [
      'UTC',
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Los_Angeles',
      'Europe/London',
      'Europe/Paris',
      'Europe/Berlin',
      'Asia/Tokyo',
      'Asia/Shanghai',
      'Asia/Hong_Kong',
      'Australia/Sydney',
    ];
    return timezones;
  };

  // Validate schedule
  const isValidSchedule = () => {
    if (!formData.date || !formData.time) return false;
    
    const scheduledTime = new Date(`${formData.date}T${formData.time}`);
    const now = new Date();
    
    return scheduledTime > now;
  };

  // Handle save
  const handleSave = () => {
    if (!isValidSchedule()) {
      return;
    }

    const scheduledTime = new Date(`${formData.date}T${formData.time}`);
    
    const scheduleOptions: ScheduleOptions = {
      enabled: true,
      sendAt: scheduledTime.toISOString(),
      timezone: formData.timezone,
      recurring: formData.recurring,
      recurringDays: formData.recurringDays,
      recurringEndDate: formData.recurringEndDate || undefined,
    };

    if (onScheduleChange) {
      onScheduleChange(scheduleOptions);
    }

    setShowDialog(false);
  };

  // Clear schedule
  const handleClearSchedule = () => {
    setScheduleEnabled(false);
    if (onScheduleChange) {
      onScheduleChange({ enabled: false });
    }
  };

  // Get min date (today)
  const minDate = new Date().toISOString().split('T')[0];

  // Format scheduled time for display
  const formatScheduledTime = () => {
    if (!formData.date || !formData.time) return '';
    const date = new Date(`${formData.date}T${formData.time}`);
    return date.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: formData.timezone,
    });
  };

  // Calculate next occurrence
  const getNextOccurrences = (count: number = 3) => {
    if (formData.recurring === 'once' || !formData.date || !formData.time) {
      return [];
    }

    const occurrences = [];
    const current = new Date(`${formData.date}T${formData.time}`);

    for (let i = 0; i < count; i++) {
      occurrences.push(new Date(current));
      
      if (formData.recurring === 'daily') {
        current.setDate(current.getDate() + formData.recurringDays);
      } else if (formData.recurring === 'weekly') {
        current.setDate(current.getDate() + 7 * formData.recurringDays);
      } else if (formData.recurring === 'monthly') {
        current.setMonth(current.getMonth() + formData.recurringDays);
      }

      // Stop if end date is reached
      if (formData.recurringEndDate && current > new Date(formData.recurringEndDate)) {
        break;
      }
    }

    return occurrences;
  };

  return (
    <>
      <Paper
        variant="outlined"
        sx={{
          p: 2,
          bgcolor: 'background.paper',
          borderColor: 'rgba(234,179,8,0.20)',
        }}
      >
        <Stack spacing={2}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              Schedule Send
            </Typography>
            <FormControlLabel
              control={
                <Switch
                  checked={scheduleEnabled}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setShowDialog(true);
                    }
                    setScheduleEnabled(e.target.checked);
                  }}
                  disabled={disabled}
                />
              }
              label={scheduleEnabled ? 'Scheduled' : 'Send Now'}
            />
          </Stack>

          {scheduleEnabled && formData.date && formData.time && (
            <Paper
              sx={{
                p: 1.5,
                bgcolor: 'rgba(59,130,246,0.08)',
                borderColor: 'rgba(59,130,246,0.2)',
                border: '1px solid',
              }}
            >
              <Stack spacing={1}>
                <Stack direction="row" spacing={1} alignItems="flex-start">
                  <Zap className="w-5 h-5" style={{ color: 'rgb(59,130,246)' }} />
                  <Stack sx={{ flex: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      ✓ Email Scheduled
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {formatScheduledTime()}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Timezone: {formData.timezone}
                    </Typography>

                    {formData.recurring !== 'once' && (
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                        Recurring: Every {formData.recurringDays} {formData.recurring}
                        {formData.recurringDays > 1 ? '(s)' : ''}
                        {formData.recurringEndDate && ` until ${new Date(formData.recurringEndDate).toLocaleDateString()}`}
                      </Typography>
                    )}
                  </Stack>
                </Stack>

                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => handleClearSchedule()}
                  sx={{ alignSelf: 'flex-start' }}
                >
                  Clear Schedule
                </Button>
              </Stack>
            </Paper>
          )}

          {!scheduleEnabled && (
            <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
              Enable to schedule email sending for a specific date and time
            </Typography>
          )}

          {/* Help Text */}
          <Alert severity="info">
            Schedule your emails to be sent at the optimal time. You can set recurring sends if needed.
          </Alert>
        </Stack>
      </Paper>

      {/* Schedule Dialog */}
      <Dialog open={showDialog} onClose={() => setShowDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Schedule Email Send</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {/* Date & Time */}
            <Stack spacing={1}>
              <Typography variant="subtitle2">When should this email be sent?</Typography>
              
              <TextField
                type="date"
                label="Date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                inputProps={{ min: minDate }}
                fullWidth
                size="small"
                InputLabelProps={{ shrink: true }}
              />

              <TextField
                type="time"
                label="Time"
                value={formData.time}
                onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                fullWidth
                size="small"
                InputLabelProps={{ shrink: true }}
              />

              <TextField
                select
                label="Timezone"
                value={formData.timezone}
                onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                fullWidth
                size="small"
                SelectProps={{
                  native: true,
                }}
              >
                {getTimezones().map(tz => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </TextField>
            </Stack>

            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Send Pattern
            </Typography>

            {/* Recurring */}
            <TextField
              select
              label="Frequency"
              value={formData.recurring}
              onChange={(e) => setFormData({ ...formData, recurring: e.target.value as 'once' | 'daily' | 'weekly' | 'monthly' })}
              fullWidth
              size="small"
              SelectProps={{
                native: true,
              }}
            >
              <option value="once">One time only</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </TextField>

            {formData.recurring !== 'once' && (
              <>
                <TextField
                  type="number"
                  label={`Repeat every N ${formData.recurring}(s)`}
                  value={formData.recurringDays}
                  onChange={(e) => setFormData({ ...formData, recurringDays: Math.max(1, parseInt(e.target.value) || 1) })}
                  inputProps={{ min: 1 }}
                  fullWidth
                  size="small"
                />

                <TextField
                  type="date"
                  label="Stop recurring after (optional)"
                  value={formData.recurringEndDate}
                  onChange={(e) => setFormData({ ...formData, recurringEndDate: e.target.value })}
                  inputProps={{ min: formData.date }}
                  fullWidth
                  size="small"
                  InputLabelProps={{ shrink: true }}
                />

                {/* Preview next occurrences */}
                {formData.date && formData.time && (
                  <Paper sx={{ p: 1.5, bgcolor: 'rgba(234,179,8,0.05)' }}>
                    <Typography variant="caption" sx={{ fontWeight: 600 }}>
                      Next occurrences:
                    </Typography>
                    <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                      {getNextOccurrences(3).map((date, i) => (
                        <Typography key={i} variant="caption" color="text.secondary">
                          • {date.toLocaleString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </Typography>
                      ))}
                    </Stack>
                  </Paper>
                )}
              </>
            )}

            {/* Validation */}
            {formData.date && formData.time && (
              <Alert severity={isValidSchedule() ? 'success' : 'error'}>
                {isValidSchedule()
                  ? `Email will be sent on ${formatScheduledTime()}`
                  : 'Scheduled time must be in the future'}
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowDialog(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={!isValidSchedule()}
          >
            Schedule
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
