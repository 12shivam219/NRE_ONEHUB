import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Download, X, FileText, Table2 } from 'lucide-react';
import { getRequirementsPage } from '../../lib/api/requirements';
import { getInterviewsByRequirementIdsPage } from '../../lib/api/interviews';
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
type Interview = Database['public']['Tables']['interviews']['Row'];
const CSV_EXPORT_BATCH_SIZE = 1000;
const INTERVIEW_EXPORT_BATCH_SIZE = 1000;
const INTERVIEW_EXPORT_MAX_ROWS = 50000;
const INTERVIEW_REQUIREMENT_ID_CHUNK_SIZE = 100;
const PDF_EXPORT_MAX_ROWS = 2000;
const PDF_INTERVIEW_SUMMARY_MAX_ROWS = 50000;

interface ExportOptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (opts: { columns: string[]; format: 'csv' | 'pdf'; scope: 'all' | 'filtered'; exportTarget: 'requirements_only' | 'requirements_and_interviews' | 'interviews_only' }) => void;
  estimatedRows: number | null;
  isEstimatingRows: boolean;
  onScopeChange: (scope: 'all' | 'filtered') => void;
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

const DEFAULT_SELECTED_COLUMNS = CSV_COLUMNS.filter((column) => column !== 'id');
const INTERVIEW_EXPORT_COLUMNS = [
  'requirement_number',
  'interview_id',
  'scheduled_date',
  'scheduled_time',
  'status',
  'round',
  'interviewer',
  'interview_with',
  'result',
  'mode',
  'duration_minutes',
  'notes',
  'created_at',
] as const;

type InterviewExportColumn = typeof INTERVIEW_EXPORT_COLUMNS[number];

