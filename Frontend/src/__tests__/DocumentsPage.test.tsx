import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentsPage } from '../components/documents/DocumentsPage';

const mockShowToast = vi.fn();
const mockUseDocumentsInfinite = vi.fn();
const mockUseFolders = vi.fn();
const mockUseMediaQuery = vi.fn();
const mockUseVirtualizer = vi.fn();

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user-1' },
  }),
}));

vi.mock('../contexts/ToastContext', () => ({
  useToast: () => ({
    showToast: mockShowToast,
  }),
}));

vi.mock('../hooks/useDocumentsInfinite', () => ({
  useDocumentsInfinite: (...args: unknown[]) => mockUseDocumentsInfinite(...args),
}));

vi.mock('../hooks/useFolders', () => ({
  useFolders: (...args: unknown[]) => mockUseFolders(...args),
}));

vi.mock('@mui/material', async () => {
  const actual = await vi.importActual<object>('@mui/material');
  return {
    ...actual,
    useTheme: () => ({ breakpoints: { down: () => 'md' } }),
    useMediaQuery: (...args: unknown[]) => mockUseMediaQuery(...args),
  };
});

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (...args: unknown[]) => mockUseVirtualizer(...args),
}));

vi.mock('../components/documents/DocumentEditor', () => ({
  DocumentEditor: ({ documents }: { documents: Array<{ id: string }> }) => (
    <div data-testid="mock-editor">Editor for {documents.map((doc) => doc.id).join(',')}</div>
  ),
}));

vi.mock('../components/documents/DocumentPreviewModal', () => ({
  DocumentPreviewModal: () => null,
}));

vi.mock('../components/documents/DownloadOptionsModal', () => ({
  DownloadOptionsModal: () => null,
}));

vi.mock('../components/documents/GoogleDrivePicker', () => ({
  GoogleDrivePicker: () => null,
}));

vi.mock('../components/documents/CreateFolderModal', () => ({
  CreateFolderModal: () => null,
}));

vi.mock('../components/common/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('../components/common/ConfirmDialog', () => ({
  ConfirmDialog: () => null,
}));

vi.mock('../components/documents/BreadcrumbNavigation', () => ({
  BreadcrumbNavigation: () => <div>Breadcrumb</div>,
}));

vi.mock('../components/documents/FolderSidebar', () => ({
  FolderSidebar: ({
    onFolderSelect,
  }: {
    onFolderSelect: (folderId: string | null) => void;
  }) => (
    <button type="button" onClick={() => onFolderSelect('folder-2')}>
      Go to Folder 2
    </button>
  ),
}));

const docs = [
  {
    id: 'doc-1',
    user_id: 'user-1',
    filename: 'resume-a.docx',
    original_filename: 'Resume A.docx',
    file_size: 1000,
    mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    storage_path: 'user-1/doc-1.docx',
    version: 1,
    parent_id: null,
    folder_id: null,
    source: 'local' as const,
    google_drive_id: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'doc-2',
    user_id: 'user-1',
    filename: 'resume-b.docx',
    original_filename: 'Resume B.docx',
    file_size: 2000,
    mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    storage_path: 'user-1/doc-2.docx',
    version: 1,
    parent_id: null,
    folder_id: null,
    source: 'local' as const,
    google_drive_id: null,
    created_at: '2026-01-02T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z',
  },
];

describe('DocumentsPage', () => {
  beforeEach(() => {
    mockShowToast.mockReset();
    mockUseMediaQuery.mockReturnValue(false);
    mockUseVirtualizer.mockImplementation(({ count }: { count: number }) => ({
      getVirtualItems: () =>
        Array.from({ length: count }, (_, index) => ({ index, start: index * 76 })),
      getTotalSize: () => count * 76,
    }));
    mockUseFolders.mockReturnValue({
      folders: [],
      breadcrumb: [],
      createNewFolder: vi.fn(),
      refresh: vi.fn(),
    });
    mockUseDocumentsInfinite.mockReturnValue({
      documents: docs,
      error: undefined,
      isLoadingInitial: false,
      isLoadingMore: false,
      hasMore: false,
      loadMore: vi.fn(),
      mutate: vi.fn(),
      reset: vi.fn(),
      size: 1,
    });
  });

  it('opens the editor for a single selected document', async () => {
    const user = userEvent.setup();
    render(<DocumentsPage />);

    await user.click(screen.getByLabelText('Select Resume A.docx'));
    await user.click(screen.getByRole('button', { name: /edit/i }));

    expect(await screen.findByTestId('mock-editor')).toHaveTextContent('doc-1');
  });

  it('warns instead of opening the editor when multiple documents are selected', async () => {
    const user = userEvent.setup();
    render(<DocumentsPage />);

    await user.click(screen.getByLabelText('Select Resume A.docx'));
    await user.click(screen.getAllByLabelText('Select Resume B.docx')[0]);
    await user.click(screen.getByRole('button', { name: /edit/i }));

    expect(screen.queryByTestId('mock-editor')).not.toBeInTheDocument();
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Only one document at a time',
      })
    );
  });

  it('clears selection when the folder changes', async () => {
    const user = userEvent.setup();
    render(<DocumentsPage />);

    await user.click(screen.getByLabelText('Select Resume A.docx'));
    expect(screen.getByRole('button', { name: 'Deselect all documents' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /go to folder 2/i }));

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Deselect all documents' })).not.toBeInTheDocument()
    );
  });
});
