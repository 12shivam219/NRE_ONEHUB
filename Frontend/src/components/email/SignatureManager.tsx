import { useState } from 'react';
import {
  Stack,
  Paper,
  Typography,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Tooltip,
  Chip,
} from '@mui/material';
import { Plus, Trash2, Edit2, Check } from 'lucide-react';

export interface EmailSignature {
  id: string;
  name: string;
  content: string;
  isDefault: boolean;
  createdAt: string;
}

interface SignatureManagerProps {
  signatures: EmailSignature[];
  onSignaturesChange: (signatures: EmailSignature[]) => void;
  onSignatureSelect?: (signature: EmailSignature) => void;
  disabled?: boolean;
}

export const SignatureManager = ({
  signatures,
  onSignaturesChange,
  onSignatureSelect,
  disabled = false,
}: SignatureManagerProps) => {
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    content: '',
  });

  // Open dialog for new signature
  const handleNew = () => {
    setEditingId(null);
    setFormData({ name: '', content: '' });
    setShowDialog(true);
  };

  // Open dialog for editing
  const handleEdit = (signature: EmailSignature) => {
    setEditingId(signature.id);
    setFormData({ name: signature.name, content: signature.content });
    setShowDialog(true);
  };

  // Save signature
  const handleSave = () => {
    if (!formData.name.trim() || !formData.content.trim()) {
      return;
    }

    if (editingId) {
      // Update existing
      onSignaturesChange(
        signatures.map(s =>
          s.id === editingId
            ? { ...s, name: formData.name, content: formData.content }
            : s
        )
      );
    } else {
      // Create new
      const newSignature: EmailSignature = {
        id: `sig-${Date.now()}`,
        name: formData.name,
        content: formData.content,
        isDefault: signatures.length === 0,
        createdAt: new Date().toISOString(),
      };
      onSignaturesChange([...signatures, newSignature]);
    }

    setShowDialog(false);
    setFormData({ name: '', content: '' });
  };

  // Delete signature
  const handleDelete = (id: string) => {
    const updated = signatures.filter(s => s.id !== id);
    
    // If deleted signature was default, set first remaining as default
    if (signatures.find(s => s.id === id)?.isDefault && updated.length > 0) {
      updated[0].isDefault = true;
    }

    onSignaturesChange(updated);
  };

  // Set as default
  const handleSetDefault = (id: string) => {
    onSignaturesChange(
      signatures.map(s => ({
        ...s,
        isDefault: s.id === id,
      }))
    );
  };

  // Insert signature
  const handleInsert = (signature: EmailSignature) => {
    if (onSignatureSelect) {
      onSignatureSelect(signature);
    }
  };

  return (
    <>
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
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography 
              variant="h4" 
              sx={{ 
                fontWeight: 700,
                fontSize: '18px',
                color: '#111827',
                letterSpacing: '-0.3px'
              }}
            >
              ✍️ Email Signatures
            </Typography>
            <Button
              size="small"
              variant="contained"
              startIcon={<Plus className="w-4 h-4" />}
              onClick={handleNew}
              disabled={disabled}
              sx={{
                backgroundColor: '#2563eb',
                color: '#ffffff',
                fontWeight: 600,
                borderRadius: '6px',
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
              + New Signature
            </Button>
          </Stack>

          {signatures.length === 0 ? (
            <Paper
              sx={{
                p: 3,
                textAlign: 'center',
                bgcolor: '#f3f4f6',
                borderRadius: '8px',
                border: '1px dashed #d1d5db'
              }}
            >
              <Typography variant="body2" sx={{ color: '#4b5563', fontWeight: 500 }}>
                📝 No signatures yet
              </Typography>
              <Typography 
                variant="caption" 
                sx={{ 
                  color: '#6b7280',
                  display: 'block',
                  mt: 0.5
                }}
              >
                Click "+ New Signature" to create your first email signature
              </Typography>
            </Paper>
          ) : (
            <Stack spacing={1.5}
              role="list"
              aria-label="Email signatures"
            >
              {signatures.map(signature => (
                <Paper
                  key={signature.id}
                  variant="outlined"
                  role="listitem"
                  sx={{
                    p: 2,
                    bgcolor: '#f9fafb',
                    borderColor: '#e5e7eb',
                    borderRadius: '6px',
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      borderColor: '#d1d5db',
                      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.08)',
                    },
                  }}
                >
                  <Stack spacing={1.5}>
                    <Stack direction="row" justifyContent="space-between" alignItems="start">
                      <Stack sx={{ flex: 1 }}>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                          <Typography 
                            variant="body2" 
                            sx={{ 
                              fontWeight: 700,
                              color: '#111827',
                              fontSize: '14px'
                            }}
                          >
                            {signature.name}
                          </Typography>
                          {signature.isDefault && (
                            <Chip
                              label="Default"
                              size="small"
                              variant="filled"
                              icon={<Check className="w-3 h-3" />}
                              sx={{
                                backgroundColor: '#ecfdf5',
                                borderColor: '#6ee7b7',
                                color: '#10b981',
                                fontWeight: 600,
                                fontSize: '11px',
                              }}
                            />
                          )}
                        </Stack>
                        <Typography
                          variant="caption"
                          sx={{ 
                            whiteSpace: 'pre-wrap', 
                            color: '#4b5563',
                            lineHeight: 1.5
                          }}
                        >
                          {signature.content.substring(0, 100)}
                          {signature.content.length > 100 ? '...' : ''}
                        </Typography>
                      </Stack>

                      <Stack direction="row" spacing={0.5} sx={{ ml: 2, flexShrink: 0 }}>
                        <Tooltip title="Use in email">
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => handleInsert(signature)}
                            disabled={disabled}
                            sx={{
                              borderRadius: '6px',
                              borderColor: '#2563eb',
                              color: '#2563eb',
                              fontWeight: 600,
                              textTransform: 'none',
                              '&:hover': {
                                backgroundColor: 'rgba(37, 99, 235, 0.08)',
                                borderColor: '#1d4ed8',
                              }
                            }}
                          >
                            Insert
                          </Button>
                        </Tooltip>
                        <Tooltip title="Edit">
                          <IconButton
                            size="small"
                            onClick={() => handleEdit(signature)}
                            disabled={disabled}
                            aria-label={`Edit signature ${signature.name}`}
                            sx={{
                              borderRadius: '6px',
                              color: '#4b5563',
                              '&:hover': {
                                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                                color: '#2563eb',
                              }
                            }}
                          >
                            <Edit2 className="w-4 h-4" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton
                            size="small"
                            onClick={() => handleDelete(signature.id)}
                            disabled={disabled}
                            aria-label={`Delete signature ${signature.name}`}
                            sx={{
                              borderRadius: '6px',
                              color: '#6b7280',
                              '&:hover': {
                                color: '#ef4444',
                                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                              }
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </Stack>

                    {!signature.isDefault && (
                      <Button
                        size="small"
                        variant="text"
                        onClick={() => handleSetDefault(signature.id)}
                        disabled={disabled}
                        sx={{
                          color: '#2563eb',
                          fontWeight: 600,
                          textTransform: 'none',
                          padding: '4px 8px',
                          justifyContent: 'flex-start',
                          '&:hover': {
                            backgroundColor: 'rgba(37, 99, 235, 0.1)',
                          }
                        }}
                      >
                        ⭐ Set as Default
                      </Button>
                    )}
                  </Stack>
                </Paper>
              ))}
            </Stack>
          )}
        </Stack>
      </Paper>

      {/* Dialog */}
      <Dialog open={showDialog} onClose={() => setShowDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle
          sx={{
            fontWeight: 700,
            fontSize: '18px',
            color: '#111827',
            borderBottom: '1px solid #e5e7eb',
            py: 2,
          }}
        >
          {editingId ? '✏️ Edit Signature' : '✍️ Create New Signature'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 2 }}>
            <Stack spacing={0.5}>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 600,
                  color: '#111827',
                }}
              >
                Signature Name
              </Typography>
              <TextField
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Professional, Formal, Casual"
                fullWidth
                size="small"
                error={!formData.name.trim() && formData.content.trim() !== ''}
                helperText={!formData.name.trim() && formData.content.trim() !== '' ? 'Name is required' : ''}
                inputProps={{
                  'aria-label': 'Signature name',
                }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: '6px',
                  },
                }}
              />
            </Stack>

            <Stack spacing={0.5}>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 600,
                  color: '#111827',
                }}
              >
                Signature Content
              </Typography>
              <TextField
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                placeholder={`Best regards,
John Doe
john@example.com
(555) 123-4567`}
                multiline
                minRows={6}
                fullWidth
                size="small"
                error={!formData.content.trim() && formData.name.trim() !== ''}
                helperText={!formData.content.trim() && formData.name.trim() !== '' ? 'Content is required' : 'Plain text or markdown formatting'}
                inputProps={{
                  'aria-label': 'Signature content',
                }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: '6px',
                  },
                }}
              />
            </Stack>

            {/* Preview */}
            {formData.content && (
              <Paper
                sx={{
                  p: 2,
                  bgcolor: '#f9fafb',
                  borderColor: '#e5e7eb',
                  border: '1px solid',
                  borderRadius: '6px',
                }}
              >
                <Typography 
                  variant="caption" 
                  sx={{ 
                    fontWeight: 700,
                    color: '#4b5563',
                    display: 'block',
                    mb: 1,
                    fontSize: '11px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  📋 Preview
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    whiteSpace: 'pre-wrap',
                    color: '#111827',
                    lineHeight: 1.6,
                    fontSize: '13px',
                  }}
                >
                  {formData.content}
                </Typography>
              </Paper>
            )}
          </Stack>
        </DialogContent>
        <DialogActions
          sx={{
            borderTop: '1px solid #e5e7eb',
            padding: '16px',
            gap: 1,
          }}
        >
          <Button 
            onClick={() => setShowDialog(false)}
            sx={{
              borderRadius: '6px',
              textTransform: 'none',
              borderColor: '#e5e7eb',
              color: '#4b5563',
            }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={!formData.name.trim() || !formData.content.trim()}
            sx={{
              borderRadius: '6px',
              textTransform: 'none',
              backgroundColor: '#2563eb',
              '&:hover': {
                backgroundColor: '#1d4ed8',
              },
              '&:disabled': {
                backgroundColor: '#e5e7eb',
                color: '#9ca3af'
              }
            }}
          >
            {editingId ? '✏️ Update' : '✍️ Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
