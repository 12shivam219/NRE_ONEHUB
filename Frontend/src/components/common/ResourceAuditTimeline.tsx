import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Clock, User, Trash2, Plus, Edit3 } from 'lucide-react';
import { getResourceActivityLogs } from '../../lib/api/audit';
import { getUserName } from '../../lib/api/requirements';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Collapse from '@mui/material/Collapse';
import Chip from '@mui/material/Chip';

type LogEntry = {
  id: string;
  action: string;
  created_at: string;
  user_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
};

interface ResourceAuditTimelineProps {
  resourceType: string;
  resourceId: string;
  title?: string;
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
    
    return date.toLocaleDateString();
  } catch {
    return value;
  }
};

const getActionIcon = (action: string) => {
  if (action.includes('delete')) return <Trash2 size={16} />;
  if (action.includes('create')) return <Plus size={16} />;
  return <Edit3 size={16} />;
};

const getActionColor = (action: string): 'success' | 'error' | 'warning' | 'info' => {
  if (action.includes('delete')) return 'error';
  if (action.includes('create')) return 'success';
  return 'info';
};

const formatFieldName = (field: string): string => {
  return field
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/\b\w/g, char => char.toUpperCase())
    .trim();
};

const parseChanges = (details: Record<string, unknown> | null): { [key: string]: any } | null => {
  if (!details || !details.changes) return null;
  if (typeof details.changes !== 'object') return null;
  return details.changes as Record<string, any>;
};

const ChangeItem = ({ field, change }: { field: string; change: any }) => {
  const oldValue = change?.old ?? change?.before ?? '-';
  const newValue = change?.new ?? change?.after ?? '-';
  
  const isAdded = oldValue === '-' || oldValue === null || oldValue === undefined;
  const isRemoved = newValue === '-' || newValue === null || newValue === undefined;

  const formatValue = (val: any) => {
    if (val === null || val === undefined) return '-';
    if (typeof val === 'object') return JSON.stringify(val);
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    if (typeof val === 'string' && val.length > 50) return val.substring(0, 50) + '...';
    return String(val);
  };

  return (
    <Box sx={{ py: 1.5, px: 2, borderLeft: '3px solid transparent', borderLeftColor: isAdded ? '#10B981' : isRemoved ? '#EF4444' : '#F59E0B' }}>
      <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: '#6B7280', mb: 0.75 }}>
        {formatFieldName(field)}
      </Typography>
      
      {isAdded ? (
        <Stack direction="row" spacing={1} alignItems="center">
          <Chip 
            label="Added" 
            size="small" 
            sx={{ backgroundColor: '#DCFCE7', color: '#065F46', fontWeight: 600 }}
          />
          <Typography sx={{ fontSize: '0.9rem', color: '#059669', fontWeight: 500 }}>
            {formatValue(newValue)}
          </Typography>
        </Stack>
      ) : isRemoved ? (
        <Stack direction="row" spacing={1} alignItems="center">
          <Chip 
            label="Removed" 
            size="small" 
            sx={{ backgroundColor: '#FEE2E2', color: '#7F1D1D', fontWeight: 600 }}
          />
          <Typography sx={{ fontSize: '0.9rem', color: '#DC2626', textDecoration: 'line-through' }}>
            {formatValue(oldValue)}
          </Typography>
        </Stack>
      ) : (
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexWrap: 'wrap' }}>
          <Typography sx={{ fontSize: '0.9rem', color: '#6B7280' }}>
            {formatValue(oldValue)}
          </Typography>
          <Typography sx={{ fontSize: '0.85rem', color: '#9CA3AF', fontWeight: 600 }}>→</Typography>
          <Typography sx={{ fontSize: '0.9rem', color: '#1F2937', fontWeight: 500 }}>
            {formatValue(newValue)}
          </Typography>
        </Stack>
      )}
    </Box>
  );
};

const ChangeGroup = ({ category, changes }: { category: string; changes: Record<string, any> }) => {
  const [expanded, setExpanded] = useState(false);
  const changeCount = Object.keys(changes).length;

  return (
    <Box>
      <Button
        fullWidth
        onClick={() => setExpanded(!expanded)}
        sx={{
          py: 1,
          px: 2,
          backgroundColor: '#F3F4F6',
          border: 'none',
          justifyContent: 'space-between',
          textTransform: 'none',
          '&:hover': { backgroundColor: '#E5E7EB' },
        }}
      >
        <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, color: '#374151' }}>
          {formatFieldName(category)}
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          <Chip label={changeCount} size="small" variant="outlined" />
          <ChevronDown 
            size={16} 
            style={{ 
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s',
              color: '#6B7280'
            }} 
          />
        </Stack>
      </Button>
      <Collapse in={expanded}>
        <Stack spacing={0}>
          {Object.entries(changes).map(([field, change]) => (
            <ChangeItem key={field} field={field} change={change} />
          ))}
        </Stack>
      </Collapse>
    </Box>
  );
};

