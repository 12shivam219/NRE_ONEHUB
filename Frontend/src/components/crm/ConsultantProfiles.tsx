import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { Search, X } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { deleteConsultant, getConsultantsPage } from '../../lib/api/consultants';
import { subscribeToAllConsultants } from '../../lib/api/realtimeSync';
import { debounce } from '../../lib/utils';
import { ConsultantDetailModal } from './ConsultantDetailModal';
import { ErrorAlert } from '../common/ErrorAlert';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { DataTable, Column } from './DataTable';
import type { Database } from '../../lib/database.types';
import { useToast } from '../../contexts/ToastContext';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';

type Consultant = Database['public']['Tables']['consultants']['Row'];

type RealtimeUpdate<T> = { type: 'INSERT' | 'UPDATE' | 'DELETE'; record: T };

export const ConsultantProfiles = memo(() => {
  const { user, isAdmin } = useAuth();
  const { showToast } = useToast();
  const [consultants, setConsultants] = useState<Consultant[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ title: string; message: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedValue, setDebouncedValue] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [selectedConsultant, setSelectedConsultant] = useState<Consultant | null>(null);
  const [selectedCreatedBy, setSelectedCreatedBy] = useState<string | null>(null);
  const [selectedUpdatedBy, setSelectedUpdatedBy] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalResults, setTotalResults] = useState<number | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [consultantToDelete, setConsultantToDelete] = useState<string | null>(null);
  const itemsPerPage = 20;

  const handleDebouncedSearch = useMemo(
    () => debounce((value: unknown) => {
      setDebouncedValue(value as string);
      setCurrentPage(0);
    }, 300),
    []
  );

  const loadConsultants = useCallback(async (page: number = 0) => {
    if (!user) return;
    try {
      setLoading(true);
      setError(null);

      const result = await getConsultantsPage({
        userId: user.id,
        limit: itemsPerPage,
        offset: page * itemsPerPage,
        search: debouncedValue || undefined,
        status: filterStatus !== 'ALL' ? filterStatus : undefined,
      });

      if (result.success && result.consultants) {
        setConsultants(result.consultants);
        setTotalResults(result.total ?? null);
        setSelectedConsultant(prev => {
          if (prev && result.consultants) {
            const updated = result.consultants.find(c => c.id === prev.id);
            return updated || prev;
          }
          return null;
        });
      } else if (result.error) {
        setError({ title: 'Failed to load consultants', message: result.error });
      }
    } catch {
      setError({ title: 'Error loading consultants', message: 'An unexpected error occurred' });
    } finally {
      setLoading(false);
    }
  }, [user, debouncedValue, filterStatus, itemsPerPage]);

  useEffect(() => {
    loadConsultants(0);
  }, [loadConsultants]);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    if (user) {
      unsubscribe = subscribeToAllConsultants((update: RealtimeUpdate<Consultant>) => {
        if (update.type === 'INSERT') {
          loadConsultants(0);
          showToast({
            type: 'info',
            title: 'New consultant',
            message: `"${update.record.name}" has been added`,
          });
        } else if (update.type === 'UPDATE') {
          setConsultants(prev =>
            prev.map(c => (c.id === update.record.id ? update.record : c))
          );
          setSelectedConsultant(prev =>
            prev?.id === update.record.id ? update.record : prev
          );
        } else if (update.type === 'DELETE') {
          setConsultants(prev => prev.filter(c => c.id !== update.record.id));
          setSelectedConsultant(prev => 
            prev?.id === update.record.id ? null : prev
          );
        }
      });
    }
    return () => { unsubscribe?.(); };
  }, [user, loadConsultants, showToast]);

  const handleDeleteClick = useCallback((id: string) => {
    if (!isAdmin) {
      showToast({
        type: 'error',
        title: 'Permission denied',
        message: 'Only admins can delete consultants.',
      });
      return;
    }
    setConsultantToDelete(id);
    setShowDeleteConfirm(true);
  }, [isAdmin, showToast]);

  const handleDelete = useCallback(async () => {
    if (!consultantToDelete) return;
    try {
      const result = await deleteConsultant(consultantToDelete, user?.id);
      if (result.success) {
        showToast({ type: 'success', title: 'Consultant deleted', message: 'The consultant has been removed.' });
        setShowDeleteConfirm(false);
        setConsultantToDelete(null);
        // BUG FIX: Reload from page 0 to avoid out-of-bounds error
        // If the deleted consultant was the last item on the page, currentPage might be invalid
        await loadConsultants(0);
      } else if (result.error) {
        setError({ title: 'Failed to delete', message: result.error });
      }
    } catch {
      setError({ title: 'Error', message: 'Failed to delete consultant' });
    }
  }, [consultantToDelete, loadConsultants, showToast, user?.id]);


  const handleViewDetails = (consultant: Consultant) => {
    setSelectedConsultant(consultant);
    setSelectedCreatedBy(null);
    setSelectedUpdatedBy(null);
  };

  const columns: Column<Consultant>[] = [
    {
      key: 'name',
      label: 'Name',
      width: '20%',
      render: (item) => item.name || '—',
    },
    {
      key: 'email',
      label: 'Email',
      width: '25%',
      render: (item) => item.email || '—',
    },
    {
      key: 'primary_skills',
      label: 'Primary Skills',
      width: '30%',
      render: (item) => item.primary_skills || '—',
    },
    {
      key: 'status',
      label: 'Status',
      width: '15%',
      render: (item) => {
        const statusEmoji = item.status === 'Active' ? '🟢' : item.status === 'Recently Placed' ? '🔵' : '⚪';
        return (
          <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold font-heading bg-green-50 text-green-700">
            <span className="mr-1">{statusEmoji}</span>
            {item.status || 'Unknown'}
          </span>
        );
      },
    },
  ];

  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-heading)' }}>
          Consultant Profiles
        </Typography>
        <Typography>Loading consultants...</Typography>
      </Box>
    );
  }

  const headerSearch = (
    <div className="flex-1 min-w-0 flex flex-col sm:flex-row gap-2">
      <TextField
        size="small"
        label="Search by name or email"
        placeholder="Search..."
        value={searchTerm}
        onChange={(e) => {
          const value = e.target.value;
          setSearchTerm(value);
          if (value.length > 100) {
            setSearchError('Search term too long.');
          } else {
            setSearchError(null);
            handleDebouncedSearch(value);
          }
        }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <Search className="w-4 h-4" />
            </InputAdornment>
          ),
        }}
        sx={{ flex: 1, '& .MuiOutlinedInput-root': { color: '#0F172A', borderColor: '#E5E7EB', '&:hover': { borderColor: '#D1D5DB' } } }}
      />

      <select
        className="px-3 py-2 text-sm border rounded-md bg-[color:var(--darkbg-surface-light)] text-[color:var(--text)] border-gray-300"
        value={filterStatus}
        onChange={(e) => setFilterStatus(e.target.value)}
        aria-label="Filter status"
      >
        <option value="ALL">All Status</option>
        <option value="Active">Active</option>
        <option value="Not Active">Not Active</option>
        <option value="Recently Placed">Recently Placed</option>
      </select>

      {searchTerm && (
        <button
          onClick={() => {
            setSearchTerm('');
            setSearchError(null);
            handleDebouncedSearch('');
          }}
          className="text-xs font-body text-slate-500 hover:text-blue-600 transition-colors flex items-center gap-1 px-2 py-1"
        >
          <X className="w-3 h-3" />
          Clear
        </button>
      )}
    </div>
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {error && (
        <ErrorAlert
          title={error.title}
          message={error.message}
          onRetry={() => loadConsultants(currentPage)}
          onDismiss={() => setError(null)}
        />
      )}

      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        justifyContent="space-between"
        spacing={2}
      >
        <Typography variant="h5" sx={{ fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-heading)' }}>
          Consultant Profiles
        </Typography>
      </Stack>

      {searchError && (
        <Typography variant="body2" sx={{ color: '#d32f2f' }}>
          {searchError}
        </Typography>
      )}

      <DataTable
        data={consultants}
        columns={columns}
        onViewDetails={handleViewDetails}
        onDelete={handleDeleteClick}
        onRowClick={handleViewDetails}
        isAdmin={isAdmin}
        title="Consultants"
        page={currentPage}
        hasNextPage={totalResults ? (currentPage + 1) * itemsPerPage < totalResults : false}
        isFetchingPage={loading}
        onPageChange={(page) => {
          setCurrentPage(page);
          loadConsultants(page);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        headerSearch={headerSearch}
        emptyStateIcon={undefined}
        emptyStateMessage="No consultants found"
      />

      <ConsultantDetailModal
        isOpen={selectedConsultant !== null}
        consultant={selectedConsultant}
        onClose={() => setSelectedConsultant(null)}
        onUpdate={() => loadConsultants(currentPage)}
        createdBy={selectedCreatedBy}
        updatedBy={selectedUpdatedBy}
      />

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => {
          setShowDeleteConfirm(false);
          setConsultantToDelete(null);
        }}
        onConfirm={handleDelete}
        title="Delete Consultant"
        message="Are you sure you want to delete this consultant? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
      />
    </Box>
  );
});