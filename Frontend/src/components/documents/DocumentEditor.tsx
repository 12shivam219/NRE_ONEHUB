import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Download, FileText, X } from 'lucide-react';
import { LogoLoader } from '../common/LogoLoader';
import { DownloadOptionsModal } from './DownloadOptionsModal';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../hooks/useAuth';
import { downloadDocument, saveDocumentToApp, saveDocumentToAppFolder } from '../../lib/api/documents';
import {
  fetchOnlyOfficeCallbackUrl,
  fetchOnlyOfficeConfigToken,
  forceSaveOnlyOfficeDocument,
  getOnlyOfficeCallbackUrl,
} from '../../lib/api/onlyoffice';
import {
  createOnlyOfficeDocumentKey,
  getOnlyOfficeDocumentServerUrl,
  getOnlyOfficeDocumentType,
  getOnlyOfficeFileType,
  isOnlyOfficeJwtDisabled,
  isOnlyOfficeConfigured,
  loadOnlyOfficeApi,
  type OnlyOfficeConfig,
  type OnlyOfficeDocEditorInstance,
} from '../../lib/onlyoffice';
import type { Database } from '../../lib/database.types';

type Document = Database['public']['Tables']['documents']['Row'];

interface DocumentEditorProps {
  documents: Document[];
  layout: 'single' | '2x2' | '3x3';
  onClose: () => void;
  onSave?: (documents: Document[]) => Promise<void>;
}

const PDF_MIME = 'application/pdf';

const isPdfDocument = (doc: Document) => {
  const fileName = (doc.original_filename || doc.filename || '').toLowerCase();
  return doc.mime_type === PDF_MIME || fileName.endsWith('.pdf');
};

const fetchDocumentBlob = async (doc: Document) => {
  const result = await downloadDocument(doc.storage_path);

  if (!result.success || !result.url) {
    throw new Error(result.error || 'Unable to create a download URL for this document');
  }

  const response = await fetch(result.url);
  if (!response.ok) {
    throw new Error(`Failed to fetch document contents (HTTP ${response.status})`);
  }

  return response.blob();
};

const downloadBlobLocally = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 100);
};