export const ExportOptionsModal = ({
  isOpen,
  onClose,
  onExport,
  estimatedRows,
  isEstimatingRows,
  onScopeChange,
}: ExportOptionsModalProps) => {
  const { showToast } = useToast();
  const [selectedColumns, setSelectedColumns] = useState<string[]>(DEFAULT_SELECTED_COLUMNS);
  const [exportFormat, setExportFormat] = useState<'csv' | 'pdf'>('csv');
  const [exportScope, setExportScope] = useState<'all' | 'filtered'>('all');
  const [exportTarget, setExportTarget] = useState<'requirements_only' | 'requirements_and_interviews' | 'interviews_only'>('requirements_only');
  const isInterviewsOnly = exportTarget === 'interviews_only';
  const includeInterviews = exportTarget === 'requirements_and_interviews';

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
    if (!isInterviewsOnly && selectedColumns.length === 0) {
      showToast({
        type: 'error',
        title: 'No columns selected',
        message: 'Please select at least one column to export',
      });
      return;
    }

    onExport({ columns: selectedColumns, format: 'csv', scope: exportScope, exportTarget });
    onClose();
  };

  const handleExportPDF = () => {
    if (isInterviewsOnly) {
      showToast({
        type: 'error',
        title: 'Invalid PDF option',
        message: 'Interviews-only export is available in CSV format only.',
      });
      return;
    }
    if (selectedColumns.length === 0) {
      showToast({
        type: 'error',
        title: 'No columns selected',
        message: 'Please select at least one column to export',
      });
      return;
    }

    onExport({ columns: selectedColumns, format: 'pdf', scope: exportScope, exportTarget });
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
                control={<Radio disabled={isInterviewsOnly} />}
                label={
                  <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                    <FileText className="w-4 h-4" />
                    <span>PDF (Print)</span>
                    <Typography component="span" variant="caption" sx={{ color: 'warning.main', fontWeight: 700 }}>
                      Max {PDF_EXPORT_MAX_ROWS.toLocaleString()} rows
                    </Typography>
                  </Stack>
                }
              />
            </RadioGroup>
            {isInterviewsOnly && (
              <Typography variant="caption" sx={{ color: 'warning.dark', display: 'block', mt: 0.5 }}>
                Interviews-only export supports CSV only.
              </Typography>
            )}
          </Box>

          {/* Scope Selection */}
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>
              Export Scope
            </Typography>
            <RadioGroup
              value={exportScope}
              onChange={(e) => {
                const nextScope = e.target.value as 'all' | 'filtered';
                setExportScope(nextScope);
                onScopeChange(nextScope);
              }}
            >
              <FormControlLabel value="all" control={<Radio />} label="All requirements" />
              <FormControlLabel value="filtered" control={<Radio />} label="Only filtered results (active filters/date range)" />
            </RadioGroup>
          </Box>

          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>
              Export Data
            </Typography>
            <RadioGroup
              value={exportTarget}
              onChange={(e) => {
                const target = e.target.value as 'requirements_only' | 'requirements_and_interviews' | 'interviews_only';
                setExportTarget(target);
                if (target === 'interviews_only' && exportFormat === 'pdf') {
                  setExportFormat('csv');
                }
              }}
            >
              <FormControlLabel value="requirements_only" control={<Radio />} label="Requirements only" />
              <FormControlLabel value="requirements_and_interviews" control={<Radio />} label="Requirements + Interviews" />
              <FormControlLabel value="interviews_only" control={<Radio />} label="Interviews only" />
            </RadioGroup>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', pl: 4 }}>
              {exportTarget === 'requirements_only'
                ? 'Exports a single requirements file.'
                : exportTarget === 'requirements_and_interviews'
                  ? 'Exports requirements plus a second interviews CSV file.'
                  : 'Exports only the interviews CSV file.'}
            </Typography>
            {exportFormat === 'pdf' && includeInterviews && (
              <Typography variant="caption" sx={{ color: 'warning.dark', display: 'block', pl: 4, mt: 0.5 }}>
                PDF uses interview summary only for stability. Use CSV for full interview details.
              </Typography>
            )}
          </Box>

          {/* Column Selection */}
          {!isInterviewsOnly && (
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
          )}

          {/* Summary */}
          <Paper variant="outlined" sx={{ p: 2, bgcolor: 'rgba(212,175,55,0.08)' }}>
            <Stack spacing={1}>
              <Typography variant="body2">
                {isInterviewsOnly
                  ? 'You are about to export interviews only.'
                  : <>You are about to export requirements with <strong>{selectedColumns.length}</strong> columns.</>}
              </Typography>
              <Typography variant="body2">
                Rows to export:{' '}
                <strong>
                  {isEstimatingRows
                    ? 'calculating...'
                    : (estimatedRows ?? 0).toLocaleString()}
                </strong>
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                💡 <strong>Tip:</strong> {exportScope === 'all'
                  ? 'CSV includes all requirements from the database. PDF is safety-limited for browser stability.'
                  : 'Export uses your active search/filters/date range from this report. PDF is safety-limited for browser stability.'}
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
  initialFilters?: {
    search: string;
    status: string | 'ALL';
    minRate?: string;
    maxRate?: string;
    remoteFilter?: 'ALL' | 'REMOTE' | 'ONSITE';
    sortBy: 'date' | 'company' | 'daysOpen';
    sortOrder: 'asc' | 'desc';
  };
  initialDateRange?: {
    start: string;
    end: string;
  };
}

