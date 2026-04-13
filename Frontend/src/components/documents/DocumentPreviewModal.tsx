import { useCallback, useEffect, useState } from 'react';
import { Download, ExternalLink, Eye, FileText } from 'lucide-react';
import { Modal } from '../common/Modal';
import { downloadDocument, saveDocumentToApp, saveDocumentToAppFolder } from '../../lib/api/documents';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../hooks/useAuth';
import { DownloadOptionsModal } from './DownloadOptionsModal';
import {
  createOnlyOfficeDocumentKey,
  getOnlyOfficeDocumentServerUrl,
  getOnlyOfficeDocumentType,
  getOnlyOfficeFileType,
  isOnlyOfficeConfigured,
  loadOnlyOfficeApi,
  type OnlyOfficeConfig,
} from '../../lib/onlyoffice';
import { getOnlyOfficeCallbackUrl } from '../../lib/api/onlyoffice';
import type { Database } from '../../lib/database.types';

type Document = Database['public']['Tables']['documents']['Row'];

interface DocumentPreviewModalProps {
  isOpen: boolean;
  document: Document | null;
  onClose: () => void;
}

const PDF_MIME = 'application/pdf';

const isPdfDocument = (doc: Document) => {
  const fileName = (doc.original_filename || doc.filename || '').toLowerCase();
  return doc.mime_type === PDF_MIME || fileName.endsWith('.pdf');
};

