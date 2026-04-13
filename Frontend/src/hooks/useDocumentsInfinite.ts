import { useCallback, useMemo } from 'react';
import useSWRInfinite from 'swr/infinite';
// import { useInfiniteQuery } from '@tanstack/react-query';  // For future use
import { getDocumentsPage } from '../lib/api/documents';
import type { Database } from '../lib/database.types';

type Document = Database['public']['Tables']['documents']['Row'];

type DocumentsPageData = {
  documents: Document[];
  cursorCreatedAt: string | null;
  hasNextPage: boolean;
};

export function useDocumentsInfinite(options: {
  userId?: string;
  pageSize: number;
  search: string;
  folderId?: string | null;
}) {
  const { userId, pageSize, search, folderId } = options;

  const getKey = useCallback(
    (pageIndex: number, previousPageData: DocumentsPageData | null) => {
      if (!userId) return null;
      // Bug #6: When search changes, reset pagination to page 0
      if (pageIndex === 0) return ['documents', userId, search, folderId ?? 'root', null, pageSize] as const;
      if (previousPageData && !previousPageData.hasNextPage) return null;
      return ['documents', userId, search, folderId ?? 'root', previousPageData?.cursorCreatedAt ?? null, pageSize] as const;
    },
    [userId, search, folderId, pageSize]
  );

  const fetcher = useCallback(
    async (key: readonly [
      'documents',
      string,
      string,
      string,
      string | null,
      number,
    ]): Promise<DocumentsPageData> => {
      const [, uid, q, folderKey, cursor, limit] = key;
      const folderIdValue = folderKey === 'root' ? undefined : folderKey;

      const res = await getDocumentsPage({
        userId: uid,
        limit,
        cursor: cursor ? { created_at: cursor, direction: 'after' } : undefined,
        search: q || undefined,
        folderId: folderIdValue,
        includeCount: false,
        orderBy: 'created_at',
        orderDir: 'desc',
      });

      if (!res.success) {
        throw new Error(res.error || 'Failed to load documents');
      }

      const list = (res.documents || []) as Document[];
      const nextCursor = list.length > 0 ? list[list.length - 1].created_at : null;

      return {
        documents: list,
        cursorCreatedAt: nextCursor,
        hasNextPage: list.length === limit,
      };
    },
    []
  );

  const swr = useSWRInfinite<DocumentsPageData>(getKey, fetcher, {
    dedupingInterval: 15_000,
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    persistSize: true,
  });

  const setSize = swr.setSize;
  const mutate = swr.mutate;
  const size = swr.size;

  const documents = useMemo(() => {
    const pages = swr.data || [];
    const seen = new Set<string>();
    const flat: Document[] = [];
    for (const p of pages) {
      for (const d of p.documents) {
        if (seen.has(d.id)) continue;
        seen.add(d.id);
        flat.push(d);
      }
    }
    return flat;
  }, [swr.data]);

  const hasMore = useMemo(() => {
    if (!swr.data || swr.data.length === 0) return false;
    return Boolean(swr.data[swr.data.length - 1]?.hasNextPage);
  }, [swr.data]);

  const isLoadingInitial = !swr.data && !swr.error;
  const isLoadingMore = swr.isValidating && swr.data && swr.size > 0;

  const loadMore = useCallback(async () => {
    if (!hasMore) return;
    await setSize(size + 1);
  }, [hasMore, setSize, size]);

  const reset = useCallback(async () => {
    await setSize(1);
    await mutate();
  }, [setSize, mutate]);

  return {
    documents,
    error: swr.error,
    hasMore,
    isLoadingInitial,
    isLoadingMore,
    isValidating: swr.isValidating,
    loadMore,
    mutate,
    reset,
    size,
  };
}
