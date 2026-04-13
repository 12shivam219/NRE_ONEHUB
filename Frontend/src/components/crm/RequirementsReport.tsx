import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Download, X, FileText, Table2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { getRequirementsPage } from '../../lib/api/requirements';
import { useToast } from '../../contexts/ToastContext';
import { calculateDaysOpen } from '../../lib/requirementUtils';
import type { Database } from '../../lib/database.types';
import { BrandButton } from '../brand';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import RadioGroup from '@mui/material/RadioGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import Radio from '@mui/material/Radio';
import Checkbox from '@mui/material/Checkbox';
import TextField from '@mui/material/TextField';
import Paper from '@mui/material/Paper';

type Requirement = Database['public']['Tables']['requirements']['Row'];

interface ExportOptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (opts: { columns: string[]; format: 'csv' | 'pdf' }) => void;
}

const CSV_COLUMNS = [
  'requirement_number',
  'id',
  'title',
  'implementation_partner',
  'client',
  'status',
  'priority',
  'rate',
  'primary_tech_stack',
  'location',
  'remote',
  'duration',
  'next_step',
  'created_at',
];

export const ExportOptionsModal = ({ isOpen, onClose, onExport }: ExportOptionsModalProps) => {
  const { showToast } = useToast();
  const [selectedColumns, setSelectedColumns] = useState<string[]>(CSV_COLUMNS);
  const [exportFormat, setExportFormat] = useState<'csv' | 'pdf'>('csv');

  const handleColumnToggle = (column: string) => {
    setSelectedColumns(prev =>
      prev.includes(column)
        ? prev.filter(c => c !== column)
        : [...prev, column]
    );
  };

  const handleSelectAll = () => {
    if (selectedColumns.length === CSV_COLUMNS.length) {
      setSelectedColumns([]);
    } else {
      setSelectedColumns([...CSV_COLUMNS]);
    }
  };

  const handleExportCSV = () => {
    if (selectedColumns.length === 0) {
      showToast({
        type: 'error',
        title: 'No columns selected',
        message: 'Please select at least one column to export',
      });
      return;
    }

    onExport({ columns: selectedColumns, format: 'csv' });
    onClose();
  };

  const handleExportPDF = () => {
    if (selectedColumns.length === 0) {
      showToast({
        type: 'error',
        title: 'No columns selected',
        message: 'Please select at least one column to export',
      });
      return;
    }

    onExport({ columns: selectedColumns, format: 'pdf' });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onClose={onClose} fullWidth maxWidth="md" scroll="paper" disableScrollLock>
      <DialogTitle sx={{ pr: 7, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 800, fontSize: '1.25rem' }}>Export Requirements</span>
        <IconButton onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }} aria-label="Close">
          <X className="w-5 h-5" />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={3}>
          {/* Format Selection */}
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>
              Export Format
            </Typography>
            <RadioGroup
              row
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as 'csv' | 'pdf')}
            >
              <FormControlLabel
                value="csv"
                control={<Radio />}
                label={
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Table2 className="w-4 h-4" />
                    <span>CSV (Excel)</span>
                  </Stack>
                }
              />
              <FormControlLabel
                value="pdf"
                control={<Radio />}
                label={
                  <Stack direction="row" spacing={1} alignItems="center">
                    <FileText className="w-4 h-4" />
                    <span>PDF (Print)</span>
                  </Stack>
                }
              />
            </RadioGroup>
          </Box>

          {/* Column Selection */}
          <Box>
            <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                Columns to Export
              </Typography>
              <Button variant="text" size="small" onClick={handleSelectAll}>
                {selectedColumns.length === CSV_COLUMNS.length ? 'Deselect All' : 'Select All'}
              </Button>
            </Stack>

            <Paper variant="outlined" sx={{ p: 2, maxHeight: 360, overflowY: 'auto', bgcolor: 'grey.50' }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' }, gap: 1 }}>
                {CSV_COLUMNS.map((column) => (
                  <FormControlLabel
                    key={column}
                    control={
                      <Checkbox
                        checked={selectedColumns.includes(column)}
                        onChange={() => handleColumnToggle(column)}
                      />
                    }
                    label={<Typography variant="body2">{column.replace(/_/g, ' ')}</Typography>}
                  />
                ))}
              </Box>
            </Paper>
          </Box>

          {/* Summary */}
          <Paper variant="outlined" sx={{ p: 2, bgcolor: 'rgba(212,175,55,0.08)' }}>
            <Stack spacing={1}>
              <Typography variant="body2">
                You are about to export requirements with <strong>{selectedColumns.length}</strong> columns.
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                💡 <strong>Tip:</strong> Leave the date range empty in the report to export all data. If you set a date range before opening this dialog, only data within that range will be exported.
              </Typography>
            </Stack>
          </Paper>
        </Stack>
      </DialogContent>

      <DialogActions>
        {exportFormat === 'csv' ? (
          <BrandButton variant="primary" size="md" onClick={handleExportCSV}>
            <Download className="w-4 h-4 mr-2" />
            Export to CSV
          </BrandButton>
        ) : (
          <BrandButton variant="primary" size="md" onClick={handleExportPDF}>
            <Download className="w-4 h-4 mr-2" />
            Export to PDF
          </BrandButton>
        )}
        <BrandButton variant="secondary" size="md" onClick={onClose}>
          Cancel
        </BrandButton>
      </DialogActions>
    </Dialog>
  );
};

