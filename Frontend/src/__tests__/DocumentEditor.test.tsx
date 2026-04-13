import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentEditor } from '../components/documents/DocumentEditor';
import { forceSaveOnlyOfficeDocument } from '../lib/api/onlyoffice';

const mockShowToast = vi.fn();
const mockDocEditors: Array<{ destroyEditor: ReturnType<typeof vi.fn> }> = [];

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', email: 'user-1@example.com' },
  }),
}));

vi.mock('../contexts/ToastContext', () => ({
  useToast: () => ({
    showToast: mockShowToast,
  }),
}));

vi.mock('../components/common/LogoLoader', () => ({
  LogoLoader: ({ label }: { label?: string }) => <div>{label ?? 'Loading'}</div>,
}));

vi.mock('../components/documents/DownloadOptionsModal', () => ({
  DownloadOptionsModal: () => null,
}));

vi.mock('../lib/onlyoffice', () => ({
  createOnlyOfficeDocumentKey: (doc: { id: string; version: number }) => `${doc.id}-${doc.version}`,
  getOnlyOfficeDocumentServerUrl: () => 'http://localhost:8080',
  getOnlyOfficeDocumentType: () => 'word',
  getOnlyOfficeFileType: () => 'docx',
  isOnlyOfficeConfigured: () => true,
  loadOnlyOfficeApi: vi.fn(async () => ({
    DocEditor: class {
      destroyEditor = vi.fn();

      constructor(_elementId: string, config: { events?: { onDocumentStateChange?: (event: { data?: boolean }) => void } }) {
        mockDocEditors.push(this);
        setTimeout(() => {
          config.events?.onDocumentStateChange?.({ data: true });
        }, 0);
      }
    },
  })),
}));

vi.mock('../lib/api/documents', async () => {
  const actual = await vi.importActual<object>('../lib/api/documents');
  return {
    ...actual,
    downloadDocument: vi.fn(async () => ({ success: true, url: 'https://example.test/file.docx' })),
    saveDocumentToApp: vi.fn(),
    saveDocumentToAppFolder: vi.fn(),
  };
});

vi.mock('../lib/api/onlyoffice', async () => {
  const actual = await vi.importActual<object>('../lib/api/onlyoffice');
  return {
    ...actual,
    forceSaveOnlyOfficeDocument: vi.fn(),
    getOnlyOfficeCallbackUrl: vi.fn(() => 'http://localhost:8000/api/onlyoffice/callback/doc-1?user_id=user-1'),
  };
});

const mockedForceSaveOnlyOfficeDocument = vi.mocked(forceSaveOnlyOfficeDocument);

const doc = (id: string) => ({
  id,
  user_id: 'user-1',
  filename: `${id}.docx`,
  original_filename: `${id}.docx`,
  file_size: 1024,
  mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  storage_path: `user-1/${id}.docx`,
  version: 1,
  parent_id: null,
  folder_id: null,
  source: 'local' as const,
  google_drive_id: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
});

describe('DocumentEditor', () => {
  beforeEach(() => {
    mockShowToast.mockReset();
    mockedForceSaveOnlyOfficeDocument.mockReset();
    mockDocEditors.length = 0;

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        blob: async () =>
          new Blob(['server-doc'], {
            type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          }),
      }))
    );
  });

  it('calls onSave after a fully successful save', async () => {
    mockedForceSaveOnlyOfficeDocument.mockResolvedValue({
      success: true,
      document: {
        ...doc('doc-1'),
        version: 2,
      },
    });

    const onSave = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(
      <DocumentEditor
        documents={[doc('doc-1')]}
        layout="single"
        onClose={onClose}
        onSave={onSave}
      />
    );

    const saveButton = await screen.findByTitle('Save all documents (Ctrl+S)');
    await waitFor(() => expect(saveButton).toBeEnabled());
    await user.click(saveButton);

    await waitFor(() => expect(mockedForceSaveOnlyOfficeDocument).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onClose).not.toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Documents saved',
      })
    );
  });

  it('does not call onSave when only part of a multi-document save succeeds', async () => {
    mockedForceSaveOnlyOfficeDocument
      .mockResolvedValueOnce({
        success: true,
        document: {
          ...doc('doc-1'),
          version: 2,
        },
      })
      .mockResolvedValueOnce({
        success: false,
        error: 'Save failed',
      });

    const onSave = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(
      <DocumentEditor
        documents={[doc('doc-1'), doc('doc-2')]}
        layout="2x2"
        onClose={onClose}
        onSave={onSave}
      />
    );

    const saveButton = await screen.findByTitle('Save all documents (Ctrl+S)');
    await waitFor(() => expect(saveButton).toBeEnabled());
    await user.click(saveButton);

    await waitFor(() => expect(mockedForceSaveOnlyOfficeDocument).toHaveBeenCalledTimes(2));
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Partial save',
      })
    );
  });
});
