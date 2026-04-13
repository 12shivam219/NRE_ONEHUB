import React, { useState } from 'react';
import {
  Box,
  Paper,
  Stack,
  Tooltip,
  IconButton,
  Divider,
  TextField,
  Typography,
  Button,
} from '@mui/material';
import {
  FormatBold,
  FormatItalic,
  FormatUnderlined,
  StrikethroughS,
  FormatListBulleted,
  FormatListNumbered,
  FormatAlignLeft,
  FormatAlignCenter,
  FormatAlignRight,
  Link as LinkIcon,
  Code,
  Undo,
  Redo,
  Palette,
} from '@mui/icons-material';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minRows?: number;
  maxRows?: number;
  fullWidth?: boolean;
  disabled?: boolean;
  showFormatting?: boolean;
}

interface ToolbarButtonProps {
  tooltip: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}

const ToolbarButton = ({ tooltip, onClick, disabled: isDisabled, children }: ToolbarButtonProps) => (
  <Tooltip title={tooltip}>
    <IconButton
      size="small"
      onClick={onClick}
      disabled={isDisabled}
      sx={{
        '&:hover': {
          bgcolor: 'rgba(37, 99, 235, 0.1)',
          color: '#2563eb',
        },
        borderRadius: '6px',
        transition: 'all 0.2s ease',
        color: '#4b5563',
      }}
    >
      {children}
    </IconButton>
  </Tooltip>
);

