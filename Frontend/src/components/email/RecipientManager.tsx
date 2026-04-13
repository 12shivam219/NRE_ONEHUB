import { useState } from 'react';
import {
  Box,
  Stack,
  Typography,
  Button,
  Chip,
  TextField,
  Paper,
  Tooltip,
} from '@mui/material';
import { Add, Close } from '@mui/icons-material';

interface Recipient {
  email: string;
  name?: string;
}

interface RecipientManagerProps {
  to: Recipient[];
  cc?: Recipient[];
  bcc?: Recipient[];
  onToChange?: (recipients: Recipient[]) => void;
  onCcChange?: (recipients: Recipient[]) => void;
  onBccChange?: (recipients: Recipient[]) => void;
  disabled?: boolean;
}

export const RecipientManager = ({
  to,
  cc = [],
  bcc = [],
  onToChange,
  onCcChange,
  onBccChange,
  disabled = false,
}: RecipientManagerProps) => {
  const [expandedField, setExpandedField] = useState<'to' | 'cc' | 'bcc' | null>('to');
  const [newRecipient, setNewRecipient] = useState('');
  const [duplicateError, setDuplicateError] = useState<string | null>(null);

  // Validate email format
  const isValidEmail = (email: string) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email.trim());
  };

  // Parse recipient input (supports "email" or "Name <email>")
  const parseRecipient = (input: string): Recipient | null => {
    const trimmed = input.trim();
    if (!trimmed) return null;

    // Format: Name <email>
    const bracketsMatch = trimmed.match(/^(.+?)\s*<([^>]+)>$/);
    if (bracketsMatch) {
      const [, name, email] = bracketsMatch;
      if (isValidEmail(email)) {
        return { email: email.trim(), name: name.trim() };
      }
    }

    // Format: email
    if (isValidEmail(trimmed)) {
      return { email: trimmed };
    }

    // Format: email, Name
    const commaMatch = trimmed.match(/^([^,]+),\s*(.+)$/);
    if (commaMatch) {
      const [, email, name] = commaMatch;
      if (isValidEmail(email)) {
        return { email: email.trim(), name: name.trim() };
      }
    }

    return null;
  };

  // Check for duplicates
  const isDuplicate = (email: string): boolean => {
    const allEmails = [
      ...to.map(r => r.email.toLowerCase()),
      ...cc.map(r => r.email.toLowerCase()),
      ...bcc.map(r => r.email.toLowerCase()),
    ];
    return allEmails.includes(email.toLowerCase());
  };

  // Add recipient
  const addRecipient = (field: 'to' | 'cc' | 'bcc') => {
    const recipient = parseRecipient(newRecipient);
    if (!recipient) {
      setDuplicateError('Invalid email format');
      return;
    }

    if (isDuplicate(recipient.email)) {
      setDuplicateError('This email is already added');
      return;
    }

    setDuplicateError(null);

    if (field === 'to' && onToChange) {
      onToChange([...to, recipient]);
    } else if (field === 'cc' && onCcChange) {
      onCcChange([...cc, recipient]);
    } else if (field === 'bcc' && onBccChange) {
      onBccChange([...bcc, recipient]);
    }

    setNewRecipient('');
  };

  // Remove recipient
  const removeRecipient = (
    field: 'to' | 'cc' | 'bcc',
    email: string
  ) => {
    if (field === 'to' && onToChange) {
      onToChange(to.filter(r => r.email !== email));
    } else if (field === 'cc' && onCcChange) {
      onCcChange(cc.filter(r => r.email !== email));
    } else if (field === 'bcc' && onBccChange) {
      onBccChange(bcc.filter(r => r.email !== email));
    }
  };

  const renderRecipientField = (
    field: 'to' | 'cc' | 'bcc',
    recipients: Recipient[],
    label: string,
    tooltip: string,
    isDefault: boolean = false
  ) => {
    // All fields are expanded by default, can collapse if needed
    const isExpanded = expandedField === null || expandedField === field || isDefault;

    return (
      <Box key={field}>
        <Stack 
          spacing={1.5} 
          sx={{ 
            mb: 2, 
            p: 2, 
            bgcolor: '#ffffff',
            borderRadius: '6px',
            border: '1px solid #e5e7eb',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
            transition: 'all 0.2s ease',
            '&:hover': {
              borderColor: '#d1d5db',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.08)',
            }
          }}
        >
          {/* Field Header with Badge */}
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Tooltip title={tooltip}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography 
                  variant="h5" 
                  sx={{ 
                    fontWeight: 600,
                    fontSize: '14px',
                    color: '#111827',
                    lineHeight: 1.4
                  }}
                >
                  {label}
                </Typography>
                {recipients.length > 0 && (
                  <Chip 
                    label={`${recipients.length} recipient${recipients.length !== 1 ? 's' : ''}`} 
                    size="small" 
                    variant="outlined"
                    sx={{ 
                      height: 24,
                      backgroundColor: '#f3f4f6',
                      borderColor: '#d1d5db',
                      color: '#4b5563',
                      fontWeight: 500,
                    }}
                  />
                )}
              </Stack>
            </Tooltip>
            {isExpanded && recipients.length > 0 && (
              <Button
                variant="text"
                size="small"
                onClick={() => setExpandedField(null)}
                sx={{ 
                  textTransform: 'none',
                  color: '#6b7280'
                }}
              >
                ✕
              </Button>
            )}
          </Stack>

          {/* Input Row */}
          <Stack direction="row" spacing={1}>
            <TextField
              size="small"
              fullWidth
              placeholder={field === 'to' ? 'Add recipient...' : field === 'cc' ? 'Add CC recipient...' : 'Add BCC recipient...'}
              value={newRecipient && expandedField === field ? newRecipient : ''}
              onChange={(e) => {
                setNewRecipient(e.target.value);
                setDuplicateError(null);
                setExpandedField(field);
              }}
              onFocus={() => setExpandedField(field)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  addRecipient(field);
                }
              }}
              disabled={disabled}
              error={expandedField === field && !!duplicateError}
              helperText={expandedField === field && duplicateError ? duplicateError : ''}
              FormHelperTextProps={{ sx: { mt: 0.5 } }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: '6px',
                  backgroundColor: '#f9fafb',
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    borderColor: '#d1d5db'
                  },
                  '&.Mui-focused': {
                    boxShadow: '0 0 0 3px rgba(37, 99, 235, 0.1)',
                    borderColor: '#2563eb'
                  }
                },
                '& .MuiOutlinedInput-input::placeholder': {
                  color: '#9ca3af',
                  opacity: 1
                }
              }}
            />
            <Button
              variant="contained"
              size="small"
              onClick={() => {
                addRecipient(field);
                setExpandedField(field);
              }}
              disabled={disabled || !newRecipient.trim()}
              startIcon={<Add fontSize="small" />}
              sx={{ 
                flexShrink: 0,
                backgroundColor: '#2563eb',
                color: '#ffffff',
                fontWeight: 600,
                borderRadius: '6px',
                padding: '6px 16px',
                textTransform: 'none',
                '&:hover': {
                  backgroundColor: '#1d4ed8',
                },
                '&:disabled': {
                  backgroundColor: '#e5e7eb',
                  color: '#9ca3af'
                }
              }}
            >
              Add
            </Button>
          </Stack>

          {/* Display recipients */}
          {recipients.length > 0 && (
            <Stack spacing={0.75}>
              {recipients.map((recipient) => (
                <Chip
                  key={recipient.email}
                  label={
                    recipient.name
                      ? `${recipient.name} <${recipient.email}>`
                      : recipient.email
                  }
                  onDelete={() => removeRecipient(field, recipient.email)}
                  icon={<Close fontSize="small" />}
                  variant="outlined"
                  size="small"
                  sx={{
                    justifyContent: 'space-between',
                    backgroundColor: '#f3f4f6',
                    borderColor: '#d1d5db',
                    color: '#111827',
                    fontWeight: 500,
                    '& .MuiChip-label': { flex: 1 },
                    '& .MuiChip-deleteIcon': { color: '#6b7280' },
                    '&:hover': {
                      backgroundColor: '#f0f1f3',
                      borderColor: '#9ca3af'
                    }
                  }}
                />
              ))}
            </Stack>
          )}

          {/* Field Info */}
          <Typography 
            variant="caption" 
            sx={{ 
              pt: 0.5,
              color: '#4b5563',
              lineHeight: 1.4
            }}
          >
            {field === 'to' && '👁️ All recipients can see To addresses'}
            {field === 'cc' && '👁️ All recipients can see CC addresses'}
            {field === 'bcc' && '🔒 BCC recipients are hidden from everyone'}
          </Typography>
        </Stack>
      </Box>
    );
  };

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2.5,
        bgcolor: '#ffffff',
        borderColor: '#e5e7eb',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        transition: 'all 0.2s ease',
      }}
    >
      <Stack spacing={2}>
        <Stack spacing={0.5}>
          <Typography 
            variant="h4" 
            sx={{ 
              fontWeight: 700, 
              fontSize: '18px',
              color: '#111827',
              letterSpacing: '-0.3px'
            }}
          >
            📧 Recipients
          </Typography>
          <Typography 
            variant="body2" 
            sx={{
              color: '#4b5563',
              lineHeight: 1.5
            }}
          >
            {to.length + cc.length + bcc.length > 0 
              ? `${to.length + cc.length + bcc.length} total recipient${to.length + cc.length + bcc.length !== 1 ? 's' : ''} added`
              : 'Add recipients to send emails'}
          </Typography>
        </Stack>

        {renderRecipientField(
          'to',
          to,
          'To:',
          'Primary recipients - all can see To addresses',
          true
        )}

        {renderRecipientField(
          'cc',
          cc,
          'CC:',
          'Carbon Copy - visible to all recipients'
        )}

        {renderRecipientField(
          'bcc',
          bcc,
          'BCC:',
          'Blind Carbon Copy - hidden from other recipients'
        )}

        {/* Summary Card */}
        {(to.length + cc.length + bcc.length > 0) && (
          <Paper
            sx={{
              p: 2,
              bgcolor: '#ecfdf5',
              borderColor: '#6ee7b7',
              border: '1px solid',
              borderLeft: '4px solid #10b981',
              borderRadius: '6px',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
            }}
          >
            <Stack direction="row" spacing={3} sx={{ pt: 0.5 }}>
              <Stack spacing={0.25}>
                <Typography 
                  variant="caption" 
                  sx={{
                    color: '#4b5563',
                    fontWeight: 600
                  }}
                >
                  To
                </Typography>
                <Typography 
                  variant="body2" 
                  sx={{ 
                    fontWeight: 700,
                    color: '#111827',
                    fontSize: '16px'
                  }}
                >
                  {to.length}
                </Typography>
              </Stack>
              <Stack spacing={0.25}>
                <Typography 
                  variant="caption" 
                  sx={{
                    color: '#4b5563',
                    fontWeight: 600
                  }}
                >
                  CC
                </Typography>
                <Typography 
                  variant="body2" 
                  sx={{ 
                    fontWeight: 700,
                    color: '#111827',
                    fontSize: '16px'
                  }}
                >
                  {cc.length}
                </Typography>
              </Stack>
              <Stack spacing={0.25}>
                <Typography 
                  variant="caption" 
                  sx={{
                    color: '#4b5563',
                    fontWeight: 600
                  }}
                >
                  BCC
                </Typography>
                <Typography 
                  variant="body2" 
                  sx={{ 
                    fontWeight: 700,
                    color: '#111827',
                    fontSize: '16px'
                  }}
                >
                  {bcc.length}
                </Typography>
              </Stack>
              <Box sx={{ flex: 1 }} />
              <Stack spacing={0.25} alignItems="flex-end">
                <Typography 
                  variant="caption" 
                  sx={{
                    color: '#4b5563',
                    fontWeight: 600
                  }}
                >
                  Total
                </Typography>
                <Typography 
                  variant="h6" 
                  sx={{ 
                    fontWeight: 700, 
                    color: '#2563eb',
                    fontSize: '18px'
                  }}
                >
                  {to.length + cc.length + bcc.length}
                </Typography>
              </Stack>
            </Stack>
          </Paper>
        )}
      </Stack>
    </Paper>
  );
};
