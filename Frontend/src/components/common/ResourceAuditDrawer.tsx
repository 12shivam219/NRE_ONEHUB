import { useEffect, useMemo, useState } from 'react';
import {
  Drawer,
  Box,
  Stack,
  Typography,
  TextField,
  IconButton,
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import { Clock, User, X, Filter } from 'lucide-react';
import { getResourceActivityLogs } from '../../lib/api/audit';
import { getUserName } from '../../lib/api/requirements';

interface LogEntry {
  id: string;
  action: string;
  created_at: string;
  user_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
}

interface ResourceAuditDrawerProps {
  open: boolean;
  onClose: () => void;
  resourceType: string;
  resourceId: string;
  resourceName?: string;
}

const formatDateTime = (value: string) => {
  try {
    const date = new Date(value);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
};

const getActionColor = (action: string): 'success' | 'error' | 'warning' | 'info' => {
  if (action.includes('delete')) return 'error';
  if (action.includes('create')) return 'success';
  if (action.includes('update')) return 'warning';
  return 'info';
};

const getActionIcon = (action: string) => {
  if (action.includes('delete')) return '🗑️';
  if (action.includes('create')) return '➕';
  if (action.includes('update')) return '✏️';
  return '📝';
};

type DescriptionRow = {
  field: string;
  from: string;
  to: string;
};

const formatDescriptionCell = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === 'empty') return '(empty)';
  return trimmed;
};

const parseDescriptionRows = (description: string): DescriptionRow[] => {
  if (!description.trim()) return [];

  const rows: DescriptionRow[] = [];
  const pattern = /([a-zA-Z0-9_]+):\s*(.*?)\s*→\s*(.*?)(?=;\s*[a-zA-Z0-9_]+:\s*.*?→|$)/g;
  let match = pattern.exec(description);

  while (match) {
    const [, field, fromValue, toValue] = match;
    rows.push({
      field: field.replace(/_/g, ' '),
      from: formatDescriptionCell(fromValue),
      to: formatDescriptionCell(toValue),
    });
    match = pattern.exec(description);
  }

  return rows;
};