export const RichTextEditor = ({
  value,
  onChange,
  placeholder = 'Write your email...',
  minRows = 6,
  maxRows = 12,
  fullWidth = true,
  disabled = false,
  showFormatting = true,
}: RichTextEditorProps) => {
  const [history, setHistory] = useState<string[]>([value]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [fontSize, setFontSize] = useState('16');
  const [fontFamily, setFontFamily] = useState('Arial');
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');

  // Apply formatting
  const applyFormatting = (before: string, after: string = '') => {
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.substring(start, end);
    const newValue = value.substring(0, start) + before + selected + after + value.substring(end);

    onChange(newValue);
    addToHistory(newValue);

    // Restore cursor position
    setTimeout(() => {
      textarea.selectionStart = start + before.length;
      textarea.selectionEnd = start + before.length + selected.length;
      textarea.focus();
    }, 0);
  };

  // Add to history for undo/redo
  const addToHistory = (newValue: string) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newValue);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  // Undo
  const handleUndo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      onChange(history[newIndex]);
    }
  };

  // Redo
  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      onChange(history[newIndex]);
    }
  };

  // Handle value change
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    addToHistory(newValue);
  };

  // Insert link
  const handleInsertLink = () => {
    if (!linkUrl || !linkText) return;
    const link = `[${linkText}](${linkUrl})`;
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    const start = textarea.selectionStart;
    const newValue = value.substring(0, start) + link + value.substring(start);
    onChange(newValue);
    addToHistory(newValue);
    setShowLinkDialog(false);
    setLinkUrl('');
    setLinkText('');
  };

  // Get character and word count
  const charCount = value.length;
  const wordCount = value.trim().split(/\s+/).filter(w => w.length > 0).length;

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
        {/* Header */}
        <Typography
          variant="h4"
          sx={{
            fontWeight: 700,
            fontSize: '18px',
            color: '#111827',
            letterSpacing: '-0.3px',
          }}
        >
          ✏️ Email Body
        </Typography>

        {/* Toolbar */}
        {showFormatting && (
          <>
            <Stack spacing={1}>
              {/* Row 1: Text Styling */}
              <Paper
                variant="outlined"
                sx={{
                  p: 1.5,
                  bgcolor: '#f9fafb',
                  borderColor: '#e5e7eb',
                  borderRadius: '6px',
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    display: 'block',
                    mb: 0.75,
                    fontWeight: 700,
                    color: '#4b5563',
                    fontSize: '11px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  Text Formatting
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
                  <ToolbarButton tooltip="Bold (Ctrl+B)" onClick={() => applyFormatting('**', '**')} disabled={disabled}>
                    <FormatBold fontSize="small" />
                  </ToolbarButton>

                  <ToolbarButton tooltip="Italic (Ctrl+I)" onClick={() => applyFormatting('*', '*')} disabled={disabled}>
                    <FormatItalic fontSize="small" />
                  </ToolbarButton>

                  <ToolbarButton tooltip="Underline" onClick={() => applyFormatting('<u>', '</u>')} disabled={disabled}>
                    <FormatUnderlined fontSize="small" />
                  </ToolbarButton>

                  <ToolbarButton tooltip="Strikethrough" onClick={() => applyFormatting('~~', '~~')} disabled={disabled}>
                    <StrikethroughS fontSize="small" />
                  </ToolbarButton>

                  <Divider orientation="vertical" flexItem sx={{ my: 0.5, borderColor: '#d1d5db' }} />

                  {/* Font Size */}
                  <Tooltip title="Font Size">
                    <select
                      value={fontSize}
                      onChange={(e) => setFontSize(e.target.value)}
                      disabled={disabled}
                      style={{
                        padding: '6px 10px',
                        borderRadius: '6px',
                        border: '1px solid #e5e7eb',
                        fontSize: '12px',
                        cursor: 'pointer',
                        backgroundColor: '#ffffff',
                        color: '#111827',
                        fontWeight: 500,
                      }}
                    >
                      <option value="12">12px</option>
                      <option value="14">14px</option>
                      <option value="16">16px</option>
                      <option value="18">18px</option>
                      <option value="20">20px</option>
                      <option value="24">24px</option>
                    </select>
                  </Tooltip>

                  {/* Font Family */}
                  <Tooltip title="Font Family">
                    <select
                      value={fontFamily}
                      onChange={(e) => setFontFamily(e.target.value)}
                      disabled={disabled}
                      style={{
                        padding: '6px 10px',
                        borderRadius: '6px',
                        border: '1px solid #e5e7eb',
                        fontSize: '12px',
                        cursor: 'pointer',
                        fontFamily: fontFamily,
                        backgroundColor: '#ffffff',
                        color: '#111827',
                        fontWeight: 500,
                      }}
                    >
                      <option value="Arial">Arial</option>
                      <option value="Verdana">Verdana</option>
                      <option value="Georgia">Georgia</option>
                      <option value="Times New Roman">Times New Roman</option>
                      <option value="Courier New">Courier New</option>
                      <option value="Trebuchet MS">Trebuchet MS</option>
                    </select>
                  </Tooltip>

                  <Divider orientation="vertical" flexItem sx={{ my: 0.5, borderColor: '#d1d5db' }} />

                  {/* Text Color */}
                  <Tooltip title="Text Color">
                    <span>
                      <IconButton
                        size="small"
                        onClick={() => setShowColorPicker(!showColorPicker)}
                        disabled={disabled}
                        sx={{
                          '&:hover': {
                            bgcolor: 'rgba(37, 99, 235, 0.1)',
                            color: '#2563eb',
                          },
                          borderRadius: '6px',
                          transition: 'all 0.2s ease',
                          color: '#4b5563',
                        }}
                      >
                        <Palette fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Box>
              </Paper>

              {/* Row 2: List & Alignment */}
              <Paper
                variant="outlined"
                sx={{
                  p: 1.5,
                  bgcolor: '#f9fafb',
                  borderColor: '#e5e7eb',
                  borderRadius: '6px',
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    display: 'block',
                    mb: 0.75,
                    fontWeight: 700,
                    color: '#4b5563',
                    fontSize: '11px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  Structure
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
                  {/* Lists */}
                  <ToolbarButton tooltip="Bullet List" onClick={() => applyFormatting('• ')} disabled={disabled}>
                    <FormatListBulleted fontSize="small" />
                  </ToolbarButton>

                  <ToolbarButton tooltip="Numbered List" onClick={() => applyFormatting('1. ')} disabled={disabled}>
                    <FormatListNumbered fontSize="small" />
                  </ToolbarButton>

                  <Divider orientation="vertical" flexItem sx={{ my: 0.5, borderColor: '#d1d5db' }} />

                  {/* Alignment */}
                  <ToolbarButton tooltip="Align Left" onClick={() => applyFormatting('\n⬅ ')} disabled={disabled}>
                    <FormatAlignLeft fontSize="small" />
                  </ToolbarButton>

                  <ToolbarButton tooltip="Align Center" onClick={() => applyFormatting('\n🔹 ')} disabled={disabled}>
                    <FormatAlignCenter fontSize="small" />
                  </ToolbarButton>

                  <ToolbarButton tooltip="Align Right" onClick={() => applyFormatting('\n➡ ')} disabled={disabled}>
                    <FormatAlignRight fontSize="small" />
                  </ToolbarButton>
                </Box>
              </Paper>

              {/* Row 3: Advanced */}
              <Paper
                variant="outlined"
                sx={{
                  p: 1.5,
                  bgcolor: '#f9fafb',
                  borderColor: '#e5e7eb',
                  borderRadius: '6px',
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    display: 'block',
                    mb: 0.75,
                    fontWeight: 700,
                    color: '#4b5563',
                    fontSize: '11px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  Advanced
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
                  {/* Link */}
                  <ToolbarButton tooltip="Insert Link" onClick={() => setShowLinkDialog(true)} disabled={disabled}>
                    <LinkIcon fontSize="small" />
                  </ToolbarButton>

                  <ToolbarButton tooltip="Insert Code" onClick={() => applyFormatting('<code>', '</code>')} disabled={disabled}>
                    <Code fontSize="small" />
                  </ToolbarButton>

                  <Divider orientation="vertical" flexItem sx={{ my: 0.5, borderColor: '#d1d5db' }} />

                  {/* Undo/Redo */}
                  <ToolbarButton tooltip="Undo" onClick={handleUndo} disabled={disabled || historyIndex === 0}>
                    <Undo fontSize="small" />
                  </ToolbarButton>

                  <ToolbarButton tooltip="Redo" onClick={handleRedo} disabled={disabled || historyIndex === history.length - 1}>
                    <Redo fontSize="small" />
                  </ToolbarButton>
                </Box>
              </Paper>
            </Stack>

            <Divider sx={{ borderColor: '#e5e7eb' }} />
          </>
        )}

        {/* Text Area */}
        <TextField
          multiline
          minRows={minRows}
          maxRows={maxRows}
          fullWidth={fullWidth}
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          disabled={disabled}
          variant="outlined"
          size="small"
          inputProps={{
            'aria-label': 'Email body content',
            spellCheck: 'true',
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              fontFamily: fontFamily,
              fontSize: `${fontSize}px`,
              backgroundColor: '#f9fafb',
              borderRadius: '6px',
              transition: 'all 0.2s ease',
              '&:hover': {
                borderColor: '#d1d5db',
              },
              '&.Mui-focused': {
                boxShadow: '0 0 0 3px rgba(37, 99, 235, 0.1)',
                borderColor: '#2563eb',
              },
            },
            '& .MuiOutlinedInput-input::placeholder': {
              color: '#9ca3af',
              opacity: 1,
            },
          }}
        />

        {/* Character/Word Count */}
        <Paper
          variant="outlined"
          sx={{
            p: 1.5,
            bgcolor: '#f3f4f6',
            borderColor: '#e5e7eb',
            borderRadius: '6px',
          }}
        >
          <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2}>
            <Stack direction="row" spacing={2}>
              <Stack spacing={0.25}>
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 700,
                    color: '#4b5563',
                    fontSize: '11px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  Words
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: 700,
                    color: '#2563eb',
                    fontSize: '16px',
                  }}
                >
                  {wordCount}
                </Typography>
              </Stack>
              <Stack spacing={0.25}>
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 700,
                    color: '#4b5563',
                    fontSize: '11px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  Characters
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: 700,
                    color: charCount > 5000 ? '#f97316' : '#111827',
                    fontSize: '16px',
                  }}
                >
                  {charCount}
                </Typography>
              </Stack>
            </Stack>

            {charCount > 0 && (
              <Stack spacing={0.25} alignItems="flex-end">
                <Typography
                  variant="caption"
                  sx={{
                    color: charCount > 5000 ? '#f97316' : '#10b981',
                    fontWeight: 600,
                  }}
                >
                  {charCount > 5000 ? '⚠ Over recommended limit' : '✓ Good'}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    color: '#4b5563',
                  }}
                >
                  Limit: 5000 chars
                </Typography>
              </Stack>
            )}
          </Stack>
        </Paper>

        {/* Link Dialog */}
        {showLinkDialog && (
          <Paper
            sx={{
              p: 2,
              bgcolor: '#ecfdf5',
              borderColor: '#6ee7b7',
              border: '1px solid',
              borderRadius: '6px',
            }}
          >
            <Stack spacing={1.5}>
              <Typography
                variant="subtitle2"
                sx={{
                  fontWeight: 700,
                  color: '#111827',
                }}
              >
                Insert Link
              </Typography>
              <TextField
                size="small"
                label="Link Text"
                value={linkText}
                onChange={(e) => setLinkText(e.target.value)}
                placeholder="Display text"
                fullWidth
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: '6px',
                  },
                }}
              />
              <TextField
                size="small"
                label="URL"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://example.com"
                fullWidth
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: '6px',
                  },
                }}
              />
              <Stack direction="row" spacing={1} justifyContent="flex-end">
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => setShowLinkDialog(false)}
                  sx={{
                    borderRadius: '6px',
                    textTransform: 'none',
                    borderColor: '#e5e7eb',
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  onClick={handleInsertLink}
                  disabled={!linkUrl || !linkText}
                  sx={{
                    borderRadius: '6px',
                    textTransform: 'none',
                    backgroundColor: '#10b981',
                    '&:hover': {
                      backgroundColor: '#059669',
                    },
                  }}
                >
                  Insert Link
                </Button>
              </Stack>
            </Stack>
          </Paper>
        )}
      </Stack>
    </Paper>
  );
};
