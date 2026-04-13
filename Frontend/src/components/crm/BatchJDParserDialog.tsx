import { useState } from "react"
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Button,
  Stack,
  TextField,
  Typography,
  List,
  ListItemButton,
  Divider,
  IconButton,
  Chip,
  Paper,
  Tooltip
} from "@mui/material"
import { X, Plus, Zap, CheckCircle, AlertCircle, Clock } from "lucide-react"
import { parseJD } from "../../lib/agents/jobExtractionAgent"
import type { ExtractedJobDetails as JdExtractionResult } from "../../lib/agents/types"

type BatchJD = {
  id: string
  title: string
  text: string
  parsed?: JdExtractionResult
  status: "idle" | "parsed" | "error"
}

export function BatchJDParserDialog({
  open,
  onClose,
  onParsedData
}: {
  open: boolean
  onClose: () => void
  onParsedData?: (extraction: JdExtractionResult, cleanedText: string) => void
}) {
  const [jobs, setJobs] = useState<BatchJD[]>([
    {
      id: crypto.randomUUID(),
      title: "Job Desc 1",
      text: "",
      status: "idle"
    }
  ])
  const [activeId, setActiveId] = useState(jobs[0].id)
  const activeJob = jobs.find(j => j.id === activeId)!

  /* ================================
     HELPERS
  ================================= */

  function updateJob(id: string, updates: Partial<BatchJD>) {
    setJobs(prev =>
      prev.map(j => (j.id === id ? { ...j, ...updates } : j))
    )
  }

  function addJob() {
    setJobs(prev => [
      ...prev,
      {
        id: crypto.randomUUID(),
        title: `Job Desc ${prev.length + 1}`,
        text: "",
        status: "idle"
      }
    ])
  }

  /* ================================
     PARSE ACTIONS
  ================================= */

  async function parseCurrent() {
    if (!activeJob.text.trim()) return

    try {
      const parsed = await parseJD(activeJob.text)
      updateJob(activeJob.id, { parsed, status: "parsed" })
    } catch {
      updateJob(activeJob.id, { status: "error" })
    }
  }

  async function parseAll() {
    for (const job of jobs) {
      if (!job.text.trim()) continue

      try {
        const parsed = await parseJD(job.text)
        updateJob(job.id, { parsed, status: "parsed" })
      } catch {
        updateJob(job.id, { status: "error" })
      }
    }
  }

  /* ================================
     RENDER
  ================================= */

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="xl"
      disableScrollLock
      slotProps={{
        paper: {
          sx: {
            borderRadius: '12px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
          },
        },
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid',
          borderColor: 'divider',
          pb: 1.5,
        }}
      >
        <Stack direction="row" spacing={1} alignItems="center">
          <Zap className="w-5 h-5" style={{ color: '#2563EB' }} />
          <Typography sx={{ fontWeight: 700, fontSize: '1rem' }}>
            Batch Job Description Parser
          </Typography>
          <Chip
            label={`${jobs.length} JD${jobs.length !== 1 ? 's' : ''}`}
            size="small"
            variant="outlined"
            sx={{ ml: 1 }}
          />
        </Stack>
        <IconButton onClick={onClose} size="small" sx={{ color: 'text.secondary' }}>
          <X className="w-5 h-5" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column', height: '75vh' }}>
        <Box display="flex" flex={1} sx={{ overflow: 'hidden' }}>
          {/* LEFT SIDEBAR */}
          <Paper
            elevation={0}
            sx={{
              width: 280,
              borderRight: '1px solid',
              borderColor: 'divider',
              display: 'flex',
              flexDirection: 'column',
              bgcolor: 'background.paper',
            }}
          >
            {/* Sidebar Header */}
            <Box
              sx={{
                px: 2,
                py: 1.5,
                borderBottom: '1px solid',
                borderColor: 'divider',
                bgcolor: 'rgba(212,175,55,0.08)',
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 700,
                  fontSize: '0.7rem',
                  letterSpacing: '0.5px',
                  textTransform: 'uppercase',
                  color: 'text.secondary',
                }}
              >
                Job Descriptions
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.85rem', mt: 0.5 }}>
                {jobs.length} Total
              </Typography>
            </Box>

            {/* Job List */}
            <List sx={{ flex: 1, overflow: 'auto', p: 0 }}>
              {jobs.map((job) => (
                <ListItemButton
                  key={job.id}
                  selected={job.id === activeId}
                  onClick={() => setActiveId(job.id)}
                  sx={{
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    py: 1.5,
                    '&.Mui-selected': {
                      bgcolor: 'primary.50',
                      borderLeftWidth: '4px',
                      borderLeftColor: 'primary.main',
                      borderLeftStyle: 'solid',
                    },
                  }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      sx={{
                        fontWeight: job.id === activeId ? 600 : 500,
                        fontSize: '0.85rem',
                        mb: 0.5,
                      }}
                    >
                      {job.title}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                      {job.status === 'parsed' && (
                        <>
                          <CheckCircle className="w-3.5 h-3.5" style={{ color: '#10b981' }} />
                          <Typography variant="caption" sx={{ fontSize: '0.7rem', color: '#10b981' }}>
                            Parsed
                          </Typography>
                        </>
                      )}
                      {job.status === 'error' && (
                        <>
                          <AlertCircle className="w-3.5 h-3.5" style={{ color: '#ef4444' }} />
                          <Typography variant="caption" sx={{ fontSize: '0.7rem', color: '#ef4444' }}>
                            Error
                          </Typography>
                        </>
                      )}
                      {job.status === 'idle' && (
                        <>
                          <Clock className="w-3.5 h-3.5" style={{ color: '#9ca3af' }} />
                          <Typography variant="caption" sx={{ fontSize: '0.7rem', color: '#9ca3af' }}>
                            Not parsed
                          </Typography>
                        </>
                      )}
                    </Box>
                  </Box>
                </ListItemButton>
              ))}
            </List>

            <Divider />

            {/* Add Button */}
            <Tooltip title="Add new job description" placement="top">
              <Button
                fullWidth
                onClick={addJob}
                startIcon={<Plus className="w-4 h-4" />}
                sx={{
                  textTransform: 'none',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  py: 1.5,
                  borderRadius: 0,
                  color: 'primary.main',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                Add JD
              </Button>
            </Tooltip>
          </Paper>

          {/* RIGHT PANEL */}
          <Box flex={1} sx={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <Stack spacing={2} sx={{ height: '100%', p: 2, overflow: 'auto' }}>
              {/* Header */}
              <Box>
                <Typography
                  sx={{
                    fontWeight: 700,
                    fontSize: '1.1rem',
                    color: 'text.primary',
                    mb: 0.5,
                  }}
                >
                  {activeJob.title}
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>
                  {activeJob.text.length} characters
                </Typography>
              </Box>

              {/* Input */}
              <TextField
                multiline
                minRows={8}
                maxRows={12}
                fullWidth
                placeholder="Paste job description text here..."
                value={activeJob.text}
                onChange={(e) =>
                  updateJob(activeJob.id, {
                    text: e.target.value,
                    status: 'idle',
                  })
                }
                sx={{
                  '& .MuiOutlinedInput-root': {
                    fontSize: '0.85rem',
                    fontFamily: 'monospace',
                  },
                }}
              />

              {/* Action Buttons */}
              <Stack direction="row" spacing={1.5}>
                <Button
                  variant="contained"
                  onClick={parseCurrent}
                  disabled={!activeJob.text.trim()}
                  startIcon={<Zap className="w-4 h-4" />}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                  }}
                >
                  Parse Current
                </Button>

                <Button
                  variant="outlined"
                  onClick={parseAll}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    borderColor: 'divider',
                  }}
                >
                  Parse All ({jobs.length})
                </Button>
              </Stack>

              {/* Parsed Result */}
              {activeJob.parsed && (
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                    <Typography
                      sx={{
                        fontWeight: 600,
                        fontSize: '0.85rem',
                        color: 'text.secondary',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                      }}
                    >
                      Parsed Result
                    </Typography>
                    {onParsedData && (
                      <Button
                        size="small"
                        variant="contained"
                        onClick={() => {
                          onParsedData(activeJob.parsed!, activeJob.text)
                          onClose()
                        }}
                        sx={{
                          textTransform: 'none',
                          fontWeight: 600,
                          fontSize: '0.75rem',
                          ml: 'auto'
                        }}
                      >
                        Fill Form
                      </Button>
                    )}
                  </Stack>
                  <Paper
                    variant="outlined"
                    sx={{
                      flex: 1,
                      bgcolor: 'rgba(212,175,55,0.05)',
                      border: '1px solid',
                      borderColor: 'rgba(212,175,55,0.2)',
                      overflow: 'auto',
                      p: 1.5,
                      fontFamily: 'monospace',
                      fontSize: '0.75rem',
                      lineHeight: 1.6,
                      borderRadius: '8px',
                      color: 'text.primary',
                    }}
                  >
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {JSON.stringify(activeJob.parsed, null, 2)}
                    </pre>
                  </Paper>
                </Box>
              )}

              {/* Empty State */}
              {!activeJob.parsed && activeJob.status === 'idle' && (
                <Paper
                  variant="outlined"
                  sx={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: 'rgba(212,175,55,0.05)',
                    border: '2px dashed',
                    borderColor: 'rgba(212,175,55,0.2)',
                    borderRadius: '8px',
                    color: 'text.secondary',
                    minHeight: '120px',
                  }}
                >
                  <Typography variant="body2" sx={{ fontSize: '0.85rem', textAlign: 'center' }}>
                    No parsing result yet.
                    <br />
                    Enter text and click "Parse Current" to see results.
                  </Typography>
                </Paper>
              )}

              {/* Error State */}
              {activeJob.status === 'error' && (
                <Paper
                  variant="outlined"
                  sx={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: '#fef2f2',
                    border: '1px solid',
                    borderColor: '#fecaca',
                    borderRadius: '8px',
                    color: '#991b1b',
                    minHeight: '120px',
                  }}
                >
                  <Stack alignItems="center" spacing={1}>
                    <AlertCircle className="w-6 h-6" />
                    <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>
                      Parsing failed. Please check the text and try again.
                    </Typography>
                  </Stack>
                </Paper>
              )}
            </Stack>
          </Box>
        </Box>
      </DialogContent>

      <DialogActions sx={{ borderTop: '1px solid', borderColor: 'divider', p: 1.5 }}>
        <Button onClick={onClose} sx={{ textTransform: 'none', fontWeight: 600 }}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  )
}
