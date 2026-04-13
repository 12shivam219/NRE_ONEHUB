import React, { useEffect, useState, useCallback } from 'react';
import { DataGrid, GridColDef, GridPaginationModel, GridRenderCellParams } from '@mui/x-data-grid';
import { supabase } from '../../lib/supabase';
import { Reply, Trash2, Check, AlertCircle, Mail, Search, Calendar, X } from 'lucide-react';
import { getRequirementEmailsPaginated, confirmEmailMatch, deleteEmailRecord } from '../../lib/api/requirementEmails';
import { BulkEmailComposer } from './BulkEmailComposer';
import { IconButton, Tooltip, Chip, CircularProgress, Box, TextField } from '@mui/material';

interface RequirementEmail {
  id: string;
  requirement_id: string;
  recipient_email: string;
  recipient_name?: string;
  sent_via: 'loster_app' | 'gmail_synced' | 'bulk_email';
  subject: string;
  sent_date: string;
  status: 'sent' | 'failed' | 'pending' | 'bounced';
  match_confidence?: number;
  needs_user_confirmation?: boolean;
  body_preview?: string;
}

interface EmailHistoryPanelProps {
  requirementId: string;
}

const EmailHistoryPanel: React.FC<EmailHistoryPanelProps> = ({ requirementId }) => {
  const [rows, setRows] = useState<RequirementEmail[]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: 10,
  });

  const [replyEmail, setReplyEmail] = useState<RequirementEmail | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  
  // Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });

  const fetchEmails = useCallback(async () => {
    setLoading(true);
    try {
      const { emails } = await getRequirementEmailsPaginated(
        requirementId,
        paginationModel.page,
        paginationModel.pageSize
      );
      
      // Client-side filtering
      let filtered = emails;
      
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        filtered = filtered.filter(email => 
          email.recipient_email.toLowerCase().includes(search) ||
          email.recipient_name?.toLowerCase().includes(search) ||
          email.subject.toLowerCase().includes(search)
        );
      }
      
      if (statusFilter) {
        filtered = filtered.filter(email => email.status === statusFilter);
      }
      
      if (sourceFilter) {
        filtered = filtered.filter(email => email.sent_via === sourceFilter);
      }
      
      if (dateRange.start) {
        const startDate = new Date(dateRange.start);
        filtered = filtered.filter(email => new Date(email.sent_date) >= startDate);
      }
      
      if (dateRange.end) {
        const endDate = new Date(dateRange.end);
        endDate.setHours(23, 59, 59, 999);
        filtered = filtered.filter(email => new Date(email.sent_date) <= endDate);
      }
      
      setRows(filtered);
      setRowCount(filtered.length);
    } catch (error) {
      console.error('Failed to fetch emails:', error);
    } finally {
      setLoading(false);
    }
  }, [requirementId, paginationModel, searchTerm, statusFilter, sourceFilter, dateRange]);

  useEffect(() => {
    fetchEmails();
    const subscription = supabase
      .channel(`requirement_emails_${requirementId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'requirement_emails', filter: `requirement_id=eq.${requirementId}` },
        () => fetchEmails()
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchEmails, requirementId]);

  const handleConfirm = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); // Prevent row click
    try {
      setActionLoading(id);
      await confirmEmailMatch(id, 100);
      await fetchEmails(); 
    } catch (error) {
      console.error('Confirm failed', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleUnlink = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); // Prevent row click
    if (!window.confirm('Are you sure you want to remove this email from the history?')) return;
    try {
      setActionLoading(id);
      await deleteEmailRecord(id);
      await fetchEmails();
    } catch (error) {
      console.error('Unlink failed', error);
    } finally {
      setActionLoading(null);
    }
  };

  const columns: GridColDef[] = [
    { 
      field: 'status', 
      headerName: 'Status', 
      width: 100,
      renderCell: (params: GridRenderCellParams) => {
        const status = params.value as string;
        const color = status === 'sent' ? 'success' : status === 'failed' ? 'error' : 'warning';
        return (
          <div className="flex items-center h-full">
            <Chip 
                label={status} 
                color={color} 
                size="small" 
                variant="outlined" 
                sx={{ textTransform: 'capitalize', height: '24px', fontSize: '0.75rem' }}
            />
          </div>
        );
      }
    },
    {
      field: 'sent_via',
      headerName: 'Source',
      width: 120,
      renderCell: (params: GridRenderCellParams) => {
        const source = params.value as string;
        const colors: Record<string, string> = {
          'loster_app': '#3b82f6',
          'gmail_synced': '#ea580c',
          'bulk_email': '#8b5cf6',
        };
        const labels: Record<string, string> = {
          'loster_app': 'App',
          'gmail_synced': 'Gmail Sync',
          'bulk_email': 'Bulk',
        };
        return (
          <div className="flex items-center h-full">
            <Chip
              label={labels[source] || source}
              size="small"
              variant="outlined"
              sx={{
                height: '24px',
                fontSize: '0.75rem',
                borderColor: colors[source],
                color: colors[source],
                backgroundColor: `${colors[source]}10`,
              }}
            />
          </div>
        );
      }
    },
    { 
      field: 'recipient_email', 
      headerName: 'Recipient', 
      width: 220,
      renderCell: (params) => (
        <div className="flex flex-col justify-center h-full leading-tight">
          <span className="font-medium text-sm text-gray-900 truncate">{params.row.recipient_name || params.value}</span>
          {params.row.recipient_name && (
            <span className="text-xs text-gray-500 truncate">{params.value}</span>
          )}
        </div>
      )
    },
    { 
      field: 'subject', 
      headerName: 'Subject', 
      flex: 1,
      minWidth: 250,
      renderCell: (params) => (
        <div className="flex items-center gap-2 h-full w-full">
          {params.row.needs_user_confirmation && (
            <Tooltip title="Needs Review: System is not 100% confident">
              <AlertCircle className="w-4 h-4 text-amber-500 animate-pulse flex-shrink-0" />
            </Tooltip>
          )}
          <span className="truncate text-gray-700">{params.value}</span>
        </div>
      )
    },
    { 
      field: 'sent_date', 
      headerName: 'Date', 
      width: 160,
      valueFormatter: (value) => new Date(value).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 140, 
      sortable: false,
      filterable: false,
      align: 'right',
      headerAlign: 'right',
      renderCell: (params) => (
        <div className="flex items-center justify-end gap-1 h-full w-full pr-2">
           {/* 1. Reply Button - ALWAYS Visible */}
          <Tooltip title="Reply">
            <IconButton 
              size="small" 
              onClick={(e) => {
                e.stopPropagation();
                setReplyEmail(params.row);
              }}
              sx={{ color: '#2563eb', '&:hover': { backgroundColor: '#eff6ff' } }}
            >
              <Reply className="w-4 h-4" />
            </IconButton>
          </Tooltip>
          
          {/* 2. Feedback Loop - Visible ONLY if needs_user_confirmation is TRUE */}
          {params.row.needs_user_confirmation && (
            <Tooltip title="Confirm Match">
              <IconButton 
                size="small" 
                onClick={(e) => handleConfirm(e, params.row.id)}
                disabled={actionLoading === params.row.id}
                sx={{ color: '#16a34a', '&:hover': { backgroundColor: '#f0fdf4' } }}
              >
                {actionLoading === params.row.id ? <CircularProgress size={16} /> : <Check className="w-4 h-4" />}
              </IconButton>
            </Tooltip>
          )}

          {/* 3. Unlink/Delete - Always Visible */}
          <Tooltip title="Unlink / Delete">
            <IconButton 
              size="small" 
              onClick={(e) => handleUnlink(e, params.row.id)}
              disabled={actionLoading === params.row.id}
              sx={{ color: '#dc2626', '&:hover': { backgroundColor: '#fef2f2' } }}
            >
               {actionLoading === params.row.id ? <CircularProgress size={16} /> : <Trash2 className="w-4 h-4" />}
            </IconButton>
          </Tooltip>
        </div>
      )
    }
  ];

  return (
    <Box sx={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column', bgcolor: 'background.paper', borderRadius: 1, boxShadow: 1, border: '1px solid #e5e7eb' }}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <Mail className="w-4 h-4" />
          Email History
        </h3>
        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full border border-gray-200">
          {rowCount} Records
        </span>
      </div>

      {/* Filter Bar */}
      <div className="p-3 border-b border-gray-200 bg-white space-y-3">
        {/* Search and Date Range Row */}
        <div className="flex gap-3 items-end">
          <div className="flex-1 relative">
            <div className="absolute left-3 top-2.5 text-gray-400">
              <Search className="w-4 h-4" />
            </div>
            <TextField
              placeholder="Search by name, email, or subject..."
              size="small"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPaginationModel({ ...paginationModel, page: 0 });
              }}
              sx={{
                width: '100%',
                '& .MuiInputBase-root': {
                  paddingLeft: '32px',
                  fontSize: '0.875rem',
                  backgroundColor: '#f9fafb',
                },
              }}
              variant="outlined"
            />
          </div>

          <div className="flex gap-2">
            <div className="relative">
              <div className="absolute left-3 top-2 text-gray-400 pointer-events-none">
                <Calendar className="w-4 h-4" />
              </div>
              <TextField
                type="date"
                label="From"
                size="small"
                value={dateRange.start}
                onChange={(e) => {
                  setDateRange({ ...dateRange, start: e.target.value });
                  setPaginationModel({ ...paginationModel, page: 0 });
                }}
                InputLabelProps={{ shrink: true }}
                sx={{
                  width: '140px',
                  '& .MuiInputBase-root': {
                    fontSize: '0.875rem',
                    backgroundColor: '#f9fafb',
                  },
                }}
                variant="outlined"
              />
            </div>

            <div className="relative">
              <div className="absolute left-3 top-2 text-gray-400 pointer-events-none">
                <Calendar className="w-4 h-4" />
              </div>
              <TextField
                type="date"
                label="To"
                size="small"
                value={dateRange.end}
                onChange={(e) => {
                  setDateRange({ ...dateRange, end: e.target.value });
                  setPaginationModel({ ...paginationModel, page: 0 });
                }}
                InputLabelProps={{ shrink: true }}
                sx={{
                  width: '140px',
                  '& .MuiInputBase-root': {
                    fontSize: '0.875rem',
                    backgroundColor: '#f9fafb',
                  },
                }}
                variant="outlined"
              />
            </div>
          </div>
        </div>

        {/* Quick Filter Chips Row */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs font-medium text-gray-600">Filter:</span>

          {/* Status Filters */}
          <Tooltip title="Show only sent emails">
            <Chip
              label="Sent"
              size="small"
              onClick={() => {
                setStatusFilter(statusFilter === 'sent' ? null : 'sent');
                setPaginationModel({ ...paginationModel, page: 0 });
              }}
              variant={statusFilter === 'sent' ? 'filled' : 'outlined'}
              color={statusFilter === 'sent' ? 'success' : 'default'}
              sx={{ height: '28px', fontSize: '0.75rem' }}
            />
          </Tooltip>

          <Tooltip title="Show only failed emails">
            <Chip
              label="Failed"
              size="small"
              onClick={() => {
                setStatusFilter(statusFilter === 'failed' ? null : 'failed');
                setPaginationModel({ ...paginationModel, page: 0 });
              }}
              variant={statusFilter === 'failed' ? 'filled' : 'outlined'}
              color={statusFilter === 'failed' ? 'error' : 'default'}
              sx={{ height: '28px', fontSize: '0.75rem' }}
            />
          </Tooltip>

          <Tooltip title="Show only pending emails">
            <Chip
              label="Pending"
              size="small"
              onClick={() => {
                setStatusFilter(statusFilter === 'pending' ? null : 'pending');
                setPaginationModel({ ...paginationModel, page: 0 });
              }}
              variant={statusFilter === 'pending' ? 'filled' : 'outlined'}
              color={statusFilter === 'pending' ? 'warning' : 'default'}
              sx={{ height: '28px', fontSize: '0.75rem' }}
            />
          </Tooltip>

          {/* Source Filters */}
          <div className="w-px h-6 bg-gray-200"></div>

          <Tooltip title="Show emails sent from app">
            <Chip
              label="App"
              size="small"
              onClick={() => {
                setSourceFilter(sourceFilter === 'loster_app' ? null : 'loster_app');
                setPaginationModel({ ...paginationModel, page: 0 });
              }}
              variant={sourceFilter === 'loster_app' ? 'filled' : 'outlined'}
              sx={{
                height: '28px',
                fontSize: '0.75rem',
                borderColor: sourceFilter === 'loster_app' ? '#3b82f6' : undefined,
                backgroundColor: sourceFilter === 'loster_app' ? '#3b82f6' : undefined,
                color: sourceFilter === 'loster_app' ? 'white' : '#3b82f6',
              }}
            />
          </Tooltip>

          <Tooltip title="Show emails synced from Gmail">
            <Chip
              label="Gmail Sync"
              size="small"
              onClick={() => {
                setSourceFilter(sourceFilter === 'gmail_synced' ? null : 'gmail_synced');
                setPaginationModel({ ...paginationModel, page: 0 });
              }}
              variant={sourceFilter === 'gmail_synced' ? 'filled' : 'outlined'}
              sx={{
                height: '28px',
                fontSize: '0.75rem',
                borderColor: sourceFilter === 'gmail_synced' ? '#ea580c' : undefined,
                backgroundColor: sourceFilter === 'gmail_synced' ? '#ea580c' : undefined,
                color: sourceFilter === 'gmail_synced' ? 'white' : '#ea580c',
              }}
            />
          </Tooltip>

          <Tooltip title="Show emails from bulk sender">
            <Chip
              label="Bulk"
              size="small"
              onClick={() => {
                setSourceFilter(sourceFilter === 'bulk_email' ? null : 'bulk_email');
                setPaginationModel({ ...paginationModel, page: 0 });
              }}
              variant={sourceFilter === 'bulk_email' ? 'filled' : 'outlined'}
              sx={{
                height: '28px',
                fontSize: '0.75rem',
                borderColor: sourceFilter === 'bulk_email' ? '#8b5cf6' : undefined,
                backgroundColor: sourceFilter === 'bulk_email' ? '#8b5cf6' : undefined,
                color: sourceFilter === 'bulk_email' ? 'white' : '#8b5cf6',
              }}
            />
          </Tooltip>

          {/* Clear All Filters Button */}
          {(searchTerm || statusFilter || sourceFilter || dateRange.start || dateRange.end) && (
            <Tooltip title="Clear all filters">
              <Chip
                icon={<X className="w-3 h-3" />}
                label="Clear"
                size="small"
                onClick={() => {
                  setSearchTerm('');
                  setStatusFilter(null);
                  setSourceFilter(null);
                  setDateRange({ start: '', end: '' });
                  setPaginationModel({ ...paginationModel, page: 0 });
                }}
                variant="outlined"
                sx={{
                  height: '28px',
                  fontSize: '0.75rem',
                  color: '#dc2626',
                  borderColor: '#dc2626',
                  '&:hover': {
                    backgroundColor: '#fef2f2',
                  },
                }}
              />
            </Tooltip>
          )}
        </div>
      </div>

      {/* DataGrid */}
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        <DataGrid
          rows={rows}
          columns={columns}
          loading={loading}
          pageSizeOptions={[10, 25, 50]}
          paginationModel={paginationModel}
          paginationMode="client"
          onPaginationModelChange={setPaginationModel}
          disableRowSelectionOnClick
          rowHeight={52}
          sx={{
            border: 'none',
            '& .MuiDataGrid-columnHeaders': {
              backgroundColor: '#f9fafb',
              color: '#374151',
              fontSize: '0.75rem',
              textTransform: 'uppercase',
              fontWeight: 600,
            },
            '& .MuiDataGrid-cell': {
              borderBottom: '1px solid #f3f4f6',
            },
            '& .MuiDataGrid-footerContainer': {
              borderTop: '1px solid #e5e7eb',
            }
          }}
        />
      </Box>
      {replyEmail && (
        <BulkEmailComposer
          requirementId={requirementId}
          onClose={() => setReplyEmail(null)}
          initialRecipients={[{ 
            email: replyEmail.recipient_email, 
            name: replyEmail.recipient_name 
          }]}
          initialSubject={`Re: ${replyEmail.subject}`}
        />
      )}
    </Box>
  );
};

export default EmailHistoryPanel;