export const RequirementsReport = ({ onClose, initialFilters, initialDateRange }: RequirementsReportProps) => {
  const { showToast } = useToast();
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showExportModal, setShowExportModal] = useState(false);
  const [dateRange, setDateRange] = useState({
    start: initialDateRange?.start || '',
    end: initialDateRange?.end || '',
  });

  const [page, setPage] = useState(0);
  const [hasNextPage, setHasNextPage] = useState(true);
  const pageSize = 50;

  const [isExporting, setIsExporting] = useState(false);
  const [exportedRows, setExportedRows] = useState(0);
  const exportCancelRef = useRef(false);
  const [estimatedRows, setEstimatedRows] = useState<number | null>(null);
  const [isEstimatingRows, setIsEstimatingRows] = useState(false);

  const orderByColumn = useMemo(() => {
    if (initialFilters?.sortBy === 'company') return 'implementation_partner';
    return 'created_at';
  }, [initialFilters?.sortBy]);

  const orderDir = initialFilters?.sortOrder || 'desc';
  const activeSearch = initialFilters?.search || '';
  const activeStatus = initialFilters?.status || 'ALL';
  const activeMinRate = initialFilters?.minRate || undefined;
  const activeMaxRate = initialFilters?.maxRate || undefined;
  const activeRemoteFilter = initialFilters?.remoteFilter || 'ALL';

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

  type SaveFilePickerWindow = Window & {
    showSaveFilePicker?: (options?: {
      suggestedName?: string;
      types?: Array<{
        description?: string;
        accept: Record<string, string[]>;
      }>;
    }) => Promise<{
      createWritable: () => Promise<{
        write: (data: BlobPart) => Promise<void>;
        close: () => Promise<void>;
        abort?: () => Promise<void>;
      }>;
    }>;
  };

  const csvEscape = useCallback((value: unknown) => {
    if (value === null || value === undefined) return '';
    const s = String(value);
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }, []);

  const getInterviewExportValue = useCallback((
    interview: Interview,
    column: InterviewExportColumn,
    requirementNumberById: Map<string, string>
  ): unknown => {
    if (column === 'requirement_number') {
      return requirementNumberById.get(interview.requirement_id) || '';
    }
    if (column === 'interview_id') {
      return interview.interview_number || '';
    }
    return interview[column as keyof Interview];
  }, []);

  const htmlEscape = useCallback((value: unknown) => {
    if (value === null || value === undefined) return '-';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }, []);

  const loadRequirements = useCallback(async (opts?: { newPage?: number }) => {
    const requestedPage = opts?.newPage ?? page;
    setLoading(true);
    const result = await getRequirementsPage({
      limit: pageSize,
      offset: requestedPage * pageSize,
      dateFrom: dateFromIso,
      dateTo: dateToIso,
      orderBy: orderByColumn,
      orderDir,
      search: activeSearch || undefined,
      status: activeStatus || undefined,
      minRate: activeMinRate,
      maxRate: activeMaxRate,
      remoteFilter: activeRemoteFilter,
      includeCount: false,
    });
    if (result.success && result.requirements) {
      setRequirements(result.requirements);
      setHasNextPage(result.requirements.length === pageSize);
    } else if (result.error) {
      showToast({ type: 'error', title: 'Failed to load requirements', message: result.error });
    }
    setLoading(false);
  }, [showToast, page, pageSize, dateFromIso, dateToIso, orderByColumn, orderDir, activeSearch, activeStatus, activeMinRate, activeMaxRate, activeRemoteFilter]);

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

  const streamRequirementsForExport = useCallback(async (
    scope: 'all' | 'filtered',
    onBatch: (batch: Requirement[]) => Promise<boolean | void> | boolean | void
  ) => {
    const limit = CSV_EXPORT_BATCH_SIZE;
    let offset = 0;
    let totalRows = 0;

    while (true) {
      if (exportCancelRef.current) {
        showToast({ type: 'info', title: 'Export canceled', message: 'Export was canceled.' });
        return null;
      }

      const res = await getRequirementsPage({
        limit,
        offset,
        dateFrom: scope === 'filtered' ? dateFromIso : undefined,
        dateTo: scope === 'filtered' ? dateToIso : undefined,
        orderBy: orderByColumn,
        orderDir,
        search: scope === 'filtered' ? (activeSearch || undefined) : undefined,
        status: scope === 'filtered' ? (activeStatus || undefined) : undefined,
        minRate: scope === 'filtered' ? activeMinRate : undefined,
        maxRate: scope === 'filtered' ? activeMaxRate : undefined,
        remoteFilter: scope === 'filtered' ? activeRemoteFilter : undefined,
        includeCount: false,
      });

      if (!res.success || !res.requirements) {
        throw new Error(res.error || 'Failed to export requirements');
      }

      const batch = res.requirements;
      if (batch.length === 0) break;

      const shouldContinue = await onBatch(batch);
      totalRows += batch.length;
      setExportedRows(totalRows);
      if (shouldContinue === false) break;

      if (batch.length < limit) break;
      offset += limit;
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    }

    return totalRows;
  }, [showToast, dateFromIso, dateToIso, orderByColumn, orderDir, activeSearch, activeStatus, activeMinRate, activeMaxRate, activeRemoteFilter]);

  const streamInterviewsForRequirementIds = useCallback(async (
    requirementIds: string[],
    onBatch: (batch: Interview[]) => Promise<boolean | void> | boolean | void
  ) => {
    if (requirementIds.length === 0) return 0;
    let totalRows = 0;
    for (let i = 0; i < requirementIds.length; i += INTERVIEW_REQUIREMENT_ID_CHUNK_SIZE) {
      const requirementIdChunk = requirementIds.slice(i, i + INTERVIEW_REQUIREMENT_ID_CHUNK_SIZE);
      let offset = 0;
      while (true) {
        if (exportCancelRef.current) return null;
        const res = await getInterviewsByRequirementIdsPage({
          requirementIds: requirementIdChunk,
          limit: INTERVIEW_EXPORT_BATCH_SIZE,
          offset,
        });
        if (!res.success || !res.interviews) {
          throw new Error(res.error || 'Failed to export interviews');
        }
        const batch = res.interviews as Interview[];
        if (batch.length === 0) break;
        const shouldContinue = await onBatch(batch);
        totalRows += batch.length;
        if (shouldContinue === false) return totalRows;
        if (batch.length < INTERVIEW_EXPORT_BATCH_SIZE) break;
        offset += INTERVIEW_EXPORT_BATCH_SIZE;
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
    }
    return totalRows;
  }, []);

  const estimateExportRows = useCallback(async (scope: 'all' | 'filtered') => {
    const res = await getRequirementsPage({
      limit: 1,
      offset: 0,
      dateFrom: scope === 'filtered' ? dateFromIso : undefined,
      dateTo: scope === 'filtered' ? dateToIso : undefined,
      orderBy: orderByColumn,
      orderDir,
      search: scope === 'filtered' ? (activeSearch || undefined) : undefined,
      status: scope === 'filtered' ? (activeStatus || undefined) : undefined,
      minRate: scope === 'filtered' ? activeMinRate : undefined,
      maxRate: scope === 'filtered' ? activeMaxRate : undefined,
      remoteFilter: scope === 'filtered' ? activeRemoteFilter : undefined,
      includeCount: true,
    });
    if (!res.success) {
      throw new Error(res.error || 'Failed to estimate export rows');
    }
    return res.total ?? res.requirements?.length ?? 0;
  }, [
    dateFromIso,
    dateToIso,
    orderByColumn,
    orderDir,
    activeSearch,
    activeStatus,
    activeMinRate,
    activeMaxRate,
    activeRemoteFilter,
  ]);

  const requestExportEstimate = useCallback(async (scope: 'all' | 'filtered') => {
    setIsEstimatingRows(true);
    try {
      const count = await estimateExportRows(scope);
      setEstimatedRows(count);
    } catch {
      setEstimatedRows(null);
    } finally {
      setIsEstimatingRows(false);
    }
  }, [estimateExportRows]);

  const openExportModal = useCallback(() => {
    setShowExportModal(true);
    void requestExportEstimate('all');
  }, [requestExportEstimate]);

  const handleExport = useCallback(async (opts: { columns: string[]; format: 'csv' | 'pdf'; scope: 'all' | 'filtered'; exportTarget: 'requirements_only' | 'requirements_and_interviews' | 'interviews_only' }) => {
    exportCancelRef.current = false;
    setIsExporting(true);
    setExportedRows(0);

    try {
      const selectedColumns = opts.columns;
      const today = new Date().toISOString().split('T')[0];
      const exportRequirements = opts.exportTarget !== 'interviews_only';
      const exportInterviews = opts.exportTarget !== 'requirements_only';

      if (opts.format === 'pdf') {
        if (!exportRequirements) {
          showToast({
            type: 'error',
            title: 'Invalid export option',
            message: 'Interviews-only export is available in CSV format only.',
          });
          return;
        }
        const pdfRows: Requirement[] = [];
        let exceededPdfLimit = false;
        const interviewSummaryByRequirementId = new Map<string, { count: number; latestStatus: string; latestDate: string }>();
        let pdfInterviewRowsProcessed = 0;
        let pdfInterviewSummaryTruncated = false;
        const totalRows = await streamRequirementsForExport(opts.scope, (batch) => {
          const remaining = PDF_EXPORT_MAX_ROWS - pdfRows.length;
          if (remaining <= 0) {
            exceededPdfLimit = true;
            return false;
          }
          if (batch.length > remaining) {
            pdfRows.push(...batch.slice(0, remaining));
            exceededPdfLimit = true;
            return false;
          }
          pdfRows.push(...batch);
        });
        if (totalRows === null) return;

        if (exceededPdfLimit) {
          showToast({
            type: 'error',
            title: 'PDF export too large',
            message: `PDF export is limited to ${PDF_EXPORT_MAX_ROWS.toLocaleString()} rows to prevent browser crashes. Use CSV for full export.`,
          });
          return;
        }

        if (exportInterviews && pdfRows.length > 0) {
          const requirementIds = pdfRows.map((row) => row.id);
          await streamInterviewsForRequirementIds(requirementIds, (interviewBatch) => {
            const remaining = PDF_INTERVIEW_SUMMARY_MAX_ROWS - pdfInterviewRowsProcessed;
            if (remaining <= 0) {
              pdfInterviewSummaryTruncated = true;
              return false;
            }
            const exportBatch = interviewBatch.slice(0, remaining);
            for (const interview of exportBatch) {
              const key = interview.requirement_id;
              const current = interviewSummaryByRequirementId.get(key);
              const candidateDate = interview.scheduled_date || interview.created_at || '';
              if (!current) {
                interviewSummaryByRequirementId.set(key, {
                  count: 1,
                  latestStatus: interview.status || '-',
                  latestDate: candidateDate,
                });
                continue;
              }
              const shouldReplace = candidateDate > current.latestDate;
              interviewSummaryByRequirementId.set(key, {
                count: current.count + 1,
                latestStatus: shouldReplace ? (interview.status || '-') : current.latestStatus,
                latestDate: shouldReplace ? candidateDate : current.latestDate,
              });
            }
            pdfInterviewRowsProcessed += exportBatch.length;
            if (exportBatch.length < interviewBatch.length) {
              pdfInterviewSummaryTruncated = true;
              return false;
            }
          });
        }

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
          <h1>Requirements Report</h1>
          ${exportInterviews && pdfInterviewSummaryTruncated
            ? `<p style="color:#92400e;background:#fef3c7;border:1px solid #f59e0b;padding:8px;border-radius:6px;">
                 Interview summary was truncated at ${PDF_INTERVIEW_SUMMARY_MAX_ROWS.toLocaleString()} interview rows for browser stability.
               </p>`
            : ''
          }
          <table>
            <thead>
              <tr>
                ${selectedColumns.map(col => `<th>${col.replace(/_/g, ' ').toUpperCase()}</th>`).join('')}
                ${exportInterviews ? '<th>INTERVIEW COUNT</th><th>LATEST INTERVIEW STATUS</th><th>LATEST INTERVIEW DATE</th>' : ''}
              </tr>
            </thead>
            <tbody>
              ${pdfRows
                .map(req => `
                <tr>
                  ${selectedColumns
                    .map(col => {
                      const value = req[col as keyof Requirement];
                      if (col === 'created_at') return `<td>${htmlEscape(new Date(value as string).toLocaleDateString())}</td>`;
                      return `<td>${htmlEscape(value)}</td>`;
                    })
                    .join('')}
                  ${exportInterviews
                    ? (() => {
                        const summary = interviewSummaryByRequirementId.get(req.id);
                        const latestDate = summary?.latestDate ? new Date(summary.latestDate).toLocaleDateString() : '-';
                        const latestStatus = summary?.latestStatus || '-';
                        const count = summary?.count ?? 0;
                        return `<td>${count}</td><td>${htmlEscape(latestStatus)}</td><td>${htmlEscape(latestDate)}</td>`;
                      })()
                    : ''
                  }
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
        type: 'success',
        title: 'PDF Export',
        message: exportInterviews
          ? `${pdfRows.length} requirements prepared for PDF print with interview summary.`
          : `${pdfRows.length} requirements prepared for PDF print.`,
      });
      return;
      }

      const csvFilename = `requirements_${today}.csv`;
      const interviewsFilename = `interviews_${today}.csv`;
      const pickerWindow = window as SaveFilePickerWindow;
      const canStreamToDisk = typeof pickerWindow.showSaveFilePicker === 'function';
      const precheck = await getRequirementsPage({
        limit: 1,
        offset: 0,
        dateFrom: opts.scope === 'filtered' ? dateFromIso : undefined,
        dateTo: opts.scope === 'filtered' ? dateToIso : undefined,
        orderBy: orderByColumn,
        orderDir,
        search: opts.scope === 'filtered' ? (activeSearch || undefined) : undefined,
        status: opts.scope === 'filtered' ? (activeStatus || undefined) : undefined,
        minRate: opts.scope === 'filtered' ? activeMinRate : undefined,
        maxRate: opts.scope === 'filtered' ? activeMaxRate : undefined,
        remoteFilter: opts.scope === 'filtered' ? activeRemoteFilter : undefined,
        includeCount: false,
      });
      if (!precheck.success) {
        throw new Error(precheck.error || 'Failed to prepare export');
      }
      if (!precheck.requirements || precheck.requirements.length === 0) {
        showToast({
          type: 'info',
          title: 'No data to export',
          message: opts.scope === 'filtered'
            ? 'No requirements matched your current filters/date range.'
            : 'No requirements found to export.',
        });
        return;
      }

      if (canStreamToDisk) {
        type WritableStreamHandle = {
          write: (data: BlobPart) => Promise<void>;
          close: () => Promise<void>;
          abort?: () => Promise<void>;
        };
        let writable: WritableStreamHandle | null = null;
        let interviewWritable: WritableStreamHandle | null = null;
        let closedRequirementsStream = false;
        let closedInterviewStream = false;
        try {
          if (exportRequirements) {
            const handle = await pickerWindow.showSaveFilePicker!({
              suggestedName: csvFilename,
              types: [{ description: 'CSV file', accept: { 'text/csv': ['.csv'] } }],
            });
            writable = await handle.createWritable();
            await writable.write(`${opts.columns.join(',')}\n`);
          }
          let interviewRows = 0;
          let interviewLimitReached = false;
          if (exportInterviews) {
            const interviewHandle = await pickerWindow.showSaveFilePicker!({
              suggestedName: interviewsFilename,
              types: [{ description: 'CSV file', accept: { 'text/csv': ['.csv'] } }],
            });
            interviewWritable = await interviewHandle.createWritable();
            await interviewWritable!.write(`${INTERVIEW_EXPORT_COLUMNS.join(',')}\n`);
          }
          const totalRows = await streamRequirementsForExport(opts.scope, async (batch) => {
            const requirementNumberById = new Map<string, string>(
              batch.map((req) => [req.id, req.requirement_number ? String(req.requirement_number) : ''])
            );
            const lines = batch
              .map(req => opts.columns.map(col => csvEscape(req[col as keyof Requirement])).join(','))
              .join('\n');
            if (writable) {
              await writable.write(`${lines}\n`);
            }
            if (interviewWritable && batch.length > 0 && !interviewLimitReached) {
              const requirementIds = batch.map((req) => req.id);
              await streamInterviewsForRequirementIds(requirementIds, async (interviewBatch) => {
                const remaining = INTERVIEW_EXPORT_MAX_ROWS - interviewRows;
                if (remaining <= 0) {
                  interviewLimitReached = true;
                  return false;
                }
                const exportBatch = interviewBatch.slice(0, remaining);
                const interviewLines = exportBatch
                  .map((interview) => INTERVIEW_EXPORT_COLUMNS
                    .map((col) => csvEscape(getInterviewExportValue(interview, col, requirementNumberById)))
                    .join(','))
                  .join('\n');
                await interviewWritable!.write(`${interviewLines}\n`);
                interviewRows += exportBatch.length;
                if (exportBatch.length < interviewBatch.length) {
                  interviewLimitReached = true;
                  return false;
                }
              });
            }
          });
          if (totalRows === null) {
            if (writable) {
              await writable.close();
              closedRequirementsStream = true;
            }
            if (interviewWritable) {
              await interviewWritable.close();
              closedInterviewStream = true;
            }
            return;
          }
          if (writable) {
            await writable.close();
            closedRequirementsStream = true;
          }
          if (interviewWritable) {
            await interviewWritable.close();
            closedInterviewStream = true;
          }
          showToast({
            type: 'success',
            title: 'Export successful',
            message: exportInterviews && exportRequirements
              ? interviewLimitReached
                ? `${totalRows.toLocaleString()} requirements exported. Interviews capped at ${INTERVIEW_EXPORT_MAX_ROWS.toLocaleString()} rows for stability (exported ${interviewRows.toLocaleString()}).`
                : `${totalRows.toLocaleString()} requirements and ${interviewRows.toLocaleString()} interviews exported to CSV`
              : exportInterviews
                ? interviewLimitReached
                  ? `Interviews exported to CSV (capped at ${INTERVIEW_EXPORT_MAX_ROWS.toLocaleString()} rows, exported ${interviewRows.toLocaleString()}).`
                  : `${interviewRows.toLocaleString()} interviews exported to CSV`
                : `${totalRows.toLocaleString()} requirements exported to CSV`,
          });
          return;
        } catch (err) {
          if ((err as { name?: string }).name === 'AbortError') {
            showToast({
              type: 'info',
              title: 'Export canceled',
              message: 'File save was canceled.',
            });
            return;
          }
          throw err;
        } finally {
          if (writable && !closedRequirementsStream && typeof writable.abort === 'function') {
            try {
              await writable.abort();
            } catch {
              // Ignore cleanup errors from partially opened streams.
            }
          }
          if (interviewWritable && !closedInterviewStream && typeof interviewWritable.abort === 'function') {
            try {
              await interviewWritable.abort();
            } catch {
              // Ignore cleanup errors from partially opened streams.
            }
          }
        }
      }

      const csvParts: BlobPart[] = exportRequirements ? [`${opts.columns.join(',')}\n`] : [];
      const interviewParts: BlobPart[] = exportInterviews ? [`${INTERVIEW_EXPORT_COLUMNS.join(',')}\n`] : [];
      let interviewRows = 0;
      let interviewLimitReached = false;
      const totalRows = await streamRequirementsForExport(opts.scope, async (batch) => {
        const requirementNumberById = new Map<string, string>(
          batch.map((req) => [req.id, req.requirement_number ? String(req.requirement_number) : ''])
        );
        const lines = batch
          .map(req => opts.columns.map(col => csvEscape(req[col as keyof Requirement])).join(','))
          .join('\n');
        if (exportRequirements) {
          csvParts.push(`${lines}\n`);
        }
        if (exportInterviews && batch.length > 0 && !interviewLimitReached) {
          const requirementIds = batch.map((req) => req.id);
          await streamInterviewsForRequirementIds(requirementIds, (interviewBatch) => {
            const remaining = INTERVIEW_EXPORT_MAX_ROWS - interviewRows;
            if (remaining <= 0) {
              interviewLimitReached = true;
              return false;
            }
            const exportBatch = interviewBatch.slice(0, remaining);
            const interviewLines = exportBatch
              .map((interview) => INTERVIEW_EXPORT_COLUMNS
                .map((col) => csvEscape(getInterviewExportValue(interview, col, requirementNumberById)))
                .join(','))
              .join('\n');
            interviewParts.push(`${interviewLines}\n`);
            interviewRows += exportBatch.length;
            if (exportBatch.length < interviewBatch.length) {
              interviewLimitReached = true;
              return false;
            }
          });
        }
      });
      if (totalRows === null) return;
      if (exportRequirements) {
        downloadBlob(csvParts, csvFilename, 'text/csv');
      }
      if (exportInterviews) {
        downloadBlob(interviewParts, interviewsFilename, 'text/csv');
      }
      showToast({
        type: 'success',
        title: 'Export successful',
        message: exportInterviews && exportRequirements
          ? interviewLimitReached
            ? `${totalRows.toLocaleString()} requirements exported. Interviews capped at ${INTERVIEW_EXPORT_MAX_ROWS.toLocaleString()} rows for stability (exported ${interviewRows.toLocaleString()}).`
            : `${totalRows.toLocaleString()} requirements and ${interviewRows.toLocaleString()} interviews exported to CSV`
          : exportInterviews
            ? interviewLimitReached
              ? `Interviews exported to CSV (capped at ${INTERVIEW_EXPORT_MAX_ROWS.toLocaleString()} rows, exported ${interviewRows.toLocaleString()}).`
              : `${interviewRows.toLocaleString()} interviews exported to CSV`
            : `${totalRows.toLocaleString()} requirements exported to CSV`,
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
  }, [
    showToast,
    csvEscape,
    getInterviewExportValue,
    htmlEscape,
    downloadBlob,
    streamRequirementsForExport,
    streamInterviewsForRequirementIds,
    dateFromIso,
    dateToIso,
    orderByColumn,
    orderDir,
    activeSearch,
    activeStatus,
    activeMinRate,
    activeMaxRate,
    activeRemoteFilter,
  ]);

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
            onClick={openExportModal}
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
        estimatedRows={estimatedRows}
        isEstimatingRows={isEstimatingRows}
        onScopeChange={requestExportEstimate}
      />
    </>
  );
};
