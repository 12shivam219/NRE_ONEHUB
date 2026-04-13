import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { SWRConfig } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDocumentsInfinite } from '../hooks/useDocumentsInfinite';
import { getDocumentsPage } from '../lib/api/documents';

vi.mock('../lib/api/documents', () => ({
  getDocumentsPage: vi.fn(),
}));

const mockedGetDocumentsPage = vi.mocked(getDocumentsPage);

const makeDoc = (id: string) => ({
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

const wrapper = ({ children }: { children: ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
    {children}
  </SWRConfig>
);

describe('useDocumentsInfinite', () => {
  beforeEach(() => {
    mockedGetDocumentsPage.mockResolvedValue({
      success: true,
      documents: [makeDoc('doc-1')],
      total: 1,
    });
  });

  it('requests root documents with folderId omitted', async () => {
    renderHook(
      () =>
        useDocumentsInfinite({
          userId: 'user-1',
          pageSize: 20,
          search: '',
          folderId: null,
        }),
      { wrapper }
    );

    await waitFor(() => expect(mockedGetDocumentsPage).toHaveBeenCalled());

    expect(mockedGetDocumentsPage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        folderId: undefined,
      })
    );
  });

  it('requests a specific folder when folderId is set', async () => {
    renderHook(
      () =>
        useDocumentsInfinite({
          userId: 'user-1',
          pageSize: 20,
          search: '',
          folderId: 'folder-123',
        }),
      { wrapper }
    );

    await waitFor(() => expect(mockedGetDocumentsPage).toHaveBeenCalled());

    expect(mockedGetDocumentsPage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        folderId: 'folder-123',
      })
    );
  });
});