export const ResourceAuditTimeline = ({ resourceId, resourceType }: ResourceAuditTimelineProps) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userNames, setUserNames] = useState<Map<string, { name: string; email?: string }>>(new Map());

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const result = await getResourceActivityLogs({ resourceId, resourceType, limit: 25 });
      if (!result.success || !result.logs) {
        setError(result.error || 'Unable to load audit history');
        setLoading(false);
        return;
      }
      setLogs(result.logs as LogEntry[]);
      setError(null);
      setLoading(false);
    };
    if (resourceId) {
      load();
    }
  }, [resourceId, resourceType]);

  const actorIds = useMemo(
    () => Array.from(new Set(logs.map(log => log.user_id).filter(Boolean))) as string[],
    [logs]
  );

  useEffect(() => {
    const missingIds = actorIds.filter(id => !userNames.has(id));
    
    if (missingIds.length === 0) return;
    
    const fetchActors = async () => {
      const next = new Map(userNames);
      for (const id of missingIds) {
        const user = await getUserName(id);
        next.set(id, { name: user?.full_name || 'Unknown', email: user?.email || undefined });
      }
      setUserNames(next);
    };
    fetchActors();
  }, [actorIds, userNames]);

  if (loading) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography sx={{ fontSize: '0.9rem', color: '#6B7280' }}>
          Loading activity timeline…
        </Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3, backgroundColor: '#FEF3C7', borderRadius: 1, border: '1px solid #FCD34D' }}>
        <Typography sx={{ fontSize: '0.9rem', color: '#92400E' }}>
          ⚠️ {error}
        </Typography>
      </Box>
    );
  }

  if (!logs.length) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Box sx={{ display: 'inline-flex', mb: 1.5, color: '#D1D5DB' }}>
          <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 12h-4m-2 8H4m16-4v-4m0 0H6m12 0V8" />
          </svg>
        </Box>
        <Typography sx={{ fontSize: '0.95rem', color: '#9CA3AF', fontWeight: 500 }}>
          No activity yet
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      {/* Timeline */}
      <Stack spacing={2}>
        {logs.map((log, index) => {
          const actor = log.user_id ? userNames.get(log.user_id) : null;
          const description = log.details && typeof log.details === 'object' && 'description' in log.details
            ? ((log.details as Record<string, unknown>).description as string | null)
            : null;
          const changes = parseChanges(log.details);
          const changesByCategory: { [key: string]: Record<string, any> } = {};

          if (changes) {
            Object.entries(changes).forEach(([field, change]) => {
              const category = field.includes('project') ? 'Projects' : field.includes('skill') ? 'Skills' : 'Other';
              if (!changesByCategory[category]) {
                changesByCategory[category] = {};
              }
              changesByCategory[category][field] = change;
            });
          }

          return (
            <Card
              key={log.id}
              sx={{
                position: 'relative',
                border: '1px solid #E5E7EB',
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  left: '-16px',
                  top: '24px',
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  backgroundColor: getActionColor(log.action) === 'error' ? '#EF4444' : getActionColor(log.action) === 'success' ? '#10B981' : '#3B82F6',
                  border: '3px solid #FFFFFF',
                  boxShadow: '0 0 0 3px #F3F4F6',
                },
                ...(index === 0 && {
                  '&::after': {
                    content: '""',
                    position: 'absolute',
                    left: '-13px',
                    top: '36px',
                    width: '6px',
                    height: index === logs.length - 1 ? '0px' : '60px',
                    backgroundColor: '#E5E7EB',
                  },
                }),
              }}
            >
              <Box sx={{ p: 2.5 }}>
                {/* Header */}
                <Stack direction="row" spacing={1.5} alignItems="flex-start" sx={{ mb: 2 }}>
                  <Box sx={{ p: 0.75, backgroundColor: '#F0F9FF', borderRadius: 1, mt: 0.25 }}>
                    {getActionIcon(log.action)}
                  </Box>
                  <Stack spacing={0.5} flex={1}>
                    <Typography sx={{ fontSize: '0.95rem', fontWeight: 700, color: '#1F2937' }}>
                      {log.action.replace(/_/g, ' ').charAt(0).toUpperCase() + log.action.replace(/_/g, ' ').slice(1)}
                    </Typography>
                    {description && (
                      <Typography sx={{ fontSize: '0.9rem', color: '#4B5563', fontWeight: 500 }}>
                        {description}
                      </Typography>
                    )}
                  </Stack>
                </Stack>

                {/* Metadata */}
                <Stack direction="row" spacing={2} sx={{ mb: 2.5, pb: 2.5, borderBottom: '1px solid #F3F4F6' }}>
                  {actor && (
                    <Stack direction="row" spacing={0.75} alignItems="center">
                      <User size={14} style={{ color: '#9CA3AF' }} />
                      <Stack spacing={0} flex={1} minWidth={0}>
                        <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: '#6B7280' }}>
                          <Typography component="span" sx={{ fontSize: 'inherit', color: '#1F2937', fontWeight: 700 }}>
                            {actor.name}
                          </Typography>
                        </Typography>
                        {actor.email && (
                          <Typography sx={{ fontSize: '0.75rem', color: '#9CA3AF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {actor.email}
                          </Typography>
                        )}
                      </Stack>
                    </Stack>
                  )}
                  <Stack direction="row" spacing={0.75} alignItems="center" sx={{ ml: 'auto' }}>
                    <Clock size={14} style={{ color: '#9CA3AF' }} />
                    <Typography sx={{ fontSize: '0.8rem', color: '#6B7280', fontWeight: 500 }}>
                      {formatDateTime(log.created_at)}
                    </Typography>
                  </Stack>
                </Stack>

                {/* Changes */}
                {Object.keys(changesByCategory).length > 0 ? (
                  <Stack spacing={1}>
                    {Object.entries(changesByCategory).map(([category, changes]) => (
                      <ChangeGroup key={category} category={category} changes={changes} />
                    ))}
                  </Stack>
                ) : changes === null ? (
                  <Typography sx={{ fontSize: '0.85rem', color: '#9CA3AF', fontStyle: 'italic' }}>
                    No changes recorded
                  </Typography>
                ) : null}
              </Box>
            </Card>
          );
        })}
      </Stack>
    </Box>
  );
};