export const ResourceAuditDrawer = ({
  open,
  onClose,
  resourceType,
  resourceId,
  resourceName = 'Resource',
}: ResourceAuditDrawerProps) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [searchActionFilter, setSearchActionFilter] = useState('');
  const [userNames, setUserNames] = useState<Map<string, { name: string; email?: string }>>(
    new Map()
  );

  // Fetch audit logs
  useEffect(() => {
    if (!open) return;

    const loadLogs = async () => {
      try {
        setLoading(true);
        setError(null);
        console.log('[ResourceAuditDrawer] Loading logs for', resourceType, resourceId);
        
        const result = await getResourceActivityLogs({
          resourceType,
          resourceId,
          limit: 100,
        });

        console.log('[ResourceAuditDrawer] Result:', result);

        if (result.success && result.logs) {
          setLogs(result.logs as LogEntry[]);
          setSelectedLogId((result.logs as LogEntry[])[0]?.id || null);

          // Load user names
          const userIds = Array.from(
            new Set((result.logs as LogEntry[]).map((log) => log.user_id).filter(Boolean))
          ) as string[];

          const names = new Map<string, { name: string; email?: string }>();
          for (const userId of userIds) {
            const userName = await getUserName(userId);
            if (userName) {
              names.set(userId, { name: userName.full_name, email: userName.email });
            }
          }
          setUserNames(names);
        } else {
          setError(result.error || 'Failed to load audit logs');
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        console.error('[ResourceAuditDrawer] Exception:', errorMessage);
        setError(`Error loading audit logs: ${errorMessage}`);
      } finally {
        setLoading(false);
      }
    };

    loadLogs();
  }, [open, resourceType, resourceId]);

  // Filter logs
  const filteredLogs = useMemo(() => {
    if (!searchActionFilter) return logs;
    return logs.filter((log) =>
      log.action.toLowerCase().includes(searchActionFilter.toLowerCase())
    );
  }, [logs, searchActionFilter]);

  // Get selected log details
  const selectedLog = logs.find((log) => log.id === selectedLogId);
  const selectedDescription =
    selectedLog?.details &&
    typeof selectedLog.details === 'object' &&
    'description' in selectedLog.details &&
    typeof (selectedLog.details as Record<string, unknown>).description === 'string'
      ? ((selectedLog.details as Record<string, unknown>).description as string)
      : null;
  const descriptionRows = useMemo(
    () => (selectedDescription ? parseDescriptionRows(selectedDescription) : []),
    [selectedDescription]
  );

  const parseChanges = (
    details: Record<string, unknown> | null
  ): { [key: string]: any } | null => {
    if (!details || !details.changes) return null;
    if (typeof details.changes !== 'object') return null;
    return details.changes as Record<string, any>;
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      ModalProps={{
        sx: { zIndex: 9999 },
      }}
      slotProps={{
        root: {
          sx: { zIndex: 9999 },
        },
        backdrop: {
          sx: { 
            zIndex: 9998,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
          },
        },
      }}
      PaperProps={{
        sx: {
          width: { xs: '100%', sm: '90%', md: '900px' },
          maxWidth: '100%',
          zIndex: 9999,
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        },
      }}
    >
      <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <Box
          sx={{
            p: 2.5,
            backgroundColor: '#F9FAFB',
            borderBottom: '1px solid #E5E7EB',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Stack spacing={0.5}>
            <Typography sx={{ fontSize: '1.1rem', fontWeight: 700, color: '#111827' }}>
              📋 Audit Trail
            </Typography>
            <Typography sx={{ fontSize: '0.85rem', color: '#6B7280' }}>
              {resourceName}
            </Typography>
          </Stack>
          <IconButton onClick={onClose} size="small">
            <X size={20} />
          </IconButton>
        </Box>

        {/* Content */}
        <Box sx={{ display: 'grid', gridTemplateColumns: '350px 1fr', height: '100%', gap: 0 }}>
          {/* Left Panel - Timeline */}
          <Box
            sx={{
              borderRight: '1px solid #E5E7EB',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
              overflow: 'hidden',
              backgroundColor: '#FAFBFC',
            }}
          >
            {/* Filter */}
            <Box sx={{ p: 2, borderBottom: '1px solid #E5E7EB' }}>
              <TextField
                fullWidth
                size="small"
                placeholder="Filter by action..."
                value={searchActionFilter}
                onChange={(e) => setSearchActionFilter(e.target.value)}
                InputProps={{
                  startAdornment: <Filter size={16} style={{ marginRight: 8 }} />,
                }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    backgroundColor: 'white',
                    fontSize: '0.9rem',
                  },
                }}
              />
              <Typography sx={{ fontSize: '0.75rem', color: '#9CA3AF', mt: 1 }}>
                {filteredLogs.length} log{filteredLogs.length !== 1 ? 's' : ''}
              </Typography>
            </Box>

            {/* Timeline List */}
            <Box
              sx={{
                flex: 1,
                overflow: 'auto',
                '&::-webkit-scrollbar': { width: '6px' },
                '&::-webkit-scrollbar-track': { backgroundColor: '#F3F4F6' },
                '&::-webkit-scrollbar-thumb': {
                  backgroundColor: '#D1D5DB',
                  borderRadius: '3px',
                },
              }}
            >
              {loading ? (
                <Box sx={{ p: 3, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
                  <div style={{ 
                    width: '32px', 
                    height: '32px', 
                    border: '3px solid #E5E7EB',
                    borderTop: '3px solid #7C3AED',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite'
                  }} />
                  <Typography sx={{ color: '#9CA3AF', fontSize: '0.9rem' }}>Loading audit logs...</Typography>
                  <style>{`
                    @keyframes spin {
                      to { transform: rotate(360deg); }
                    }
                  `}</style>
                </Box>
              ) : error ? (
                <Box sx={{ p: 3, textAlign: 'center' }}>
                  <Typography sx={{ color: '#EF4444', fontSize: '0.9rem' }}>⚠️ Error loading logs</Typography>
                  <Typography sx={{ color: '#9CA3AF', fontSize: '0.85rem', mt: 1 }}>{error}</Typography>
                </Box>
              ) : filteredLogs.length === 0 ? (
                <Box sx={{ p: 3, textAlign: 'center' }}>
                  <Typography sx={{ color: '#9CA3AF', mb: 1 }}>📋 No audit logs found</Typography>
                  <Typography sx={{ color: '#D1D5DB', fontSize: '0.85rem' }}>
                    No changes recorded for this {resourceType}
                  </Typography>
                </Box>
              ) : (
                <Stack spacing={0}>
                  {filteredLogs.map((log) => (
                    <Box
                      key={log.id}
                      onClick={() => setSelectedLogId(log.id)}
                      sx={{
                        p: 1.5,
                        cursor: 'pointer',
                        backgroundColor:
                          selectedLogId === log.id ? '#DBEAFE' : 'transparent',
                        borderLeft: selectedLogId === log.id ? '4px solid #3B82F6' : '4px solid transparent',
                        transition: 'all 0.2s',
                        '&:hover': {
                          backgroundColor: '#F3F4F6',
                        },
                      }}
                    >
                      <Stack spacing={0.75}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography sx={{ fontSize: '1.2rem' }}>
                            {getActionIcon(log.action)}
                          </Typography>
                          <Chip
                            label={log.action.replace(/_/g, ' ')}
                            size="small"
                            color={getActionColor(log.action)}
                            variant="outlined"
                            sx={{ fontWeight: 600, fontSize: '0.75rem' }}
                          />
                        </Box>
                        <Typography sx={{ fontSize: '0.8rem', color: '#6B7280' }}>
                          {formatDateTime(log.created_at)}
                        </Typography>
                        {log.user_id && userNames.get(log.user_id) && (
                          <Typography sx={{ fontSize: '0.75rem', color: '#4B5563' }}>
                            {userNames.get(log.user_id)?.name}
                          </Typography>
                        )}
                      </Stack>
                    </Box>
                  ))}
                </Stack>
              )}
            </Box>
          </Box>

          {/* Right Panel - Details */}
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
              overflow: 'hidden',
              backgroundColor: 'white',
            }}
          >
            {selectedLog ? (
              <>
                {/* Details Header */}
                <Box sx={{ p: 2.5, borderBottom: '1px solid #E5E7EB' }}>
                  <Stack spacing={1.5}>
                    <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: '#111827' }}>
                      {selectedLog.action.replace(/_/g, ' ')}
                    </Typography>

                    {/* Metadata Grid */}
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                      {/* Timestamp */}
                      <Box>
                        <Stack spacing={0.5}>
                          <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>
                            <Clock size={12} style={{ display: 'inline', marginRight: 4 }} />
                            When
                          </Typography>
                          <Typography sx={{ fontSize: '0.9rem', color: '#111827' }}>
                            {new Date(selectedLog.created_at).toLocaleString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })}
                          </Typography>
                        </Stack>
                      </Box>

                      {/* User */}
                      <Box>
                        <Stack spacing={0.5}>
                          <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>
                            <User size={12} style={{ display: 'inline', marginRight: 4 }} />
                            By
                          </Typography>
                          <Typography sx={{ fontSize: '0.9rem', color: '#111827' }}>
                            {selectedLog.user_id && userNames.get(selectedLog.user_id)
                              ? `${userNames.get(selectedLog.user_id)?.name}`
                              : 'System'}
                          </Typography>
                          {selectedLog.user_id && userNames.get(selectedLog.user_id)?.email && (
                            <Typography sx={{ fontSize: '0.8rem', color: '#6B7280' }}>
                              {userNames.get(selectedLog.user_id)?.email}
                            </Typography>
                          )}
                        </Stack>
                      </Box>

                      {/* IP Address */}
                      {selectedLog.ip_address && (
                        <Box sx={{ gridColumn: '1 / -1' }}>
                          <Stack spacing={0.5}>
                            <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>
                              📍 IP Address
                            </Typography>
                            <Typography sx={{ fontSize: '0.9rem', color: '#111827', fontFamily: 'monospace' }}>
                              {selectedLog.ip_address}
                            </Typography>
                          </Stack>
                        </Box>
                      )}
                    </Box>
                  </Stack>
                </Box>

                {/* Description */}
                <Box sx={{ p: 2.5, borderBottom: '1px solid #E5E7EB', maxHeight: '42vh', overflow: 'auto' }}>
                  {selectedDescription ? (
                    <Box>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', mb: 1 }}>
                        Description
                      </Typography>
                      {descriptionRows.length > 0 ? (
                        <TableContainer
                          component={Paper}
                          variant="outlined"
                          sx={{ borderColor: '#E5E7EB', boxShadow: 'none' }}
                        >
                          <Table size="small">
                            <TableHead
                              sx={{
                                position: 'sticky',
                                top: 0,
                                zIndex: 1,
                                backgroundColor: '#F9FAFB',
                              }}
                            >
                              <TableRow sx={{ backgroundColor: '#F9FAFB' }}>
                                <TableCell sx={{ fontWeight: 700, color: '#374151' }}>Field</TableCell>
                                <TableCell sx={{ fontWeight: 700, color: '#374151' }}>From</TableCell>
                                <TableCell sx={{ fontWeight: 700, color: '#374151' }}>To</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {descriptionRows.map((row) => (
                                <TableRow key={`${row.field}-${row.from}-${row.to}`}>
                                  <TableCell
                                    sx={{
                                      fontSize: '0.85rem',
                                      fontWeight: 600,
                                      color: '#111827',
                                      textTransform: 'capitalize',
                                      verticalAlign: 'top',
                                      width: '22%',
                                    }}
                                  >
                                    {row.field}
                                  </TableCell>
                                  <TableCell
                                    sx={{
                                      fontSize: '0.85rem',
                                      color: '#B91C1C',
                                      backgroundColor: '#FEF2F2',
                                      whiteSpace: 'pre-wrap',
                                      wordBreak: 'break-word',
                                      verticalAlign: 'top',
                                      width: '39%',
                                    }}
                                  >
                                    {row.from}
                                  </TableCell>
                                  <TableCell
                                    sx={{
                                      fontSize: '0.85rem',
                                      color: '#065F46',
                                      backgroundColor: '#ECFDF5',
                                      whiteSpace: 'pre-wrap',
                                      wordBreak: 'break-word',
                                      verticalAlign: 'top',
                                      width: '39%',
                                    }}
                                  >
                                    {row.to}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </TableContainer>
                      ) : (
                        <Typography sx={{ fontSize: '0.95rem', color: '#374151', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {selectedDescription}
                        </Typography>
                      )}
                    </Box>
                  ) : null}
                </Box>

                {/* Changes */}
                <Box
                  sx={{
                    flex: 1,
                    overflow: 'auto',
                    p: 2.5,
                  }}
                >
                  {parseChanges(selectedLog.details) && Object.keys(parseChanges(selectedLog.details) || {}).length > 0 ? (
                    <Stack spacing={1.5}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>
                        Field Changes
                      </Typography>
                      {Object.entries(parseChanges(selectedLog.details) || {}).map(
                        ([field, change]) => (
                          <Paper
                            key={field}
                            sx={{
                              p: 1.5,
                              backgroundColor: '#F9FAFB',
                              border: '1px solid #E5E7EB',
                            }}
                          >
                            <Stack spacing={1}>
                              <Typography
                                sx={{
                                  fontSize: '0.85rem',
                                  fontWeight: 600,
                                  color: '#111827',
                                  textTransform: 'capitalize',
                                }}
                              >
                                {field.replace(/_/g, ' ')}
                              </Typography>
                              <Stack spacing={0.75} sx={{ pl: 1 }}>
                                <Box>
                                  <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#6B7280' }}>
                                    From:
                                  </Typography>
                                  <Typography
                                    sx={{
                                      fontSize: '0.85rem',
                                      color: '#EF4444',
                                      backgroundColor: '#FEE2E2',
                                      p: 1,
                                      borderRadius: 1,
                                      fontFamily: 'monospace',
                                      wordBreak: 'break-word',
                                    }}
                                  >
                                    {change?.from === null || change?.from === undefined
                                      ? '(empty)'
                                      : JSON.stringify(change?.from, null, 2)}
                                  </Typography>
                                </Box>
                                <Box>
                                  <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#6B7280' }}>
                                    To:
                                  </Typography>
                                  <Typography
                                    sx={{
                                      fontSize: '0.85rem',
                                      color: '#10B981',
                                      backgroundColor: '#ECFDF5',
                                      p: 1,
                                      borderRadius: 1,
                                      fontFamily: 'monospace',
                                      wordBreak: 'break-word',
                                    }}
                                  >
                                    {change?.to === null || change?.to === undefined
                                      ? '(empty)'
                                      : JSON.stringify(change?.to, null, 2)}
                                  </Typography>
                                </Box>
                              </Stack>
                            </Stack>
                          </Paper>
                        )
                      )}
                    </Stack>
                  ) : (
                    <Typography sx={{ color: '#9CA3AF', fontSize: '0.9rem' }}>
                      No field changes recorded
                    </Typography>
                  )}
                </Box>
              </>
            ) : (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  p: 3,
                  textAlign: 'center',
                }}
              >
                {loading || error ? (
                  <Typography sx={{ color: '#9CA3AF' }}>
                    {error ? 'Failed to load. Select a log entry to view details.' : 'Loading audit logs...'}
                  </Typography>
                ) : filteredLogs.length === 0 ? (
                  <Typography sx={{ color: '#9CA3AF' }}>
                    No audit logs for this {resourceType}
                  </Typography>
                ) : (
                  <Typography sx={{ color: '#9CA3AF' }}>
                    Select a log entry to view details
                  </Typography>
                )}
              </Box>
            )}
          </Box>
        </Box>
      </Box>
    </Drawer>
  );
};
