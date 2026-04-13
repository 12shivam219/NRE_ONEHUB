import { useState } from 'react';
import {
  Box,
  Stack,
  Paper,
  Typography,
  FormControlLabel,
  Checkbox,
  TextField,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Select,
  MenuItem,
} from '@mui/material';
import { Settings } from 'lucide-react';
import { ExpandMore } from '@mui/icons-material';

export interface AdvancedEmailOptions {
  readReceiptRequested?: boolean;
  priority?: 'low' | 'normal' | 'high';
  replyTo?: string;
  trackingEnabled?: boolean;
  retryFailed?: boolean;
  maxRetries?: number;
  customHeaders?: Record<string, string>;
  requestDeliveryConfirmation?: boolean;
}

interface AdvancedOptionsProps {
  options: AdvancedEmailOptions;
  onOptionsChange?: (options: AdvancedEmailOptions) => void;
  disabled?: boolean;
}

export const AdvancedOptions = ({
  options,
  onOptionsChange,
  disabled = false,
}: AdvancedOptionsProps) => {
  const [showDialog, setShowDialog] = useState(false);
  const [formData, setFormData] = useState(options);

  const handleChange = (key: keyof AdvancedEmailOptions, value: unknown) => {
    const updated = { ...formData, [key]: value };
    setFormData(updated);
  };

  const handleSave = () => {
    if (onOptionsChange) {
      onOptionsChange(formData);
    }
    setShowDialog(false);
  };

  // Count enabled options
  const enabledCount = Object.values(formData).filter(v => v === true || (typeof v === 'number' && v > 0)).length;

  return (
    <>
      <Paper
        variant="outlined"
        sx={{
          p: 2,
          bgcolor: 'background.paper',
          borderColor: '#E5E7EB',
        }}
      >
        <Stack spacing={2}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Stack direction="row" spacing={1} alignItems="center">
              <Settings className="w-5 h-5" />
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Advanced Options
              </Typography>
              {enabledCount > 0 && (
                <Box
                  sx={{
                    px: 1,
                    py: 0.25,
                    bgcolor: 'rgba(59,130,246,0.1)',
                    borderRadius: 1,
                    color: 'rgb(59,130,246)',
                    fontSize: '12px',
                    fontWeight: 600,
                  }}
                >
                  {enabledCount} enabled
                </Box>
              )}
            </Stack>
            <Button
              size="small"
              variant="outlined"
              onClick={() => setShowDialog(true)}
              disabled={disabled}
            >
              Configure
            </Button>
          </Stack>

          {/* Quick Overview */}
          {enabledCount > 0 && (
            <Paper
              sx={{
                p: 1.5,
                bgcolor: 'rgba(59,130,246,0.05)',
                borderColor: '#E5E7EB',
                border: '1px solid',
              }}
            >
              <Stack spacing={0.5}>
                {formData.readReceiptRequested && (
                  <Typography variant="caption">
                    ✓ Read receipt requested
                  </Typography>
                )}
                {formData.priority && formData.priority !== 'normal' && (
                  <Typography variant="caption">
                    ✓ Priority: <strong>{formData.priority}</strong>
                  </Typography>
                )}
                {formData.replyTo && (
                  <Typography variant="caption">
                    ✓ Reply to: <strong>{formData.replyTo}</strong>
                  </Typography>
                )}
                {formData.trackingEnabled && (
                  <Typography variant="caption">
                    ✓ Email tracking enabled
                  </Typography>
                )}
                {formData.retryFailed && (
                  <Typography variant="caption">
                    ✓ Auto-retry failed emails ({formData.maxRetries || 3} times)
                  </Typography>
                )}
                {formData.requestDeliveryConfirmation && (
                  <Typography variant="caption">
                    ✓ Delivery confirmation requested
                  </Typography>
                )}
              </Stack>
            </Paper>
          )}

          {enabledCount === 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
              Click Configure to add advanced email options
            </Typography>
          )}
        </Stack>
      </Paper>

      {/* Dialog */}
      <Dialog open={showDialog} onClose={() => setShowDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Advanced Email Options</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {/* Priority */}
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMore />}>
                <Typography variant="subtitle2">Priority & Importance</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Stack spacing={1.5}>
                  <Select
                    value={formData.priority || 'normal'}
                    onChange={(e) => handleChange('priority', e.target.value as 'low' | 'normal' | 'high')}
                    fullWidth
                    size="small"
                  >
                    <MenuItem value="low">Low Priority</MenuItem>
                    <MenuItem value="normal">Normal Priority</MenuItem>
                    <MenuItem value="high">High Priority</MenuItem>
                  </Select>
                  <Typography variant="caption" color="text.secondary">
                    Recipients will see this marked as high/low importance
                  </Typography>
                </Stack>
              </AccordionDetails>
            </Accordion>

            {/* Receipts & Tracking */}
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMore />}>
                <Typography variant="subtitle2">Receipts & Tracking</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Stack spacing={1.5}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={formData.readReceiptRequested || false}
                        onChange={(e) => handleChange('readReceiptRequested', e.target.checked)}
                      />
                    }
                    label="Request read receipt"
                  />
                  <Typography variant="caption" color="text.secondary">
                    Get notified when recipient opens the email (if supported)
                  </Typography>

                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={formData.requestDeliveryConfirmation || false}
                        onChange={(e) => handleChange('requestDeliveryConfirmation', e.target.checked)}
                      />
                    }
                    label="Request delivery confirmation"
                  />
                  <Typography variant="caption" color="text.secondary">
                    Confirm when email is delivered
                  </Typography>

                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={formData.trackingEnabled || false}
                        onChange={(e) => handleChange('trackingEnabled', e.target.checked)}
                      />
                    }
                    label="Enable email tracking"
                  />
                  <Typography variant="caption" color="text.secondary">
                    Track when email is opened and links are clicked
                  </Typography>
                </Stack>
              </AccordionDetails>
            </Accordion>

            {/* Reply-To & Retry */}
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMore />}>
                <Typography variant="subtitle2">Reply-To & Delivery</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Stack spacing={1.5}>
                  <TextField
                    type="email"
                    label="Reply-To Address (Optional)"
                    value={formData.replyTo || ''}
                    onChange={(e) => handleChange('replyTo', e.target.value || undefined)}
                    placeholder="Replies will go to this address"
                    fullWidth
                    size="small"
                  />
                  <Typography variant="caption" color="text.secondary">
                    Leave empty to use sender's email
                  </Typography>

                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={formData.retryFailed || false}
                        onChange={(e) => handleChange('retryFailed', e.target.checked)}
                      />
                    }
                    label="Retry failed sends"
                  />

                  {formData.retryFailed && (
                    <TextField
                      type="number"
                      label="Max retries"
                      value={formData.maxRetries || 3}
                      onChange={(e) => handleChange('maxRetries', Math.max(1, parseInt(e.target.value) || 3))}
                      inputProps={{ min: 1, max: 10 }}
                      size="small"
                    />
                  )}
                  <Typography variant="caption" color="text.secondary">
                    Automatically retry failed sends up to N times
                  </Typography>
                </Stack>
              </AccordionDetails>
            </Accordion>

            {/* Info */}
            <Paper sx={{ p: 1.5, bgcolor: 'rgba(59,130,246,0.05)' }}>
              <Typography variant="caption" color="text.secondary">
                💡 These options enhance email delivery and tracking. Some recipients may not support all features.
              </Typography>
            </Paper>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave}>
            Save Options
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
