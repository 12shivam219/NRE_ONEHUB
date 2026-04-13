import { useState, useCallback } from 'react';
import { RefreshCw, CloudLightning } from 'lucide-react';
import { useSyncStatus, useSyncQueue } from '../../hooks/useSyncStatus';
import { processSyncQueue } from '../../lib/offlineDB';
import { ConfirmDialog } from './ConfirmDialog';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';

export const SyncStatusBadge = () => {
  const { syncStatus, refresh } = useSyncStatus();
  const { pendingCount, clearSynced } = useSyncQueue();
  const [isProcessing, setIsProcessing] = useState(false);
  const [ariaMessage, setAriaMessage] = useState('');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [syncMenuAnchorEl, setSyncMenuAnchorEl] = useState<HTMLElement | null>(null);

  const handleProcess = useCallback(async () => {
    setIsProcessing(true);
    try {
      const result = await processSyncQueue(20);
      window.dispatchEvent(new CustomEvent('sync-complete'));
      setAriaMessage(`Sync completed. ${result.processed ?? 0} items processed, ${result.failed ?? 0} failed.`);
      setTimeout(() => setAriaMessage(''), 5000);
      setTimeout(() => refresh(), 500);
      return result;
    } finally {
      setIsProcessing(false);
    }
  }, [refresh]);

  const handleProcessClick = useCallback(() => {
    const LARGE_SYNC_THRESHOLD = 500;
    if (pendingCount > LARGE_SYNC_THRESHOLD) {
      setShowConfirmDialog(true);
    } else {
      void handleProcess();
    }
  }, [pendingCount, handleProcess]);

  const handleSyncMenuOpen = useCallback((e: React.MouseEvent<HTMLElement>) => {
    setSyncMenuAnchorEl(e.currentTarget);
  }, []);

  const handleRefresh = useCallback(async () => {
    await clearSynced();
    refresh();
  }, [clearSynced, refresh]);

  const handleSyncMenuClose = useCallback(() => {
    setSyncMenuAnchorEl(null);
  }, []);

  const syncProgress = syncStatus ? syncStatus.progress : 0;

  return (
    <>
      {/* Status Badge Button */}
      <IconButton
        onClick={handleSyncMenuOpen}
        aria-label="Sync status"
        sx={{
          display: { xs: 'none', md: 'inline-flex' },
          color: '#3B82F6',
          borderRadius: '4px',
          backgroundColor: '#EFF6FF',
          px: 0.875,
          py: 0.375,
          gap: 0.375,
          minHeight: 'auto',
          minWidth: 'auto',
          height: 36,
          transition: 'all 200ms ease',
          '&:hover': {
            backgroundColor: '#DBEAFE',
          },
        }}
      >
        <CloudLightning className="w-4 h-4" />
        <Typography
          sx={{
            fontSize: '0.6875rem',
            fontWeight: 600,
            fontFamily: '"Poppins", sans-serif',
            color: '#3B82F6',
          }}
        >
          {syncProgress}%
        </Typography>
      </IconButton>

      {/* Dropdown Menu */}
      <Menu
        anchorEl={syncMenuAnchorEl}
        open={Boolean(syncMenuAnchorEl)}
        onClose={handleSyncMenuClose}
        disableScrollLock={true}
        PaperProps={{
          sx: {
            width: 280,
            maxWidth: 'calc(100vw - 2rem)',
            backgroundColor: '#FFFFFF',
            backgroundImage: 'none',
            border: '1px solid #E5E7EB',
            borderRadius: '0.75rem',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
          },
        }}
      >
        {/* Pending Count Item */}
        <MenuItem
          disabled
          sx={{
            py: 1.25,
            px: 2,
            '&.Mui-disabled': {
              opacity: 1,
              color: '#1F2937',
            },
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <Typography
              variant="body2"
              sx={{
                fontFamily: '"Inter", sans-serif',
                fontSize: '0.875rem',
                color: '#6B7280',
              }}
            >
              Pending Items
            </Typography>
            <Typography
              variant="body2"
              sx={{
                fontWeight: 600,
                fontFamily: '"Poppins", sans-serif',
                fontSize: '0.875rem',
                color: '#3B82F6',
              }}
            >
              {pendingCount}
            </Typography>
          </Box>
        </MenuItem>

        <Divider sx={{ borderColor: '#E5E7EB' }} />

        {/* Sync Status Info */}
        <MenuItem
          disabled
          sx={{
            py: 1.25,
            px: 2,
            '&.Mui-disabled': {
              opacity: 1,
              color: '#1F2937',
            },
          }}
        >
          <Box sx={{ width: '100%' }}>
            <Typography
              variant="body2"
              sx={{
                fontFamily: '"Inter", sans-serif',
                fontSize: '0.75rem',
                color: '#9CA3AF',
                mb: 0.5,
              }}
            >
              Sync Progress
            </Typography>
            <Typography
              variant="body2"
              sx={{
                fontWeight: 600,
                fontFamily: '"Poppins", sans-serif',
                fontSize: '0.875rem',
                color: '#1F2937',
              }}
              title={syncStatus?.lastSyncTime ? `Last synced: ${new Date(syncStatus.lastSyncTime).toLocaleString()}` : 'Not synced yet'}
            >
              {syncProgress}%
              {syncStatus && syncStatus.failedItems > 0 && (
                <span style={{ marginLeft: '0.5rem', color: '#EF4444', fontSize: '0.75rem' }}>
                  ({syncStatus.failedItems} failed)
                </span>
              )}
            </Typography>
          </Box>
        </MenuItem>

        <Divider sx={{ borderColor: '#E5E7EB' }} />

        {/* Process Sync Button */}
        <MenuItem
          onClick={() => {
            handleProcessClick();
            handleSyncMenuClose();
          }}
          disabled={isProcessing || pendingCount === 0}
          sx={{
            py: 1.25,
            px: 2,
            justifyContent: 'center',
            fontWeight: 600,
            fontSize: '0.875rem',
            fontFamily: '"Poppins", sans-serif',
            backgroundColor: pendingCount > 0 ? '#EFF6FF' : '#F9FAFB',
            color: pendingCount > 0 ? '#3B82F6' : '#9CA3AF',
            transition: 'all 200ms ease',
            '&:hover': {
              backgroundColor: pendingCount > 0 ? '#DBEAFE' : '#F3F4F6',
            },
            '&.Mui-disabled': {
              opacity: pendingCount === 0 ? 0.6 : 1,
              color: pendingCount > 0 ? '#3B82F6' : '#9CA3AF',
            },
          }}
        >
          {isProcessing ? (
            <>
              <div style={{
                height: '0.875rem',
                width: '0.875rem',
                borderRadius: '50%',
                border: '2px solid #DBEAFE',
                borderTopColor: '#3B82F6',
                animation: 'spin 0.6s linear infinite',
                marginRight: '0.5rem',
              }} />
              Processing...
            </>
          ) : (
            <>
              <CloudLightning className="w-4 h-4" style={{ marginRight: '0.5rem' }} />
              Process Sync
            </>
          )}
          <style>
            {`@keyframes spin { to { transform: rotate(360deg); } }`}
          </style>
        </MenuItem>

        {/* Refresh/Clear Button */}
        <MenuItem
          onClick={() => {
            handleRefresh();
            handleSyncMenuClose();
          }}
          sx={{
            py: 1.25,
            px: 2,
            justifyContent: 'center',
            fontWeight: 500,
            fontSize: '0.875rem',
            fontFamily: '"Inter", sans-serif',
            backgroundColor: '#F9FAFB',
            color: '#6B7280',
            transition: 'all 200ms ease',
            '&:hover': {
              backgroundColor: '#F3F4F6',
              color: '#374151',
            },
          }}
        >
          <RefreshCw className="w-4 h-4" style={{ marginRight: '0.5rem' }} />
          Clear Synced
        </MenuItem>
      </Menu>

      {/* Large Sync Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showConfirmDialog}
        onClose={() => setShowConfirmDialog(false)}
        onConfirm={async () => {
          setShowConfirmDialog(false);
          await handleProcess();
        }}
        title="Process Large Sync Queue"
        message={`This will process ${pendingCount} items. This may take a while. Continue?`}
        confirmLabel="Process"
        cancelLabel="Cancel"
        variant="warning"
        isLoading={isProcessing}
      />

      {/* ARIA live region for announcements */}
      <div aria-live="polite" className="sr-only" role="status">
        {ariaMessage}
      </div>
    </>
  );
};

export default SyncStatusBadge;
