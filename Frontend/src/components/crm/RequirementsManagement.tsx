import { useState, useEffect, useCallback, useMemo, memo, lazy, useRef } from 'react';
import { mutate as globalMutate } from 'swr';
import { X, RefreshCw, Settings } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useOfflineCache } from '../../hooks/useOfflineCache';
import { useToast } from '../../contexts/ToastContext';
import { useSearchFilters } from '../../hooks/useSearchFilters';
import { useRequirementsPage } from '../../hooks/useRequirementsPage';
import { deleteRequirement, type RequirementWithLogs } from '../../lib/api/requirements';
import type { Database, RequirementStatus } from '../../lib/database.types';
import { subscribeToAllRequirements, type RealtimeUpdate } from '../../lib/api/realtimeSync';
import { phoneNumberMatches } from '../../lib/phoneUtils';
import { ErrorAlert } from '../common/ErrorAlert';
import { RequirementsTable } from './RequirementsTable';
import { useSyncQueue } from '../../hooks/useSyncStatus';
import { processSyncQueue } from '../../lib/offlineDB';

import SearchIcon from '@mui/icons-material/Search';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import InputBase from '@mui/material/InputBase';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Divider from '@mui/material/Divider';
import CircularProgress from '@mui/material/CircularProgress';
import Tooltip from '@mui/material/Tooltip';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import { styled } from '@mui/material/styles';

const RequirementsReport = lazy(() => import('./RequirementsReport').then((m) => ({ default: m.RequirementsReport })));
const RequirementDetailModal = lazy(() => import('./RequirementDetailModal').then((m) => ({ default: m.RequirementDetailModal })));
const ConfirmDialog = lazy(() => import('../common/ConfirmDialog').then((m) => ({ default: m.ConfirmDialog })));

type Requirement = Database['public']['Tables']['requirements']['Row'];

interface RequirementsManagementProps {
  onCreateInterview?: (requirementId: string) => void;
  toolbarPortalTargetId?: string;
}

const Search = styled('div')({
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  maxWidth: 280,
  width: '100%',
  height: 36,
  borderRadius: 6,
  backgroundColor: '#ffffff',
  border: '1px solid #d1d5db',
  transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
  paddingLeft: 8,
  '&:focus-within': {
    borderColor: '#007bff',
    boxShadow: '0 0 0 3px rgba(0, 123, 255, 0.1)',
  },
});

const SearchIconWrapper = styled('div')({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#6b7280',
  marginRight: 6,
  '& svg': {
    width: 18,
    height: 18,
  },
});

const SearchClearWrapper = styled('div')({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  marginLeft: 'auto',
  marginRight: 3,
  '& button': {
    color: '#6b7280',
    width: 28,
    height: 28,
    transition: 'color 0.2s ease',
  },
  '& button:hover': {
    color: '#007bff',
  },
  '& svg': {
    width: 16,
    height: 16,
  },
});

const StyledInputBase = styled(InputBase)({
  flex: 1,
  height: '100%',
  backgroundColor: 'transparent',
  color: '#1f2937',
  '& .MuiInputBase-input': {
    padding: '6px 8px',
    fontSize: 13,
    fontWeight: 400,
    color: 'inherit',
    '::placeholder': {
      color: '#9ca3af',
      opacity: 1,
    },
  },
});