export const DocumentEditor = ({ documents, layout, onClose, onSave }: DocumentEditorProps) => {
  const { showToast } = useToast();
  const { user } = useAuth();
  const [documentsState, setDocumentsState] = useState<Document[]>(documents);
  const [editorConfigs, setEditorConfigs] = useState<Record<string, OnlyOfficeConfig>>({});
  const [pdfUrls, setPdfUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editedIds, setEditedIds] = useState<Set<string>>(new Set());
  const [showConfirmClose, setShowConfirmClose] = useState(false);
  const [showDownloadOptions, setShowDownloadOptions] = useState(false);
  const [documentToDownloadIndex, setDocumentToDownloadIndex] = useState<number | null>(null);
  const editorsRef = useRef<Record<string, OnlyOfficeDocEditorInstance>>({});
  const documentServerUrl = getOnlyOfficeDocumentServerUrl();

  useEffect(() => {
    setDocumentsState(documents);
  }, [documents]);

  useEffect(() => {
    return () => {
      Object.values(editorsRef.current).forEach((instance) => {
        instance.destroyEditor?.();
      });
      editorsRef.current = {};
    };
  }, []);

  useEffect(() => {
    return () => {
      Object.values(pdfUrls).forEach((url) => URL.revokeObjectURL(url));
    };
  }, [pdfUrls]);

  const columnsClass = useMemo(() => {
    if (layout === 'single') return 'grid-cols-1';
    if (layout === '2x2') return 'grid-cols-1 xl:grid-cols-2';
    return 'grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3';
  }, [layout]);

  const editedCount = editedIds.size;

  const forceSaveDocument = useCallback(
    async (doc: Document) => {
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      const result = await forceSaveOnlyOfficeDocument(doc.id, createOnlyOfficeDocumentKey(doc), user.id);
      if (!result.success || !result.document) {
        throw new Error(result.error || `Failed to save ${doc.original_filename}`);
      }

      setDocumentsState((prev) =>
        prev.map((item) => (item.id === result.document?.id ? result.document : item))
      );
      setEditedIds((prev) => {
        const next = new Set(prev);
        next.delete(doc.id);
        return next;
      });

      return result.document;
    },
    [user?.id]
  );

  useEffect(() => {
    let cancelled = false;

    const prepareEditors = async () => {
      setLoading(true);
      setInitError(null);

      if (!isOnlyOfficeConfigured()) {
        setInitError('ONLYOFFICE Docs is not configured. Add VITE_ONLYOFFICE_DOCUMENT_SERVER_URL to continue.');
        setLoading(false);
        return;
      }

      if (!user?.id) {
        setInitError('User not authenticated');
        setLoading(false);
        return;
      }

      try {
        const nextConfigs: Record<string, OnlyOfficeConfig> = {};
        const nextPdfUrls: Record<string, string> = {};
        const editableDocs = documentsState.filter((doc) => !isPdfDocument(doc));

        if (editableDocs.length > 0) {
          await loadOnlyOfficeApi(documentServerUrl);
        }

        await Promise.all(
          documentsState.map(async (doc) => {
            if (isPdfDocument(doc)) {
              const blob = await fetchDocumentBlob(doc);
              if (cancelled) return;
              nextPdfUrls[doc.id] = URL.createObjectURL(blob);
              return;
            }

            const signed = await downloadDocument(doc.storage_path);
            if (!signed.success || !signed.url) {
              throw new Error(signed.error || `Failed to load ${doc.original_filename}`);
            }

            let callbackUrl: string;
            try {
              callbackUrl = await fetchOnlyOfficeCallbackUrl(doc.id);
            } catch (callbackError) {
              if (import.meta.env.DEV) {
                console.warn(
                  'Signed ONLYOFFICE callback URL unavailable; falling back to legacy callback URL.',
                  callbackError
                );
                callbackUrl = getOnlyOfficeCallbackUrl(doc.id, user.id);
              } else {
                throw callbackError instanceof Error
                  ? callbackError
                  : new Error('Failed to build ONLYOFFICE callback URL');
              }
            }

            const config: OnlyOfficeConfig = {
              document: {
                fileType: getOnlyOfficeFileType(doc),
                key: createOnlyOfficeDocumentKey(doc),
                permissions: {
                  download: true,
                  edit: true,
                  print: true,
                },
                title: doc.original_filename || doc.filename || 'Document',
                url: signed.url,
              },
              documentType: getOnlyOfficeDocumentType(doc),
              editorConfig: {
                callbackUrl,
                customization: {
                  autosave: true,
                  compactHeader: false,
                  compactToolbar: false,
                  forcesave: true,
                  toolbarHideFileName: false,
                },
                mode: 'edit',
                user: {
                  id: user.id,
                  name: user.email || 'OneHub User',
                },
              },
              height: '100%',
              type: 'desktop',
              width: '100%',
            };

            if (!isOnlyOfficeJwtDisabled()) {
              config.token = await fetchOnlyOfficeConfigToken(doc.id, config);
            }
            nextConfigs[doc.id] = config;
          })
        );

        if (cancelled) {
          Object.values(nextPdfUrls).forEach((url) => URL.revokeObjectURL(url));
          return;
        }

        setEditorConfigs(nextConfigs);
        setPdfUrls((prev) => {
          Object.values(prev).forEach((url) => URL.revokeObjectURL(url));
          return nextPdfUrls;
        });
      } catch (error) {
        if (!cancelled) {
          setInitError(error instanceof Error ? error.message : 'Failed to initialize ONLYOFFICE');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void prepareEditors();

    return () => {
      cancelled = true;
    };
  }, [documentsState, documentServerUrl, user?.email, user?.id]);

  useEffect(() => {
    if (loading || initError || !user?.id) return;

    let cancelled = false;

    const mountEditors = async () => {
      const docsApi = await loadOnlyOfficeApi(documentServerUrl);

      documentsState.forEach((doc) => {
        if (isPdfDocument(doc)) return;

        const containerId = `onlyoffice-editor-${doc.id}`;
        const existing = editorsRef.current[doc.id];
        if (existing) {
          existing.destroyEditor?.();
        }

        const config = editorConfigs[doc.id];
        if (!config || cancelled) return;

        editorsRef.current[doc.id] = new docsApi.DocEditor(containerId, {
          ...config,
          events: {
            onDocumentStateChange: (event: { data?: boolean }) => {
              if (!event?.data) return;
              setEditedIds((prev) => new Set(prev).add(doc.id));
            },
            onError: (event: { data?: { errorDescription?: string } }) => {
              const message = event?.data?.errorDescription || `Editor failed to load for ${doc.original_filename}`;
              setInitError(message);
            },
          },
        });
      });
    };

    void mountEditors();

    return () => {
      cancelled = true;
      Object.values(editorsRef.current).forEach((instance) => {
        instance.destroyEditor?.();
      });
      editorsRef.current = {};
    };
  }, [documentsState, documentServerUrl, editorConfigs, initError, loading, user?.id]);

  const handleCloseWithConfirm = useCallback(() => {
    if (editedCount > 0) {
      setShowConfirmClose(true);
      return;
    }

    onClose();
  }, [editedCount, onClose]);

  const handleSaveAll = useCallback(async () => {
    if (!user?.id) {
      showToast({
        type: 'error',
        title: 'Save failed',
        message: 'User not authenticated',
      });
      return;
    }

    const docsToSave = documentsState.filter((doc) => !isPdfDocument(doc) && editedIds.has(doc.id));
    if (docsToSave.length === 0) {
      showToast({
        type: 'info',
        title: 'No changes to save',
        message: 'Edit a document in ONLYOFFICE first.',
      });
      return;
    }

    setSaving(true);

    let savedCount = 0;
    let failedCount = 0;

    try {
      for (const doc of docsToSave) {
        try {
          await forceSaveDocument(doc);
          savedCount += 1;
        } catch (error) {
          failedCount += 1;
          console.error(`ONLYOFFICE save failed for ${doc.original_filename}:`, error);
        }
      }

      showToast({
        type: failedCount === 0 ? 'success' : savedCount > 0 ? 'warning' : 'error',
        title: failedCount === 0 ? 'Documents saved' : savedCount > 0 ? 'Partial save' : 'Save failed',
        message:
          failedCount === 0
            ? `${savedCount} document(s) saved successfully`
            : savedCount > 0
              ? `${savedCount} document(s) saved, ${failedCount} failed`
              : 'Failed to save documents',
      });

      if (savedCount > 0 && failedCount === 0 && onSave) {
        await onSave(documentsState);
      }
    } finally {
      setSaving(false);
    }
  }, [documentsState, editedIds, forceSaveDocument, onSave, showToast, user?.id]);

  const ensureLatestDocument = useCallback(
    async (doc: Document) => {
      if (!isPdfDocument(doc) && editedIds.has(doc.id)) {
        return forceSaveDocument(doc);
      }

      return doc;
    },
    [editedIds, forceSaveDocument]
  );

  const handleDownloadEdited = useCallback((index: number, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    setDocumentToDownloadIndex(index);
    setShowDownloadOptions(true);
  }, []);

  const handleSaveAsCopy = useCallback(() => {
    if (documentsState.length === 0) return;
    setDocumentToDownloadIndex(0);
    setShowDownloadOptions(true);
  }, [documentsState.length]);

  const handleDownloadLocalFromEditor = useCallback(async () => {
    if (documentToDownloadIndex === null) return;

    const currentDoc = documentsState[documentToDownloadIndex];
    if (!currentDoc) return;

    try {
      const latestDoc = await ensureLatestDocument(currentDoc);
      const blob = await fetchDocumentBlob(latestDoc);
      downloadBlobLocally(blob, latestDoc.original_filename || latestDoc.filename || 'document');
      showToast({
        type: 'success',
        title: 'Download started',
        message: `${latestDoc.original_filename} is downloading`,
      });
    } catch (error) {
      showToast({
        type: 'error',
        title: 'Download failed',
        message: error instanceof Error ? error.message : 'Failed to download the document',
      });
    }
  }, [documentToDownloadIndex, documentsState, ensureLatestDocument, showToast]);

  const handleSaveToAppFromEditor = useCallback(async () => {
    if (documentToDownloadIndex === null || !user?.id) return;

    const currentDoc = documentsState[documentToDownloadIndex];
    if (!currentDoc) return;

    try {
      const latestDoc = await ensureLatestDocument(currentDoc);
      const blob = await fetchDocumentBlob(latestDoc);
      const result = await saveDocumentToApp(latestDoc.id, user.id, { blob });

      if (!result.success) {
        throw new Error(result.error || 'Failed to save document to app');
      }

      showToast({
        type: 'success',
        title: 'Saved to App',
        message: `${latestDoc.original_filename} has been saved to your app library`,
      });
    } catch (error) {
      showToast({
        type: 'error',
        title: 'Save failed',
        message: error instanceof Error ? error.message : 'Failed to save document to app',
      });
    }
  }, [documentToDownloadIndex, documentsState, ensureLatestDocument, showToast, user?.id]);

  const handleSaveToAppFolderFromEditor = useCallback(
    async (folderId: string | null) => {
      if (documentToDownloadIndex === null || !user?.id) return;

      const currentDoc = documentsState[documentToDownloadIndex];
      if (!currentDoc) return;

      try {
        const latestDoc = await ensureLatestDocument(currentDoc);
        const blob = await fetchDocumentBlob(latestDoc);
        const result = await saveDocumentToAppFolder(latestDoc.id, user.id, folderId, { blob });

        if (!result.success) {
          throw new Error(result.error || 'Failed to save document to folder');
        }

        showToast({
          type: 'success',
          title: 'Saved to App Folder',
          message: `${latestDoc.original_filename} has been saved to your application folder`,
        });
      } catch (error) {
        showToast({
          type: 'error',
          title: 'Save failed',
          message: error instanceof Error ? error.message : 'Failed to save document to app folder',
        });
      }
    },
    [documentToDownloadIndex, documentsState, ensureLatestDocument, showToast, user?.id]
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !showConfirmClose) {
        event.preventDefault();
        handleCloseWithConfirm();
      }

      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        if (!saving) {
          void handleSaveAll();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleCloseWithConfirm, handleSaveAll, saving, showConfirmClose]);

  const content = createPortal(
    <>
      <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 backdrop-blur-sm">
        <div className="min-h-screen px-4 py-4 sm:px-6 lg:px-10">
          <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-[1800px] flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.25)]">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] px-6 py-5">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  ONLYOFFICE Docs
                </div>
                <h2 className="mt-1 text-2xl font-bold tracking-[-0.02em] text-slate-900">
                  Document Editor
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {documentsState.length} document{documentsState.length === 1 ? '' : 's'} open
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleCloseWithConfirm}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  <X className="h-4 w-4" />
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleSaveAsCopy}
                  disabled={saving || documentsState.length === 0}
                  className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                  title="Choose where to save an edited copy"
                >
                  Save As Copy
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveAll()}
                  disabled={saving || editedCount === 0}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(15,23,42,0.22)] transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  title="Save all documents (Ctrl+S)"
                >
                  {saving && <LogoLoader size="sm" />}
                  {saving ? 'Saving In Place...' : `Save In Place (${editedCount})`}
                </button>
              </div>
            </div>

            {loading ? (
              <div className="flex flex-1 items-center justify-center bg-[radial-gradient(circle_at_top,#f8fafc_0%,#eef2ff_70%)]">
                <div className="flex flex-col items-center gap-3 rounded-3xl border border-slate-200 bg-white px-8 py-10 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
                  <LogoLoader label="Loading documents" />
                  <p className="text-sm text-slate-500">Preparing ONLYOFFICE editor...</p>
                </div>
              </div>
            ) : initError ? (
              <div className="flex flex-1 items-center justify-center bg-[radial-gradient(circle_at_top,#fff7ed_0%,#fff1f2_78%)] px-6 py-10">
                <div className="max-w-lg rounded-3xl border border-rose-200 bg-white px-8 py-8 text-center shadow-[0_20px_60px_rgba(244,63,94,0.12)]">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                    <AlertCircle className="h-6 w-6" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900">Editor unavailable</h3>
                  <p className="mt-2 text-sm text-slate-600">{initError}</p>
                </div>
              </div>
            ) : (
              <div className={`grid flex-1 gap-4 overflow-y-auto bg-[radial-gradient(circle_at_top,#f8fafc_0%,#eef2ff_70%)] p-4 sm:p-6 ${columnsClass}`}>
                {documentsState.map((doc, index) => {
                  const isPdf = isPdfDocument(doc);
                  const pdfUrl = pdfUrls[doc.id];

                  return (
                    <section
                      key={doc.id}
                      className="flex min-h-[620px] flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
                        <div className="min-w-0">
                          <h3 className="truncate text-lg font-semibold text-slate-900">
                            {doc.original_filename}
                          </h3>
                          <p className="mt-1 text-xs uppercase tracking-[0.12em] text-slate-400">
                            {isPdf ? 'PDF Preview' : 'ONLYOFFICE Editing'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {editedIds.has(doc.id) && (
                            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-100">
                              Unsaved changes
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={(event) => handleDownloadEdited(index, event)}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                            title="Download or save a copy"
                          >
                            <Download className="h-4 w-4" />
                            Export
                          </button>
                        </div>
                      </div>

                      <div className="flex-1 bg-slate-50">
                        {isPdf ? (
                          pdfUrl ? (
                            <iframe
                              src={pdfUrl}
                              title={doc.original_filename || doc.filename || 'PDF document'}
                              className="h-full min-h-[560px] w-full border-0"
                            />
                          ) : (
                            <div className="flex h-full min-h-[560px] items-center justify-center text-sm text-slate-500">
                              Loading PDF preview...
                            </div>
                          )
                        ) : (
                          <div
                            id={`onlyoffice-editor-${doc.id}`}
                            className="h-full min-h-[560px] w-full"
                          />
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {showConfirmClose && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_24px_70px_rgba(15,23,42,0.18)]">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Discard unsaved changes?</h3>
                <p className="text-sm text-slate-500">
                  ONLYOFFICE still has {editedCount} unsaved document change{editedCount === 1 ? '' : 's'}.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmClose(false)}
                className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Keep Editing
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowConfirmClose(false);
                  onClose();
                }}
                className="flex-1 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-500"
              >
                Close Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      <DownloadOptionsModal
        isOpen={showDownloadOptions}
        fileName={
          documentToDownloadIndex !== null
            ? documentsState[documentToDownloadIndex]?.original_filename || 'Document'
            : 'Document'
        }
        onClose={() => setShowDownloadOptions(false)}
        onDownloadLocal={handleDownloadLocalFromEditor}
        onSaveToApp={handleSaveToAppFromEditor}
        onSaveToAppFolder={handleSaveToAppFolderFromEditor}
      />
    </>,
    document.body
  );

  return content;
};
