import { useState, useRef } from 'react';
import {
  Box,
  Stack,
  Paper,
  Typography,
  Button,
  LinearProgress,
  Tooltip,
  Alert,
} from '@mui/material';
import { File, Image, Trash2 } from 'lucide-react';

export interface Attachment {
  id: string;
  name: string;
  size: number;
  type: string;
  file: File;
  uploadProgress?: number;
}

interface AttachmentManagerProps {
  attachments: Attachment[];
  onAttachmentsChange: (attachments: Attachment[]) => void;
  maxFileSize?: number; // in MB
  maxTotalSize?: number; // in MB
  disabled?: boolean;
}

export const AttachmentManager = ({
  attachments,
  onAttachmentsChange,
  maxFileSize = 25,
  maxTotalSize = 100,
  disabled = false,
}: AttachmentManagerProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDropZoneRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  // Get file icon
  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return <Image className="w-4 h-4" />;
    return <File className="w-4 h-4" />;
  };

  // Validate file
  const validateFile = (file: File): { valid: boolean; error?: string } => {
    // Check file size
    if (file.size > maxFileSize * 1024 * 1024) {
      return {
        valid: false,
        error: `File too large. Max size: ${maxFileSize}MB`,
      };
    }

    // Check total size
    const totalSize = attachments.reduce((acc, a) => acc + a.size, 0) + file.size;
    if (totalSize > maxTotalSize * 1024 * 1024) {
      return {
        valid: false,
        error: `Total attachment size exceeds ${maxTotalSize}MB limit`,
      };
    }

    return { valid: true };
  };

  // Handle file selection
  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;
    setError(null);

    const newAttachments: Attachment[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const validation = validateFile(file);

      if (!validation.valid) {
        setError(`${file.name}: ${validation.error}`);
        continue;
      }

      const attachment: Attachment = {
        id: `${Date.now()}-${i}`,
        name: file.name,
        size: file.size,
        type: file.type,
        file: file,
      };

      newAttachments.push(attachment);
    }

    if (newAttachments.length > 0) {
      onAttachmentsChange([...attachments, ...newAttachments]);
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Handle drag and drop
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    handleFileSelect(files);
  };

  // Remove attachment
  const removeAttachment = (id: string) => {
    onAttachmentsChange(attachments.filter(a => a.id !== id));
  };

  // Get total size
  const totalSize = attachments.reduce((acc, a) => acc + a.size, 0);
  const totalSizePercent = (totalSize / (maxTotalSize * 1024 * 1024)) * 100;

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
        <Typography 
          variant="h4" 
          sx={{ 
            fontWeight: 700,
            fontSize: '18px',
            color: '#111827',
            letterSpacing: '-0.3px'
          }}
        >
          📎 Attachments
        </Typography>

        {/* Error Alert */}
        {error && (
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Drop Zone */}
        <Box
          ref={dragDropZoneRef}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          sx={{
            p: 3,
            textAlign: 'center',
            border: '2px dashed',
            borderColor: isDragging ? '#2563eb' : '#d1d5db',
            borderRadius: '8px',
            bgcolor: isDragging ? 'rgba(37, 99, 235, 0.08)' : '#f9fafb',
            transition: 'all 0.2s ease',
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.5 : 1,
            '&:hover': {
              borderColor: isDragging ? '#2563eb' : '#9ca3af',
              bgcolor: isDragging ? 'rgba(37, 99, 235, 0.08)' : '#f3f4f6',
            },
          }}
        >
          <Stack spacing={1.5} alignItems="center">
            <Box
              sx={{
                fontSize: '2.5rem',
                animation: isDragging ? 'pulse 1s infinite' : 'none',
                '@keyframes pulse': {
                  '0%, 100%': { opacity: 1 },
                  '50%': { opacity: 0.7 },
                },
              }}
            >
              📁
            </Box>
            <Stack spacing={0.5} alignItems="center">
              <Typography 
                variant="body2" 
                sx={{ 
                  fontWeight: 700,
                  color: '#111827',
                  fontSize: '16px'
                }}
              >
                {isDragging ? '✓ Drop files here' : 'Drop files or browse'}
              </Typography>
              <Typography 
                variant="caption" 
                sx={{
                  color: '#4b5563',
                  lineHeight: 1.5
                }}
              >
                PNG, JPG, PDF, DOC (Max {maxFileSize}MB per file, {maxTotalSize}MB total)
              </Typography>
            </Stack>
            <Button
              component="span"
              size="small"
              variant="outlined"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
              sx={{
                textTransform: 'none',
                mt: 0.5,
                borderRadius: '6px',
                borderColor: '#2563eb',
                color: '#2563eb',
                fontWeight: 600,
                '&:hover': {
                  backgroundColor: 'rgba(37, 99, 235, 0.08)',
                  borderColor: '#1d4ed8',
                },
              }}
            >
              📁 Browse Files
            </Button>
          </Stack>
        </Box>

        {/* Hidden Input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={(e) => handleFileSelect(e.target.files)}
          disabled={disabled}
          style={{ display: 'none' }}
          aria-label="Upload attachments"
        />

        {/* Attachments List */}
        {attachments.length > 0 && (
          <Stack spacing={2}>
            {/* Size Indicator with Clear Labels */}
            <Stack 
              spacing={1.5} 
              sx={{ 
                p: 2, 
                bgcolor: '#f9fafb', 
                borderRadius: '6px', 
                border: '1px solid #e5e7eb',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
              }}
            >
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                <Stack spacing={0.25}>
                  <Typography 
                    variant="subtitle2" 
                    sx={{ 
                      fontWeight: 700,
                      color: '#111827',
                      fontSize: '14px'
                    }}
                  >
                    📊 Storage Usage
                  </Typography>
                  <Typography 
                    variant="body2" 
                    sx={{
                      color: '#4b5563',
                      fontSize: '13px'
                    }}
                  >
                    Current: <strong>{formatFileSize(totalSize)}</strong> / {formatFileSize(maxTotalSize * 1024 * 1024)} ({Math.round(totalSizePercent)}%)
                  </Typography>
                </Stack>
                <Typography 
                  variant="caption" 
                  sx={{ 
                    fontWeight: 700, 
                    color: totalSizePercent > 80 ? '#ef4444' : '#10b981',
                    fontSize: '12px'
                  }}
                >
                  {totalSizePercent > 80 ? '⚠ Warning' : '✓ OK'}
                </Typography>
              </Stack>
              <LinearProgress
                variant="determinate"
                value={Math.min(totalSizePercent, 100)}
                sx={{
                  height: 8,
                  borderRadius: '4px',
                  backgroundColor: '#e5e7eb',
                  '& .MuiLinearProgress-bar': {
                    backgroundColor:
                      totalSizePercent > 90
                        ? '#ef4444'
                        : totalSizePercent > 75
                          ? '#f97316'
                          : totalSizePercent > 60
                            ? '#3b82f6'
                            : '#10b981',
                    borderRadius: '4px',
                  },
                }}
              />
              <Stack direction="row" spacing={1}>
                <Paper 
                  variant="outlined" 
                  sx={{ 
                    flex: 1, 
                    p: 1, 
                    bgcolor: '#ffffff',
                    borderColor: '#e5e7eb',
                    borderRadius: '6px'
                  }}
                >
                  <Typography 
                    variant="caption" 
                    sx={{
                      color: '#4b5563',
                      fontWeight: 500
                    }}
                  >
                    Per File: <strong>{maxFileSize}MB max</strong>
                  </Typography>
                </Paper>
                <Paper 
                  variant="outlined" 
                  sx={{ 
                    flex: 1, 
                    p: 1, 
                    bgcolor: '#ffffff',
                    borderColor: '#e5e7eb',
                    borderRadius: '6px'
                  }}
                >
                  <Typography 
                    variant="caption" 
                    sx={{
                      color: '#4b5563',
                      fontWeight: 500
                    }}
                  >
                    Total: <strong>{maxTotalSize}MB max</strong>
                  </Typography>
                </Paper>
              </Stack>
            </Stack>

            {/* Attachment Items */}
            <Stack spacing={1}>
              <Typography 
                variant="subtitle2" 
                sx={{ 
                  fontWeight: 700,
                  color: '#111827',
                  fontSize: '14px'
                }}
              >
                📎 Attached Files ({attachments.length})
              </Typography>
              {attachments.map((attachment) => (
                <Paper
                  key={attachment.id}
                  variant="outlined"
                  sx={{
                    p: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    bgcolor: '#f9fafb',
                    borderColor: '#e5e7eb',
                    transition: 'all 0.2s',
                    borderRadius: '6px',
                    '&:hover': {
                      borderColor: '#d1d5db',
                      bgcolor: '#f3f4f6',
                      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.08)',
                    },
                  }}
                >
                  <Stack
                    direction="row"
                    spacing={1.5}
                    alignItems="center"
                    sx={{ flex: 1, minWidth: 0 }}
                  >
                    <Box
                      sx={{
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        p: 1,
                        bgcolor: 'rgba(37, 99, 235, 0.1)',
                        borderRadius: '6px',
                        color: '#2563eb',
                      }}
                    >
                      {getFileIcon(attachment.type)}
                    </Box>
                    <Stack sx={{ flex: 1, minWidth: 0 }}>
                      <Tooltip title={attachment.name}>
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 600,
                            color: '#111827',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {attachment.name}
                        </Typography>
                      </Tooltip>
                      <Typography 
                        variant="caption" 
                        sx={{
                          color: '#4b5563',
                          marginTop: '2px'
                        }}
                      >
                        {formatFileSize(attachment.size)}
                      </Typography>
                    </Stack>
                  </Stack>

                  {attachment.uploadProgress !== undefined && (
                    <LinearProgress
                      variant="determinate"
                      value={attachment.uploadProgress}
                      sx={{ width: 60, mr: 1, borderRadius: '4px' }}
                    />
                  )}

                  <Tooltip title="Remove file">
                    <Button
                      size="small"
                      variant="text"
                      onClick={() => removeAttachment(attachment.id)}
                      disabled={disabled}
                      sx={{
                        minWidth: 0,
                        p: 0.75,
                        color: '#6b7280',
                        '&:hover': {
                          color: '#ef4444',
                          backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        },
                        borderRadius: '6px'
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </Tooltip>
                </Paper>
              ))}
            </Stack>

            {/* Upload Summary */}
            <Paper 
              variant="outlined" 
              sx={{ 
                p: 1.5, 
                bgcolor: '#ecfdf5', 
                borderColor: '#6ee7b7', 
                borderLeft: '4px solid #10b981',
                borderRadius: '6px'
              }}
            >
              <Typography 
                variant="body2"
                sx={{
                  color: '#111827'
                }}
              >
                <strong>✓ {attachments.length}</strong> file{attachments.length !== 1 ? 's' : ''} • <strong>{formatFileSize(totalSize)}</strong> used
              </Typography>
            </Paper>
          </Stack>
        )}

        {/* Empty State */}
        {attachments.length === 0 && (
          <Typography 
            variant="body2" 
            sx={{ 
              textAlign: 'center', 
              py: 2,
              color: '#4b5563'
            }}
          >
            ℹ️ No attachments yet. Drop files or click "Browse Files" to add them.
          </Typography>
        )}
      </Stack>
    </Paper>
  );
};