interface RequirementsReportProps {
  onClose: () => void;
}

export const RequirementsReport = ({ onClose }: RequirementsReportProps) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showExportModal, setShowExportModal] = useState(false);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  const [page, setPage] = useState(0);
  const [hasNextPage, setHasNextPage] = useState(true);
  const pageSize = 50;

  const [isExporting, setIsExporting] = useState(false);
  const [exportedRows, setExportedRows] = useState(0);
  const exportCancelRef = useRef(false);

  const dateFromIso = useMemo(() => (dateRange.start ? new Date(`${dateRange.start}T00:00:00`).toISOString() : undefined), [dateRange.start]);
  const dateToIso = useMemo(() => (dateRange.end ? new Date(`${dateRange.end}T23:59:59.999`).toISOString() : undefined), [dateRange.end]);

  const downloadBlob = useCallback((parts: BlobPart[], filename: string, mimeType: string) => {
    const blob = new Blob(parts, { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, []);

  const csvEscape = useCallback((value: unknown) => {
    if (value === null || value === undefined) return '';
    const s = String(value);
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }, []);

  const loadRequirements = useCallback(async (opts?: { newPage?: number }) => {
    if (!user) return;
    const requestedPage = opts?.newPage ?? page;
    setLoading(true);
    const result = await getRequirementsPage({
      userId: user.id,
      limit: pageSize,
      offset: requestedPage * pageSize,
      dateFrom: dateFromIso,
      dateTo: dateToIso,
      orderBy: 'created_at',
      orderDir: 'desc',
      includeCount: false,
    });
    if (result.success && result.requirements) {
      setRequirements(result.requirements);
      setHasNextPage(result.requirements.length === pageSize);
    } else if (result.error) {
      showToast({ type: 'error', title: 'Failed to load requirements', message: result.error });
    }
    setLoading(false);
  }, [user, showToast, page, pageSize, dateFromIso, dateToIso]);

  useEffect(() => {
    loadRequirements({ newPage: page });
  }, [loadRequirements, page]);

  useEffect(() => {
    setPage(0);
  }, [dateRange.start, dateRange.end]);

  const stats = useMemo(() => {
    const current = requirements;
    return {
      total: current.length,
      active: current.filter(r => r.status !== 'CLOSED' && r.status !== 'REJECTED').length,
      closed: current.filter(r => r.status === 'CLOSED').length,
      interview: current.filter(r => r.status === 'INTERVIEW').length,
      avgDaysOpen: Math.round(
        current.reduce((sum, r) => sum + calculateDaysOpen(r.created_at), 0) /
          (current.length || 1)
      ),
    };
  }, [requirements]);

  const handleExport = useCallback(async (opts: { columns: string[]; format: 'csv' | 'pdf' }) => {
    if (!user) return;

    if (opts.format === 'pdf') {
      const selectedColumns = opts.columns;
      const previewRequirements = requirements;

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Requirements Report</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            h1 { color: #1f2937; border-bottom: 2px solid #3b82f6; padding-bottom: 10px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { background-color: #3b82f6; color: white; padding: 10px; text-align: left; font-weight: bold; }
            td { padding: 8px; border-bottom: 1px solid #d1d5db; }
            tr:nth-child(even) { background-color: #f9fafb; }
          </style>
        </head>
        <body>
          <h1>Requirements Report (Page ${page + 1})</h1>
          <table>
            <thead>
              <tr>
                ${selectedColumns.map(col => `<th>${col.replace(/_/g, ' ').toUpperCase()}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${previewRequirements
                .map(req => `
                <tr>
                  ${selectedColumns
                    .map(col => {
                      const value = req[col as keyof Requirement];
                      if (col === 'created_at') return `<td>${new Date(value as string).toLocaleDateString()}</td>`;
                      return `<td>${value ?? '-'}</td>`;
                    })
                    .join('')}
                </tr>
              `)
                .join('')}
            </tbody>
          </table>
        </body>
        </html>
      `;

      const printWindow = window.open('', '', 'height=600,width=800');
      if (printWindow) {
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        setTimeout(() => {
          printWindow.print();
        }, 250);
      }

      showToast({
        type: 'info',
        title: 'PDF Export',
        message: 'PDF export is limited to the current page to avoid browser crashes. Use CSV to export all rows.',
      });
      return;
    }

    exportCancelRef.current = false;
    setIsExporting(true);
    setExportedRows(0);

    try {
      const limit = 1000;
      let cursorCreatedAt: string | undefined;
      let totalExported = 0;
      const csvParts: BlobPart[] = [];

      csvParts.push(`${opts.columns.join(',')}\n`);

      // Export all data if no date range is selected, otherwise respect the date filters
      while (true) {
        if (exportCancelRef.current) {
          showToast({ type: 'info', title: 'Export canceled', message: 'CSV export was canceled.' });
          return;
        }

        const res = await getRequirementsPage({
          userId: user.id,
          limit,
          cursor: cursorCreatedAt ? { created_at: cursorCreatedAt, direction: 'after' } : undefined,
          dateFrom: dateFromIso, // undefined if no date selected
          dateTo: dateToIso, // undefined if no date selected
          orderBy: 'created_at',
          orderDir: 'desc',
          includeCount: false,
        });

        if (!res.success || !res.requirements) {
          throw new Error(res.error || 'Failed to export requirements');
        }

        const batch = res.requirements;
        if (batch.length === 0) break;

        const lines = batch
          .map(req => opts.columns.map(col => csvEscape(req[col as keyof Requirement])).join(','))
          .join('\n');

        csvParts.push(`${lines}\n`);
        totalExported += batch.length;
        setExportedRows(totalExported);
        cursorCreatedAt = batch[batch.length - 1]?.created_at;

        if (batch.length < limit) break;

        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      }

      downloadBlob(csvParts, `requirements_${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
      showToast({
        type: 'success',
        title: 'Export successful',
        message: `${totalExported} requirements exported to CSV`,
      });
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Export failed',
        message: err instanceof Error ? err.message : 'Failed to export requirements',
      });
    } finally {
      setIsExporting(false);
    }
  }, [user, requirements, showToast, csvEscape, downloadBlob, page, dateFromIso, dateToIso]);

  if (loading) {
    return <div className="p-6 text-center text-gray-500">Loading report...</div>;
  }

  return (
    <>
      <Dialog open onClose={onClose} fullWidth maxWidth="lg" scroll="paper" disableScrollLock>
        <DialogTitle sx={{ pr: 7, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 800, fontSize: '1.25rem' }}>Requirements Report</span>
          <IconButton onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }} aria-label="Close">
            <X className="w-5 h-5" />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers>
          <Stack spacing={3}>
            {/* Date Range Filter */}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="From Date"
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                size="small"
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                label="To Date"
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                size="small"
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
            </Stack>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="bg-primary-50 border border-primary-200 rounded-lg p-4">
                <p className="text-gray-600 text-sm">Total</p>
                <p className="text-3xl font-bold text-primary-600">{stats.total}</p>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-gray-600 text-sm">Active</p>
                <p className="text-3xl font-bold text-green-600">{stats.active}</p>
              </div>
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <p className="text-gray-600 text-sm">Interview</p>
                <p className="text-3xl font-bold text-purple-600">{stats.interview}</p>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <p className="text-gray-600 text-sm">Closed</p>
                <p className="text-3xl font-bold text-gray-600">{stats.closed}</p>
              </div>
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                <p className="text-gray-600 text-sm">Avg Days Open</p>
                <p className="text-3xl font-bold text-orange-600">{stats.avgDaysOpen}</p>
              </div>
            </div>

            {/* Requirements Table with Scrolling */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-gray-700">Title</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-700">Implementation Partner</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-700">Status</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-700">Days Open</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-700">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requirements.map(req => (
                      <tr key={req.id} className="border-b border-gray-200 hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900 truncate">{req.title}</td>
                        <td className="px-4 py-3 text-gray-600 truncate">{req.implementation_partner || '-'}</td>
                        <td className="px-4 py-3">
                          <span className="inline-block px-2 py-1 rounded text-xs font-medium bg-primary-50 text-primary-800">
                            {req.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-center">{calculateDaysOpen(req.created_at)}</td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{new Date(req.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between" useFlexGap flexWrap="wrap">
              <Typography variant="body2" color="text.secondary">
                Page <strong>{page + 1}</strong>
              </Typography>
              <Stack direction="row" spacing={1}>
                <Button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0 || loading}
                  variant="outlined"
                  color="inherit"
                  size="small"
                >
                  Prev
                </Button>
                <Button
                  onClick={() => setPage(p => p + 1)}
                  disabled={!hasNextPage || loading}
                  variant="outlined"
                  color="inherit"
                  size="small"
                >
                  Next
                </Button>
              </Stack>
            </Stack>

            {isExporting && (
              <Paper variant="outlined" sx={{ p: 2, bgcolor: 'grey.50' }}>
                <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between" useFlexGap flexWrap="wrap">
                  <Typography variant="body2">
                    Exporting... <strong>{exportedRows}</strong> rows
                  </Typography>
                  <Button
                    onClick={() => {
                      exportCancelRef.current = true;
                    }}
                    variant="outlined"
                    color="inherit"
                    size="small"
                  >
                    Cancel
                  </Button>
                </Stack>
              </Paper>
            )}
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button
            onClick={() => setShowExportModal(true)}
            variant="contained"
            startIcon={<Download className="w-4 h-4" />}
          >
            Export
          </Button>
          <Button onClick={onClose} variant="outlined" color="inherit">
            Close
          </Button>
        </DialogActions>
      </Dialog>

      <ExportOptionsModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        onExport={handleExport}
      />
    </>
  );
};