export const DocumentPreviewModal = ({ isOpen, document, onClose }: DocumentPreviewModalProps) => {
  const { showToast } = useToast();
  const { user } = useAuth();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showDownloadOptions, setShowDownloadOptions] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const documentServerUrl = getOnlyOfficeDocumentServerUrl();

  const fileName = document?.original_filename || document?.filename || 'Document';
  const fileExtension = fileName.includes('.') ? fileName.split('.').pop()?.toUpperCase() : null;
  const isPdf = Boolean(document && isPdfDocument(document));

  const handleDownloadClick = useCallback((event?: React.MouseEvent) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    setShowDownloadOptions(true);
  }, []);

  const handleDownloadLocal = useCallback(async () => {
    if (!document) return;

    try {
      const result = await downloadDocument(document.storage_path);
      if (!result.success || !result.url) {
        throw new Error(result.error || 'Unable to download document');
      }

      window.open(result.url, '_blank', 'noopener,noreferrer');
      showToast({
        type: 'success',
        title: 'Download started',
        message: `${document.original_filename} is downloading.`,
      });
    } catch (error) {
      showToast({
        type: 'error',
        title: 'Download failed',
        message: error instanceof Error ? error.message : 'Unable to download document',
      });
    }
  }, [document, showToast]);

  const handleSaveToApp = useCallback(async () => {
    if (!document || !user?.id) return;

    const result = await saveDocumentToApp(document.id, user.id);
    if (result.success) {
      showToast({
        type: 'success',
        title: 'Saved to App',
        message: `${document.original_filename} has been saved to your app library.`,
      });
      return;
    }

    showToast({
      type: 'error',
      title: 'Failed to save to app',
      message: result.error || 'Unable to save document',
    });
  }, [document, showToast, user?.id]);

  const handleSaveToAppFolder = useCallback(
    async (folderId: string | null) => {
      if (!document || !user?.id) return;

      const result = await saveDocumentToAppFolder(document.id, user.id, folderId);
      if (result.success) {
        showToast({
          type: 'success',
          title: 'Saved to App Folder',
          message: `${document.original_filename} has been saved to your application folder.`,
        });
        return;
      }

      showToast({
        type: 'error',
        title: 'Failed to save to app folder',
        message: result.error || 'Unable to save document',
      });
    },
    [document, showToast, user?.id]
  );

  useEffect(() => {
    if (!isOpen || !document) return;

    let cancelled = false;
    let currentPdfUrl: string | null = null;
    let previewInstance: { destroyEditor?: () => void } | null = null;

    const loadPreview = async () => {
      setIsLoadingPreview(true);
      setPreviewError(null);
      setPreviewUrl(null);

      try {
        const signed = await downloadDocument(document.storage_path);
        if (!signed.success || !signed.url) {
          throw new Error(signed.error || 'Preview could not be loaded');
        }

        if (isPdfDocument(document)) {
          const response = await fetch(signed.url);
          if (!response.ok) {
            throw new Error(`Failed to fetch PDF preview (HTTP ${response.status})`);
          }

          const blob = await response.blob();
          currentPdfUrl = URL.createObjectURL(blob);
          if (!cancelled) {
            setPreviewUrl(currentPdfUrl);
          }
          return;
        }

        if (!isOnlyOfficeConfigured()) {
          throw new Error('ONLYOFFICE Docs is not configured');
        }

        await loadOnlyOfficeApi(documentServerUrl);
        if (cancelled) return;

        await new Promise((resolve) => setTimeout(resolve, 50));
        if (cancelled) return;

        const elementId = `onlyoffice-preview-${document.id}`;
        const container = globalThis.document.getElementById(elementId);
        if (!container) {
          throw new Error('Preview container not found');
        }

        setPreviewUrl(signed.url);

        const config: OnlyOfficeConfig = {
          document: {
            fileType: getOnlyOfficeFileType(document),
            key: createOnlyOfficeDocumentKey(document),
            permissions: {
              download: true,
              edit: false,
              print: true,
            },
            title: fileName,
            url: signed.url,
          },
          documentType: getOnlyOfficeDocumentType(document),
          editorConfig: {
            callbackUrl: getOnlyOfficeCallbackUrl(document.id, user?.id || 'preview-user'),
            customization: {
              autosave: false,
              compactHeader: true,
              compactToolbar: true,
              forcesave: false,
              toolbarHideFileName: false,
            },
            mode: 'view',
            user: {
              id: user?.id || 'preview-user',
              name: user?.email || 'Preview User',
            },
          },
          height: '100%',
          type: 'desktop',
          width: '100%',
        };

        previewInstance = new window.DocsAPI!.DocEditor(elementId, config);
      } catch (error) {
        if (!cancelled) {
          setPreviewError(error instanceof Error ? error.message : 'Preview could not be loaded');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingPreview(false);
        }
      }
    };

    void loadPreview();

    return () => {
      cancelled = true;
      previewInstance?.destroyEditor?.();
      if (currentPdfUrl) {
        URL.revokeObjectURL(currentPdfUrl);
      }
    };
  }, [document, documentServerUrl, fileName, isOpen, user?.email, user?.id]);

  if (!document) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={fileName || 'Document Preview'} size="xl">
      <div className="space-y-4 bg-[linear-gradient(180deg,#f8fafc_0%,#f3f6fb_100%)] p-1">
        <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] px-5 py-5 sm:px-6">
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                {isPdf ? 'Preview Mode' : 'ONLYOFFICE Read-Only View'}
              </div>
              <h2 className="truncate text-xl font-bold tracking-[-0.02em] text-slate-900">
                {fileName}
              </h2>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {fileExtension && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-100">
                    {fileExtension}
                  </span>
                )}
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                  {document.file_size ? `${(document.file_size / 1024).toFixed(2)} KB` : 'Size unknown'}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleDownloadClick}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <Download className="h-4 w-4" />
                Download
              </button>
              {!isPdf && (
                <a
                  href={previewUrl || '#'}
                  onClick={(event) => {
                    if (!previewUrl) event.preventDefault();
                  }}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  <ExternalLink className="h-4 w-4" />
                  Open Source File
                </a>
              )}
            </div>
          </div>

          <div className="min-h-[560px] bg-[radial-gradient(circle_at_top,#f8fafc_0%,#edf2f7_72%)] p-4 sm:p-6">
            {isLoadingPreview ? (
              <div className="flex h-full min-h-[520px] items-center justify-center rounded-[22px] border border-slate-200 bg-white">
                <div className="flex flex-col items-center gap-3 text-slate-500">
                  <Eye className="h-8 w-8 text-slate-300" />
                  <p className="text-sm font-medium">Loading preview...</p>
                </div>
              </div>
            ) : previewError ? (
              <div className="flex h-full min-h-[520px] items-center justify-center rounded-[22px] border border-rose-200 bg-white px-6 text-center">
                <div>
                  <FileText className="mx-auto h-8 w-8 text-rose-300" />
                  <p className="mt-3 text-sm font-semibold text-slate-900">Preview unavailable</p>
                  <p className="mt-1 text-sm text-slate-500">{previewError}</p>
                </div>
              </div>
            ) : isPdf ? (
              previewUrl ? (
                <iframe
                  src={previewUrl}
                  title={`${fileName} preview`}
                  className="h-[520px] w-full rounded-[22px] border border-slate-200 bg-white"
                />
              ) : null
            ) : (
              <div
                id={`onlyoffice-preview-${document.id}`}
                className="h-[520px] w-full rounded-[22px] border border-slate-200 bg-white"
              />
            )}
          </div>
        </div>
      </div>

      <DownloadOptionsModal
        isOpen={showDownloadOptions}
        fileName={fileName}
        onClose={() => setShowDownloadOptions(false)}
        onDownloadLocal={handleDownloadLocal}
        onSaveToApp={handleSaveToApp}
        onSaveToAppFolder={handleSaveToAppFolder}
      />
    </Modal>
  );
};
