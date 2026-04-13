import { useCallback, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../contexts/ToastContext';
import { useOfflineCache } from '../../hooks/useOfflineCache';
import { createRequirement } from '../../lib/api/requirements';
import { sanitizeText } from '../../lib/utils';
import { parseJD } from '../../lib/agents/jobExtractionAgent';
import { cacheRequirements, type CachedRequirement } from '../../lib/offlineDB';
import type { Database } from '../../lib/database.types';
import type { ExtractedJobDetails as JdExtractionResult } from '../../lib/agents/types';
import { ErrorAlert } from '../common/ErrorAlert';
import { BrandButton } from '../brand';
import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

type RequirementRow = Database['public']['Tables']['requirements']['Row'];

type ParsedJd = {
  extraction: JdExtractionResult;
  cleanedJobText: string;
};

type ExtractedUiItem = {
  id: string;
  parsed: ParsedJd;
  selected: boolean;
  validationError: string | null;
};

const makeRequirementPayload = (
  userId: string,
  extraction: JdExtractionResult,
  cleanedJobText: string
) => {
  const title = extraction.jobTitle ? sanitizeText(extraction.jobTitle) : '';
  const primaryTechStack = (extraction.keySkills ?? []).length
    ? (extraction.keySkills ?? []).join(', ')
    : '';

  const payload: Database['public']['Tables']['requirements']['Insert'] = {
    user_id: userId,
    title,
    implementation_partner: extraction.hiringCompany
      ? sanitizeText(extraction.hiringCompany)
      : null,
    description: cleanedJobText ? sanitizeText(cleanedJobText) : null,
    status: 'NEW',
    rate: extraction.rate ? extraction.rate : null,
    primary_tech_stack: primaryTechStack
      ? sanitizeText(primaryTechStack)
      : null,
    remote: extraction.workLocationType ?? null,
    duration: extraction.duration ?? null,
    vendor_company: extraction.vendor
      ? sanitizeText(extraction.vendor)
      : null,
    vendor_person_name: extraction.vendorContact
      ? sanitizeText(extraction.vendorContact)
      : null,
    vendor_phone: extraction.vendorPhone ?? null,
    vendor_email: extraction.vendorEmail ?? null,
    client: extraction.endClient
      ? sanitizeText(extraction.endClient)
      : null,
  };

  return payload;
};

export const JDParserDialog = ({
  open,
  onClose,
  onParsedData,
}: {
  open: boolean;
  onClose: () => void;
  onParsedData?: (extraction: JdExtractionResult, cleanedText: string) => void;
}) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { isOnline, queueOfflineOperation } = useOfflineCache();

  const [rawInput, setRawInput] = useState('');
  const [items, setItems] = useState<ExtractedUiItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const selectedCount = useMemo(
    () => items.filter((i) => i.selected).length,
    [items]
  );

  /* ======================================================
     PARSE HANDLER (ASYNC + HYBRID)
  ====================================================== */
  const handleParse = useCallback(async () => {
    setSubmitError(null);
    setLoading(true);

    const text = rawInput.trim();
    if (!text) {
      setItems([]);
      setLoading(false);
      showToast({
        type: 'error',
        title: 'Missing input',
        message: 'Paste at least one job description to parse.',
      });
      return;
    }

    try {
      // Lightweight JD splitting (safe, deterministic)
      
      const jdBlocks = [text.trim()];

      const results: ExtractedUiItem[] = [];

      for (let i = 0; i < jdBlocks.length; i++) {
        const block = jdBlocks[i];
        const extraction = await parseJD(block);

        const title = extraction.jobTitle;
        const validationError =
          title && title.trim().length >= 3
            ? null
            : 'Job title not found';

        results.push({
          id: `${Date.now()}-${i}`,
          parsed: {
            extraction,
            cleanedJobText: sanitizeText(block),
          },
          selected: validationError === null,
          validationError,
        });
      }

      setItems(results);

      if (results.length === 0) {
        showToast({
          type: 'error',
          title: 'No job descriptions found',
          message: 'Unable to detect a job description in the pasted text.',
        });
        return;
      }

      const invalid = results.filter((i) => i.validationError);
      if (invalid.length > 0) {
        showToast({
          type: 'info',
          title: 'Some items need review',
          message: `${invalid.length} item(s) could not be selected automatically.`,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Parsing failed';
      setSubmitError(msg);
      showToast({
        type: 'error',
        title: 'Parse failed',
        message: msg,
      });
    } finally {
      setLoading(false);
    }
  }, [rawInput, showToast]);

  const toggleSelectAll = useCallback((checked: boolean) => {
    setItems((prev) =>
      prev.map((i) => {
        if (i.validationError) return { ...i, selected: false };
        return { ...i, selected: checked };
      })
    );
  }, []);

  /* ======================================================
     SAVE HANDLER (WITH CALLBACK SUPPORT)
  ====================================================== */
  const handleSave = useCallback(async () => {
    if (!user || loading) return;

    const selected = items.filter((i) => i.selected);
    if (selected.length === 0) {
      showToast({
        type: 'error',
        title: 'Nothing selected',
        message: 'Select at least one extracted job to save.',
      });
      return;
    }

    // If callback is provided and only one item selected, pass data to form and close
    if (onParsedData && selected.length === 1) {
      const item = selected[0];
      onParsedData(item.parsed.extraction, item.parsed.cleanedJobText);
      onClose();
      return;
    }

    setSubmitError(null);
    setLoading(true);

    let successCount = 0;
    const errors: string[] = [];

    try {
      for (const item of selected) {
        const payload = makeRequirementPayload(
          user.id,
          item.parsed.extraction,
          item.parsed.cleanedJobText
        );

        if (!payload.title || payload.title.trim().length < 3) {
          errors.push('Job title not found');
          continue;
        }

        if (!isOnline) {
          const tempId = `temp-${Date.now()}-${Math.random()
            .toString(36)
            .substr(2, 9)}`;

          await queueOfflineOperation(
            'CREATE',
            'requirement',
            tempId,
            payload as unknown as Record<string, unknown>
          );

          const optimistic: RequirementRow = {
            id: tempId,
            requirement_number: 0,
            consultant_id: null,
            vendor_website: null,
            next_step: null,
            created_by: user.id,
            updated_by: user.id,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...payload,
          } as RequirementRow;

          await cacheRequirements(
            [optimistic as unknown as CachedRequirement],
            user.id
          );

          successCount++;
          continue;
        }

        const result = await createRequirement(payload, user.id);
        if (result.success) {
          successCount++;
          // Ensure we always dispatch a requirement object (fallback to optimistic)
          const createdRequirement = result.requirement || ({
            id: `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            requirement_number: 0,
            consultant_id: null,
            vendor_website: null,
            next_step: null,
            created_by: user.id,
            updated_by: user.id,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...payload,
          } as RequirementRow);

          window.dispatchEvent(
            new CustomEvent('requirement-created', {
              detail: createdRequirement,
            })
          );
        } else {
          errors.push(result.error || 'Failed to create requirement');
        }
      }

      if (successCount > 0 && errors.length === 0) {
        showToast({
          type: isOnline ? 'success' : 'info',
          title: isOnline ? 'Saved' : 'Queued for Sync',
          message: isOnline
            ? `${successCount} requirement(s) created.`
            : `${successCount} requirement(s) queued and will sync when back online.`,
        });
        onClose();
        return;
      }

      if (successCount > 0 && errors.length > 0) {
        showToast({
          type: 'info',
          title: 'Partially saved',
          message: `${successCount} saved, ${errors.length} failed.`,
        });
      } else if (successCount === 0 && errors.length > 0) {
        showToast({
          type: 'error',
          title: 'Failed to save',
          message: errors[0] || 'Failed to save extracted jobs.',
        });
      }

      setSubmitError(errors.length ? errors.join('\n') : null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unexpected error';
      setSubmitError(msg);
      showToast({
        type: 'error',
        title: 'Error',
        message: msg,
      });
    } finally {
      setLoading(false);
    }
  }, [
    user,
    loading,
    items,
    showToast,
    isOnline,
    queueOfflineOperation,
    onClose,
    onParsedData,
  ]);

  const canSelectAll = useMemo(
    () => items.some((i) => !i.validationError),
    [items]
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="lg"
      scroll="paper"
      disableScrollLock
      slotProps={{
        backdrop: {
          sx: {
            backdropFilter: 'blur(4px)',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
          },
        },
      }}
      sx={{
        '& .MuiBackdrop-root': {
          backdropFilter: 'blur(4px)',
        },
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <DialogTitle sx={{ pr: 7 }}>
        <Typography sx={{ fontWeight: 800 }}>JD Parser</Typography>
        <IconButton
          onClick={onClose}
          sx={{ position: 'absolute', right: 8, top: 8 }}
        >
          <X className="w-6 h-6" />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={2.5}>
          {submitError && (
            <ErrorAlert
              title="Error"
              message={submitError}
              onDismiss={() => setSubmitError(null)}
            />
          )}

          <TextField
            label="Paste job description(s)"
            placeholder="Paste recruiter email / job description text here"
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            fullWidth
            multiline
            minRows={10}
          />

          <Stack direction="row" spacing={1.5} alignItems="center">
            <BrandButton onClick={handleParse} disabled={loading}>
              Parse
            </BrandButton>

            <BrandButton
              variant="secondary"
              onClick={() => {
                setRawInput('');
                setItems([]);
                setSubmitError(null);
              }}
              disabled={loading}
            >
              Clear
            </BrandButton>

            <Box sx={{ flex: 1 }} />

            <FormControlLabel
              control={
                <Checkbox
                  checked={
                    canSelectAll &&
                    selectedCount > 0 &&
                    selectedCount ===
                      items.filter((i) => !i.validationError).length
                  }
                  indeterminate={
                    selectedCount > 0 &&
                    selectedCount <
                      items.filter((i) => !i.validationError).length
                  }
                  onChange={(e) => toggleSelectAll(e.target.checked)}
                  disabled={!canSelectAll}
                />
              }
              label="Select all"
            />
          </Stack>

          {items.length > 0 && (
            <Stack spacing={2}>
              <Typography sx={{ fontWeight: 800 }}>
                Extracted ({items.length})
              </Typography>

              {items.map((item, idx) => {
                const extraction = item.parsed.extraction;

                return (
                  <Paper key={item.id} variant="outlined" sx={{ p: 2 }}>
                    <Stack spacing={1.5}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Checkbox
                          checked={item.selected}
                          disabled={Boolean(item.validationError) || loading}
                          onChange={(e) =>
                            setItems((prev) =>
                              prev.map((p) =>
                                p.id === item.id
                                  ? {
                                      ...p,
                                      selected: e.target.checked,
                                    }
                                  : p
                              )
                            )
                          }
                        />
                        <Typography sx={{ fontWeight: 800 }}>
                          {idx + 1}. {extraction.jobTitle || 'Untitled'}
                        </Typography>
                      </Stack>

                      {item.validationError && (
                        <Typography color="error" variant="caption">
                          {item.validationError}
                        </Typography>
                      )}

                      <Box component="pre" sx={{ fontSize: 12 }}>
                        {JSON.stringify(extraction, null, 2)}
                      </Box>
                    </Stack>
                  </Paper>
                );
              })}
            </Stack>
          )}
        </Stack>
      </DialogContent>

      <DialogActions>
        <BrandButton
          onClick={handleSave}
          disabled={loading || selectedCount === 0 || !user}
        >
          {loading ? 'Processing...' : onParsedData && selectedCount === 1 ? 'Fill Form' : (isOnline ? 'Save' : 'Queue Save')}
        </BrandButton>
        <BrandButton variant="secondary" onClick={onClose} disabled={loading}>
          Close
        </BrandButton>
      </DialogActions>
    </Dialog>
  );
};