export const RequirementsManagement = memo(({ onCreateInterview }: RequirementsManagementProps) => {
  const { user, isAdmin } = useAuth();
  const { isOnline, queueOfflineOperation } = useOfflineCache();
  const { showToast } = useToast();
  const { filters: savedFilters, updateFilters, isLoaded } = useSearchFilters();

  const [searchTerm, setSearchTerm] = useState(savedFilters?.searchTerm || '');
  const [filterStatus, setFilterStatus] = useState<RequirementStatus | 'ALL'>((savedFilters?.filterStatus as RequirementStatus | 'ALL') || 'ALL');
  const [sortBy, setSortBy] = useState<'date' | 'company' | 'daysOpen'>((savedFilters?.sortBy as 'date' | 'company' | 'daysOpen') || 'date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>((savedFilters?.sortOrder as 'asc' | 'desc') || 'desc');
  const [page, setPage] = useState(0);
  const [isErrorDismissed, setIsErrorDismissed] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showToolsDialog, setShowToolsDialog] = useState(false);
  const [localDateRange, setLocalDateRange] = useState({
    from: savedFilters?.dateRangeFrom || '',
    to: savedFilters?.dateRangeTo || ''
  });
  const [pageSize, setPageSize] = useState(100);
  const [selectedRequirement, setSelectedRequirement] = useState<Requirement | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [requirementToDelete, setRequirementToDelete] = useState<Requirement | null>(null);

  // Sync queue UI state
  const { pendingItems, updateItemStatus, clearSynced, pendingCount } = useSyncQueue();
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);
  const [showSyncPanel, setShowSyncPanel] = useState(false);

  useEffect(() => {
    const openHandler = () => setShowSyncPanel(true);
    window.addEventListener('open-sync-queue', openHandler);
    return () => window.removeEventListener('open-sync-queue', openHandler);
  }, []);

  // Advanced filtering state
  const minRate = savedFilters?.minRate || '';
  const maxRate = savedFilters?.maxRate || '';
  const remoteFilter = (savedFilters?.remoteFilter as 'ALL' | 'REMOTE' | 'ONSITE') || 'ALL';
  const dateRange = useMemo(() => ({
    from: savedFilters?.dateRangeFrom || '',
    to: savedFilters?.dateRangeTo || ''
  }), [savedFilters?.dateRangeFrom, savedFilters?.dateRangeTo]);

  const dateFromIso = useMemo(() => {
    return dateRange.from ? new Date(`${dateRange.from}T00:00:00`).toISOString() : undefined;
  }, [dateRange]);

  const dateToIso = useMemo(() => {
    return dateRange.to ? new Date(`${dateRange.to}T23:59:59.999`).toISOString() : undefined;
  }, [dateRange]);

  const requirementsSWR = useRequirementsPage({
    page,
    pageSize,
    search: searchTerm,
    status: filterStatus,
    dateFrom: dateFromIso,
    dateTo: dateToIso,
    sortBy,
    sortOrder,
    minRate,
    maxRate,
    remoteFilter,
  });

  const mutateRequirements = requirementsSWR.mutate;

  const requirements = useMemo(
    () => (requirementsSWR.data?.requirements || []) as RequirementWithLogs[],
    [requirementsSWR.data?.requirements]
  );
  const hasNextPage = requirementsSWR.data?.hasNextPage || false;
  const isFetchingPage = requirementsSWR.isValidating;
  const loading = requirementsSWR.isLoading;
  const error = !isErrorDismissed && requirementsSWR.error
    ? {
      title: 'Failed to load requirements',
      message: requirementsSWR.error instanceof Error ? requirementsSWR.error.message : String(requirementsSWR.error),
    }
    : null;

  useEffect(() => {
    if (requirementsSWR.error) {
      setIsErrorDismissed(false);
    }
  }, [requirementsSWR.error]);

  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const handleManualRefresh = useCallback(() => {
    void mutateRequirements(undefined, { revalidate: true });
    try {
      const key0 = `requirements-page:${JSON.stringify({
        userId: 'shared',
        page: 0,
        pageSize,
        search: searchTerm,
        status: filterStatus,
        dateFrom: dateFromIso || '',
        dateTo: dateToIso || '',
        sortBy,
        sortOrder,
        minRate: minRate || '',
        maxRate: maxRate || '',
        remoteFilter: remoteFilter || 'ALL',
      })}`;

      void globalMutate(key0, undefined, { revalidate: true });
    } catch {
      // Silently handle page-0 refresh error
    }
  }, [mutateRequirements, pageSize, searchTerm, filterStatus, dateFromIso, dateToIso, sortBy, sortOrder, minRate, maxRate, remoteFilter]);

  const handleApplyToolsSettings = useCallback(() => {
    // Apply date range filter
    updateFilters({
      searchTerm: searchTerm,
      sortBy,
      sortOrder,
      filterStatus: filterStatus.toString(),
      minRate,
      maxRate,
      remoteFilter,
      dateRangeFrom: localDateRange.from,
      dateRangeTo: localDateRange.to,
    });
    
    setPage(0);
    setShowToolsDialog(false);
    showToast({
      type: 'success',
      title: 'Filters applied',
      message: 'Your filter settings have been updated'
    });
  }, [updateFilters, searchTerm, sortBy, sortOrder, filterStatus, minRate, maxRate, remoteFilter, localDateRange, showToast]);

  const handleResetToolsSettings = useCallback(() => {
    setLocalDateRange({
      from: '',
      to: ''
    });
    setPageSize(100);
  }, []);

  const tableSearch = (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
      <Search role="search" aria-label="Search requirements">
        <SearchIconWrapper>
          <SearchIcon fontSize="small" />
        </SearchIconWrapper>
        <StyledInputBase
          inputRef={searchInputRef}
          value={searchTerm}
          onChange={(e) => {
            handleSearchChange(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.stopPropagation();
            }
            if (e.key === 'Escape') {
              if (searchTerm) {
                setSearchTerm('');
              }
              searchInputRef.current?.blur();
            }
          }}
          placeholder="Search…"
          inputProps={{
            'aria-label': 'Search requirements',
          }}
        />

        {searchTerm && (
          <SearchClearWrapper>
            <IconButton
              size="small"
              onClick={() => {
                if (searchTerm) {
                  setSearchTerm('');
                }
              }}
              aria-label="Clear search"
              title="Clear search"
            >
              <X className="w-5 h-5" />
            </IconButton>
          </SearchClearWrapper>
        )}
      </Search>
      <Tooltip title="Refresh">
        <IconButton
          color="inherit"
          onClick={() => handleManualRefresh()}
          size="small"
          disabled={isFetchingPage}
        >
          <RefreshCw className={`w-4 h-4 ${isFetchingPage ? 'animate-spin' : ''}`} />
        </IconButton>
      </Tooltip>
      <Tooltip title="Tools & Filters">
        <IconButton
          color="inherit"
          onClick={() => setShowToolsDialog(true)}
          size="small"
        >
          <Settings className="w-4 h-4" />
        </IconButton>
      </Tooltip>
    </Box>
  );

  

  // ⚡ OPTIMIZATION: Instant search with request cancellation (AbortController)
  const handleSearchChange = useCallback((value: string) => {
    // Update search immediately (no delay)
    setSearchTerm(value);
    setPage(0);
  }, []);

  // Initialize search with saved value
  useEffect(() => {
    if (isLoaded && savedFilters?.searchTerm) {
      setSearchTerm(savedFilters.searchTerm);
    }
  }, [isLoaded, savedFilters]);

  // Save filters with search term changes (no debounce delay)
  useEffect(() => {
    if (!isLoaded) return;

    updateFilters({
      searchTerm: searchTerm,
      sortBy,
      sortOrder,
      filterStatus: filterStatus.toString(),
      minRate,
      maxRate,
      remoteFilter,
      dateRangeFrom: dateRange.from,
      dateRangeTo: dateRange.to,
    });
  }, [searchTerm, sortBy, sortOrder, filterStatus, minRate, maxRate, remoteFilter, dateRange, isLoaded, updateFilters]);

  // Effect to handle filter changes - resets to page 0
  useEffect(() => {
    setPage(0);
  }, [searchTerm, filterStatus, sortBy, sortOrder, minRate, maxRate, remoteFilter, dateRange.from, dateRange.to, pageSize]);

  useEffect(() => {
    // Subscribe to real-time changes
    let unsubscribe: (() => void) | undefined;
    if (user) {
      const dateFrom = dateRange.from ? new Date(`${dateRange.from}T00:00:00`).getTime() : null;
      const dateTo = dateRange.to ? new Date(`${dateRange.to}T23:59:59.999`).getTime() : null;
      const searchLower = searchTerm.trim().toLowerCase();
      const matchesServerSideFilters = (record: Requirement) => {
        const matchesStatus = filterStatus === 'ALL' || record.status === filterStatus;

        const matchesSearch =
          !searchLower ||
          (record.title || '').toLowerCase().includes(searchLower) ||
          (record.implementation_partner || '').toLowerCase().includes(searchLower) ||
          (record.primary_tech_stack || '').toLowerCase().includes(searchLower) ||
          (record.description || '').toLowerCase().includes(searchLower) ||
          (record.client || '').toLowerCase().includes(searchLower) ||
          (record.vendor_company || '').toLowerCase().includes(searchLower) ||
          (record.vendor_person_name || '').toLowerCase().includes(searchLower) ||
          // 📱 Phone number search: normalize format for flexible matching
          phoneNumberMatches(record.vendor_phone || '', searchLower) ||
          (record.vendor_email || '').toLowerCase().includes(searchLower) ||
          (record.vendor_website || '').toLowerCase().includes(searchLower) ||
          (record.next_step || '').toLowerCase().includes(searchLower) ||
          (record.status || '').toLowerCase().includes(searchLower);

        let matchesDate = true;
        if (dateFrom || dateTo) {
          const createdMs = new Date(record.created_at).getTime();
          if (!Number.isNaN(createdMs)) {
            if (dateFrom && createdMs < dateFrom) matchesDate = false;
            if (dateTo && createdMs > dateTo) matchesDate = false;
          }
        }

        return matchesStatus && matchesSearch && matchesDate;
      };

      unsubscribe = subscribeToAllRequirements((update: RealtimeUpdate<Requirement>) => {
        if (update.type === 'INSERT') {
          if (page !== 0) {
            return;
          }
            if (matchesServerSideFilters(update.record)) {
            void mutateRequirements((curr: any) => {
              if (!curr) return curr;
              const existing = curr.requirements || [];
              const deduped = existing.filter((r: any) => r.id !== update.record.id);
              return {
                ...curr,
                requirements: [update.record as unknown as RequirementWithLogs, ...deduped].slice(0, pageSize),
              };
            }, { revalidate: false });
          }
          showToast({
            type: 'info',
            title: 'New requirement',
            message: `"${update.record.title}" has been added`,
          });
        } else if (update.type === 'UPDATE') {
          void mutateRequirements((curr: any) => {
            if (!curr) return curr;
            const exists = curr.requirements.some((r: any) => r.id === update.record.id);
            const shouldInclude = matchesServerSideFilters(update.record);

            if (exists) {
              if (!shouldInclude) {
                return { ...curr, requirements: curr.requirements.filter((r: any) => r.id !== update.record.id) };
              }
              return {
                ...curr,
                requirements: curr.requirements.map((r: any) => (r.id === update.record.id ? (update.record as unknown as RequirementWithLogs) : r)),
              };
            }

            if (page === 0 && shouldInclude) {
              const existing = curr.requirements || [];
              const deduped = existing.filter((r: any) => r.id !== update.record.id);
              return {
                ...curr,
                requirements: [update.record as unknown as RequirementWithLogs, ...deduped].slice(0, pageSize),
              };
            }

            return curr;
          }, { revalidate: false });
          if (selectedRequirement?.id !== update.record.id) {
            showToast({
              type: 'info',
              title: 'Requirement updated',
              message: 'Changes have been made to a requirement',
            });
          }
        } else if (update.type === 'DELETE') {
          void mutateRequirements((curr: any) => {
            if (!curr) return curr;
            return { ...curr, requirements: curr.requirements.filter((r: any) => r.id !== update.record.id) };
          }, { revalidate: false });
          if (selectedRequirement?.id === update.record.id) {
            setSelectedRequirement(null);
          }
          showToast({
            type: 'info',
            title: 'Requirement deleted',
            message: 'A requirement has been removed',
          });
        }
      });
    }

    return () => {
      unsubscribe?.();
    };
  }, [user, selectedRequirement?.id, showToast, mutateRequirements, dateRange.from, dateRange.to, searchTerm, filterStatus, page, pageSize]);

  // Listen for requirement creation event to immediately reload
  useEffect(() => {
    const handleRequirementCreated = (event: any) => {
      const newRequirement = event.detail;
      if (!newRequirement) {
        // Event received but no requirement detail found
        return;
      }

      // Reset to first page to show the newly created requirement
      setPage(0);
      
      // Optimistically add the new requirement to the current data immediately
      void mutateRequirements((curr: any) => {
        if (!curr) return curr;
        // Prepend the new requirement and limit to pageSize, dedup by id
        const existing = curr.requirements || [];
        const deduped = existing.filter((r: any) => r.id !== newRequirement.id);
        return {
          ...curr,
          requirements: [newRequirement as RequirementWithLogs, ...deduped].slice(0, pageSize),
        };
      }, { revalidate: true }); // Also revalidate to ensure fresh data

      // DEBUG: log current cache contents for this key after mutate
      try {
        void mutateRequirements((curr: any) => {
          return curr;
        }, { revalidate: false });
      } catch (e) {
        console.warn('Failed to run debug mutate on current key', e);
      }

      // Also update the page-0 cache key directly so users on other pages see the new item after reset
      try {
        const key0 = `requirements-page:${JSON.stringify({
          userId: 'shared',
          page: 0,
          pageSize,
          search: searchTerm,
          status: filterStatus,
          dateFrom: dateFromIso || '',
          dateTo: dateToIso || '',
          sortBy,
          sortOrder,
          minRate: minRate || '',
          maxRate: maxRate || '',
          remoteFilter: remoteFilter || 'ALL',
        })}`;

        void globalMutate(key0, (curr: any) => {
          if (!curr) return { requirements: [newRequirement as RequirementWithLogs], hasNextPage: false };
          const existing = curr.requirements || [];
          const deduped = existing.filter((r: any) => r.id !== newRequirement.id);
          return {
            ...curr,
            requirements: [newRequirement as RequirementWithLogs, ...deduped].slice(0, pageSize),
          };
        }, { revalidate: true });

        // DEBUG: read and log page-0 cache contents
        try {
          void globalMutate(key0, (curr: any) => {
            try {
              console.log('Post-mutate page-0 requirement ids:', (curr?.requirements || []).map((r: any) => r.id).slice(0, 10));
            } catch (e) {
              console.warn('Failed to log page-0 cache', e);
            }
            return curr;
          }, { revalidate: false });
        } catch (e) {
          console.warn('Failed to run debug globalMutate on page-0 key', e);
        }
      } catch (err) {
        console.warn('Failed to mutate page-0 key for new requirement', err);
      }
    };

    window.addEventListener('requirement-created', handleRequirementCreated as EventListener);
    return () => {
      window.removeEventListener('requirement-created', handleRequirementCreated as EventListener);
    };
  }, [
    mutateRequirements,
    user?.id,
    pageSize,
    searchTerm,
    filterStatus,
    dateFromIso,
    dateToIso,
    sortBy,
    sortOrder,
    minRate,
    maxRate,
    remoteFilter,
  ]);

  const handleDeleteClick = useCallback((requirementOrId: Requirement | string) => {
    if (!isAdmin) {
      showToast({
        type: 'error',
        title: 'Permission denied',
        message: 'Only admins can delete requirements.',
      });
      return;
    }
    const requirement = typeof requirementOrId === 'string'
      ? requirements.find(r => r.id === requirementOrId)
      : requirementOrId;
    if (requirement) {
      setRequirementToDelete(requirement);
      setShowDeleteConfirm(true);
    }
  }, [isAdmin, showToast, requirements]);

  const handleDelete = useCallback(async () => {
    const requirement = requirementToDelete;
    if (!requirement || !user) return;

    try {
      if (!isOnline) {
        await queueOfflineOperation('DELETE', 'requirement', requirement.id, {});
        await mutateRequirements((curr: any) => {
          if (!curr) return curr;
          return { ...curr, requirements: curr.requirements.filter((r: any) => r.id !== requirement.id) };
        }, { revalidate: false });
        setSelectedRequirement(null);
        setShowDeleteConfirm(false);
        setRequirementToDelete(null);
        showToast({
          type: 'info',
          title: 'Queued for Sync',
          message: 'Requirement will be deleted when you come back online'
        });
        setPage(0);
        await mutateRequirements();
        return;
      }

      const result = await deleteRequirement(requirement.id, user.id);
      if (result.success) {
        await mutateRequirements((curr: any) => {
          if (!curr) return curr;
          return { ...curr, requirements: curr.requirements.filter((r: any) => r.id !== requirement.id) };
        }, { revalidate: false });
        setSelectedRequirement(null);
        setShowDeleteConfirm(false);
        setRequirementToDelete(null);
        showToast({ type: 'success', title: 'Requirement deleted', message: 'The requirement has been removed.' });
        setPage(0);
        await mutateRequirements();
      } else {
        showToast({ type: 'error', title: 'Failed to delete', message: result.error || 'Unknown error' });
      }
    } catch {
      showToast({ type: 'error', title: 'Error', message: 'Failed to delete requirement' });
    }
  }, [requirementToDelete, showToast, user, isOnline, queueOfflineOperation, mutateRequirements]);

  const handleViewDetails = (req: Requirement) => {
    setSelectedRequirement(req);
  };

  const handleSortChange = useCallback((field: 'title' | 'company' | 'status' | 'created_at' | 'rate', order: 'asc' | 'desc') => {
    setSortBy(field === 'company' ? 'company' : 'date');
    setSortOrder(order);
    setPage(0);
  }, []);

  if (loading && requirements.length === 0) {
    return (
      <div className="space-y-6">
        <div className="sticky top-0 z-40 bg-white pb-6 -mx-6 px-6 pt-6 border-b border-gray-200 shadow-sm">
          <div className="h-8 bg-gray-200 rounded w-64 mb-6 animate-pulse" />
          <div className="h-10 bg-gray-200 rounded w-full max-w-md animate-pulse" />
        </div>
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
          <div className="px-4 py-3 bg-white border-b border-gray-100">
            <div className="h-6 bg-gray-200 rounded w-32 mb-2 animate-pulse" />
          </div>
          <div className="p-4">
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 bg-gray-200 rounded animate-pulse" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <ErrorAlert
          title={error.title}
          message={error.message}
          onRetry={() => void mutateRequirements()}
          onDismiss={() => setIsErrorDismissed(true)}
          retryLabel="Try Again"
          technical={error.message}
        />
      </div>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Sync Queue Panel (collapsible) */}
      {showSyncPanel ? (
        <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'var(--darkbg-surface)', borderColor: 'rgba(234,179,8,0.2)' }}>
          <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ xs: 'flex-start', md: 'center' }} justifyContent="space-between" spacing={1.5}>
            <Typography variant="subtitle2" sx={{ fontWeight: 500 }}>
              Offline Sync Queue
            </Typography>
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
              <Tooltip title={`${pendingCount} operations waiting to sync. Click 'Process Queue' to sync when online.`} arrow>
                <Chip size="small" label={`Pending: ${pendingCount}`} />
              </Tooltip>
              <Button
                variant="contained"
                color="primary"
                size="small"
                onClick={async () => {
                  setIsProcessingQueue(true);
                  try {
                    await processSyncQueue(20);
                    window.dispatchEvent(new CustomEvent('sync-complete'));
                  } finally {
                    setIsProcessingQueue(false);
                  }
                }}
                disabled={isProcessingQueue || pendingItems.length === 0}
                startIcon={isProcessingQueue ? <CircularProgress size={16} color="inherit" /> : undefined}
              >
                {isProcessingQueue ? 'Processing...' : 'Process Queue'}
              </Button>
              <Button
                variant="outlined"
                color="inherit"
                size="small"
                onClick={async () => {
                  await clearSynced();
                  window.dispatchEvent(new CustomEvent('sync-complete'));
                }}
              >
                Clear Synced
              </Button>
              <Button
                variant="text"
                color="inherit"
                size="small"
                onClick={() => setShowSyncPanel(false)}
              >
                Close
              </Button>
            </Stack>
          </Stack>

          {pendingItems.length === 0 ? (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              No items in queue
            </Typography>
          ) : (
            <Box sx={{ mt: 1 }}>
              <List dense disablePadding>
                {pendingItems.slice(0, 10).map((item, idx) => (
                  <Box key={item.id}>
                    <ListItem
                      disableGutters
                      secondaryAction={
                        <Stack direction="row" spacing={1}>
                          <Button
                            size="small"
                            variant="outlined"
                            color="primary"
                            onClick={async () => {
                              setIsProcessingQueue(true);
                              try {
                                await processSyncQueue(1);
                                window.dispatchEvent(new CustomEvent('sync-complete'));
                              } finally {
                                setIsProcessingQueue(false);
                              }
                            }}
                          >
                            Retry
                          </Button>
                          <Button
                            size="small"
                            variant="outlined"
                            color="inherit"
                            onClick={async () => {
                              await updateItemStatus(item.id, 'failed', 'Marked failed via UI');
                              window.dispatchEvent(new CustomEvent('sync-complete'));
                            }}
                          >
                            Mark Failed
                          </Button>
                        </Stack>
                      }
                    >
                      <ListItemText
                        primary={`${item.entityType} · ${item.operation}`}
                        secondary={`Entity ID: ${item.entityId} • Retries: ${item.retries}${item.lastError ? ` • Error: ${item.lastError}` : ''}`}
                        primaryTypographyProps={{ variant: 'body2', sx: { fontWeight: 700 } }}
                        secondaryTypographyProps={{ variant: 'caption' }}
                      />
                    </ListItem>
                    {idx < Math.min(10, pendingItems.length) - 1 ? <Divider /> : null}
                  </Box>
                ))}
              </List>
              {pendingItems.length > 10 ? (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                  Showing 10 of {pendingItems.length} pending items
                </Typography>
              ) : null}
            </Box>
          )}
        </Paper>
      ) : null}

      {/* Requirements Display - Table View Only */}
      <div className="w-full">
        {/* Empty State - When no requirements match filters */}
        {requirements.length === 0 && !loading && (
          <Paper
            variant="outlined"
            sx={{
              p: 3,
              mb: 3,
              bgcolor: 'rgba(59, 130, 246, 0.05)',
              borderColor: 'rgba(59, 130, 246, 0.3)',
              borderRadius: 2,
              textAlign: 'center'
            }}
          >
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
              {searchTerm ? '🔍 No requirements found' : '📝 No requirements yet'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {searchTerm 
                ? `No requirements match "${searchTerm}". Try a different search term or adjust filters.`
                : 'You haven\'t added any requirements yet. Click "New Requirement" to get started.'}
            </Typography>
          </Paper>
        )}

        {/* Performance Info - When showing results without explicit search */}
        {/* Removed: Showing recent requirements info message */}

        <RequirementsTable
          requirements={requirements}
          onViewDetails={handleViewDetails}
          onCreateInterview={onCreateInterview}
          onDelete={handleDeleteClick}
          headerSearch={tableSearch}
          isAdmin={isAdmin}
          serverSortField={sortBy === 'date' ? 'created_at' : sortBy}
          serverSortOrder={sortOrder}
          onSortChange={handleSortChange}
          page={page}
          hasNextPage={hasNextPage}
          isFetchingPage={isFetchingPage}
          onPageChange={setPage}
          selectedStatusFilter={filterStatus}
          onStatusFilterChange={setFilterStatus}
        />
      </div>

      {/* Detail Modal */}
      <RequirementDetailModal
        isOpen={selectedRequirement !== null}
        requirement={selectedRequirement}
        onClose={() => setSelectedRequirement(null)}
        onUpdate={() => void mutateRequirements()}
      />

      {/* Report Modal */}
      {showReport && <RequirementsReport onClose={() => setShowReport(false)} />}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => {
          setShowDeleteConfirm(false);
          setRequirementToDelete(null);
        }}
        onConfirm={handleDelete}
        title="Delete Requirement"
        message={`Are you sure you want to delete "${requirementToDelete?.title || 'this requirement'}"? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
      />

      {/* Tools & Filters Dialog */}
      <Dialog open={showToolsDialog} onClose={() => setShowToolsDialog(false)} fullWidth maxWidth="sm" disableScrollLock>
        <DialogTitle sx={{ fontWeight: 800, fontSize: '1.25rem', pb: 1 }}>
          Tools & Filters
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Stack spacing={3}>
            {/* Date Range Section */}
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 2, color: '#1f2937' }}>
                📅 Date Range Filter
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  label="From Date"
                  type="date"
                  value={localDateRange.from}
                  onChange={(e) => setLocalDateRange(prev => ({ ...prev, from: e.target.value }))}
                  size="small"
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  slotProps={{
                    input: {
                      sx: { fontSize: 13 }
                    }
                  }}
                />
                <TextField
                  label="To Date"
                  type="date"
                  value={localDateRange.to}
                  onChange={(e) => setLocalDateRange(prev => ({ ...prev, to: e.target.value }))}
                  size="small"
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  slotProps={{
                    input: {
                      sx: { fontSize: 13 }
                    }
                  }}
                />
              </Stack>
            </Box>

            {/* Rows Per Page Section */}
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 2, color: '#1f2937' }}>
                📊 Rows Per Page
              </Typography>
              <FormControl fullWidth size="small">
                <InputLabel>Rows per page</InputLabel>
                <Select
                  value={pageSize}
                  label="Rows per page"
                  onChange={(e) => setPageSize(e.target.value as number)}
                >
                  <MenuItem value={25}>25 rows</MenuItem>
                  <MenuItem value={50}>50 rows</MenuItem>
                  <MenuItem value={100}>100 rows</MenuItem>
                  <MenuItem value={250}>250 rows</MenuItem>
                </Select>
              </FormControl>
            </Box>

            {/* Sort Options Section */}
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 2, color: '#1f2937' }}>
                🔤 Sort Options
              </Typography>
              <Stack spacing={1.5}>
                <FormControl fullWidth size="small">
                  <InputLabel>Sort by</InputLabel>
                  <Select
                    value={sortBy}
                    label="Sort by"
                    onChange={(e) => {
                      setSortBy(e.target.value as 'date' | 'company' | 'daysOpen');
                      setPage(0);
                    }}
                  >
                    <MenuItem value="date">Date Created</MenuItem>
                    <MenuItem value="company">Company Name</MenuItem>
                    <MenuItem value="daysOpen">Days Open</MenuItem>
                  </Select>
                </FormControl>
                <FormControl fullWidth size="small">
                  <InputLabel>Sort order</InputLabel>
                  <Select
                    value={sortOrder}
                    label="Sort order"
                    onChange={(e) => {
                      setSortOrder(e.target.value as 'asc' | 'desc');
                      setPage(0);
                    }}
                  >
                    <MenuItem value="desc">Descending (Z-A, Newest first)</MenuItem>
                    <MenuItem value="asc">Ascending (A-Z, Oldest first)</MenuItem>
                  </Select>
                </FormControl>
              </Stack>
            </Box>

            {/* Export Section */}
            <Paper variant="outlined" sx={{ p: 2, bgcolor: 'rgba(59, 130, 246, 0.05)', borderColor: 'rgba(59, 130, 246, 0.2)' }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, color: '#1f2937' }}>
                💾 Export Data
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Export all requirements to CSV or PDF with customizable columns and filters.
              </Typography>
              <Button
                variant="contained"
                fullWidth
                onClick={() => {
                  setShowReport(true);
                  setShowToolsDialog(false);
                }}
                sx={{
                  textTransform: 'none',
                  fontWeight: 600,
                  backgroundColor: '#3b82f6',
                  '&:hover': {
                    backgroundColor: '#2563eb'
                  }
                }}
              >
                Open Export Dialog
              </Button>
            </Paper>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button
            onClick={() => {
              handleResetToolsSettings();
              setShowToolsDialog(false);
            }}
            variant="outlined"
            color="inherit"
          >
            Cancel
          </Button>
          <Button
            onClick={handleApplyToolsSettings}
            variant="contained"
            sx={{
              textTransform: 'none',
              fontWeight: 600
            }}
          >
            Apply Filters
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
});
