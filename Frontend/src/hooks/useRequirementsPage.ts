import { useEffect, useMemo } from 'react';
import useSWR from 'swr';
// import { useQuery } from '@tanstack/react-query';  // For future use
import { getRequirementsPage, type RequirementWithLogs } from '../lib/api/requirements';
import { cacheRequirements, getCachedRequirements, type CachedRequirement } from '../lib/offlineDB';

export type RequirementsQuery = {
  userId?: string;
  page: number;
  pageSize: number;
  search: string;
  status: string | 'ALL';
  dateFrom?: string;
  dateTo?: string;
  sortBy: 'date' | 'company' | 'daysOpen';
  sortOrder: 'asc' | 'desc';
  minRate?: string;
  maxRate?: string;
  remoteFilter?: 'ALL' | 'REMOTE' | 'ONSITE';
};

type RequirementsPageData = {
  requirements: RequirementWithLogs[];
  hasNextPage: boolean;
};

const buildKey = (q: RequirementsQuery) => {
  // Return unique key even if userId is missing - SWR will handle the null/undefined scenario
  // This prevents the hook from being in a perpetual loading state
  return `requirements-page:${JSON.stringify({
    userId: q.userId || 'anonymous',
    page: q.page,
    pageSize: q.pageSize,
    search: q.search,
    status: q.status,
    dateFrom: q.dateFrom || '',
    dateTo: q.dateTo || '',
    sortBy: q.sortBy,
    sortOrder: q.sortOrder,
    minRate: q.minRate || '',
    maxRate: q.maxRate || '',
    remoteFilter: q.remoteFilter || 'ALL',
  })}`;
};

const fetchPage = async (q: RequirementsQuery): Promise<RequirementsPageData> => {
  // If userId is not available yet, return empty state rather than hanging
  // This allows the component to show the proper empty state instead of infinite loading
  if (!q.userId) {
    return { requirements: [], hasNextPage: false };
  }

  const orderByColumn = q.sortBy === 'date' ? 'created_at' : q.sortBy === 'company' ? 'company' : 'created_at';

  const res = await getRequirementsPage({
    userId: q.userId,
    limit: q.pageSize,
    offset: q.page * q.pageSize,
    search: q.search || undefined,
    status: q.status || undefined,
    dateFrom: q.dateFrom || undefined,
    dateTo: q.dateTo || undefined,
    orderBy: orderByColumn,
    orderDir: q.sortOrder,
    includeCount: false,
    minRate: q.minRate || undefined,
    maxRate: q.maxRate || undefined,
    remoteFilter: q.remoteFilter || undefined,
  });

  if (!res.success) {
    throw new Error(res.error || 'Failed to fetch requirements');
  }

  const list = res.requirements || [];
  return { requirements: list, hasNextPage: list.length === q.pageSize };
};

export function useRequirementsPage(query: RequirementsQuery) {
  const key = useMemo(() => buildKey(query), [query]);

  const swr = useSWR<RequirementsPageData>(
    key,
    () => fetchPage(query),
    {
      dedupingInterval: 3_000,  // 3s (reduced from 10s) - more responsive to user input
      revalidateOnFocus: true,  // Refetch on window focus to catch new data
      revalidateOnReconnect: true,  // Refetch when reconnected
      keepPreviousData: true,  // Keep showing old data while new data loads
      shouldRetryOnError: true,  // Retry failed requests
      errorRetryCount: 2,  // Retry up to 2 times on error
      errorRetryInterval: 1000,  // Wait 1s between retries
    }
  );

  // If userId is missing, set data immediately to empty state to prevent infinite loading
  useEffect(() => {
    if (!query.userId && !swr.data) {
      swr.mutate(
        { requirements: [], hasNextPage: false },
        { revalidate: false }
      );
    }
  }, [query.userId, swr]);

  useEffect(() => {
    const maybeHydrateFromCache = async () => {
      if (!query.userId) return;
      if (navigator.onLine) return;
      if (swr.data) return;

      const cached = await getCachedRequirements(query.userId, true);
      if (cached && cached.length > 0) {
        swr.mutate(
          {
            requirements: cached as unknown as RequirementWithLogs[],
            hasNextPage: false,
          },
          { revalidate: false }
        );
      }
    };

    void maybeHydrateFromCache();
  }, [query.userId, swr]);

  useEffect(() => {
    const save = async () => {
      if (!query.userId) return;
      if (!swr.data?.requirements) return;
      if (!navigator.onLine) return;
      if (query.page !== 0) return;
      await cacheRequirements(swr.data.requirements as unknown as CachedRequirement[], query.userId);
    };

    void save();
  }, [query.userId, query.page, swr.data?.requirements, swr]);

  return swr;
}
