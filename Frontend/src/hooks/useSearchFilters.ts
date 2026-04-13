import { useState, useEffect, useCallback, useRef } from 'react';

interface SearchFiltersState {
  searchTerm: string;
  sortBy: 'date' | 'company' | 'daysOpen';
  sortOrder: 'asc' | 'desc';
  filterStatus: string;
  minRate: string;
  maxRate: string;
  remoteFilter: 'ALL' | 'REMOTE' | 'ONSITE';
  dateRangeFrom: string;
  dateRangeTo: string;
}

const STORAGE_KEY = 'requirements_search_filters';

export const useSearchFilters = () => {
  const [filters, setFilters] = useState<SearchFiltersState | null>(null);
  const updateTimeoutRef = useRef<NodeJS.Timeout>();

  const getDefaultFilters = (): SearchFiltersState => ({
    searchTerm: '',
    sortBy: 'date',
    sortOrder: 'desc',
    filterStatus: 'ALL',
    minRate: '',
    maxRate: '',
    remoteFilter: 'ALL',
    dateRangeFrom: '',
    dateRangeTo: '',
  });

  // Load from localStorage and URL on mount
  useEffect(() => {
    let cancelled = false;

    // Try to get from URL first
    const params = new URLSearchParams(window.location.search);
    const urlFilters = {
      searchTerm: params.get('search') || '',
      sortBy: (params.get('sortBy') as 'date' | 'company' | 'daysOpen') || 'date',
      sortOrder: (params.get('sortOrder') as 'asc' | 'desc') || 'desc',
      filterStatus: params.get('status') || 'ALL',
      minRate: params.get('minRate') || '',
      maxRate: params.get('maxRate') || '',
      remoteFilter: (params.get('remote') as 'ALL' | 'REMOTE' | 'ONSITE') || 'ALL',
      dateRangeFrom: params.get('dateFrom') || '',
      dateRangeTo: params.get('dateTo') || '',
    };

    // Check if any URL params are present
    const hasUrlParams = Array.from(params.keys()).length > 0;

    if (hasUrlParams) {
      void (async () => {
        await Promise.resolve();
        if (cancelled) return;
        setFilters(urlFilters);
      })();
    } else {
      // Fall back to localStorage
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          void (async () => {
            await Promise.resolve();
            if (cancelled) return;
            setFilters(JSON.parse(stored));
          })();
        } catch {
          void (async () => {
            await Promise.resolve();
            if (cancelled) return;
            setFilters(getDefaultFilters());
          })();
        }
      } else {
        void (async () => {
          await Promise.resolve();
          if (cancelled) return;
          setFilters(getDefaultFilters());
        })();
      }
    }

    return () => {
      cancelled = true;
    };
  }, []);

  const updateFilters = useCallback((newFilters: Partial<SearchFiltersState>) => {
    setFilters(prev => {
      if (!prev) return prev;
      return { ...prev, ...newFilters };
    });
  }, []);

  // Separate effect for persistence with debouncing
  useEffect(() => {
    if (!filters) return;

    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }

    updateTimeoutRef.current = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));

      const params = new URLSearchParams();
      if (filters.searchTerm) params.set('search', filters.searchTerm);
      if (filters.sortBy !== 'date') params.set('sortBy', filters.sortBy);
      if (filters.sortOrder !== 'desc') params.set('sortOrder', filters.sortOrder);
      if (filters.filterStatus !== 'ALL') params.set('status', filters.filterStatus);
      if (filters.minRate) params.set('minRate', filters.minRate);
      if (filters.maxRate) params.set('maxRate', filters.maxRate);
      if (filters.remoteFilter !== 'ALL') params.set('remote', filters.remoteFilter);
      if (filters.dateRangeFrom) params.set('dateFrom', filters.dateRangeFrom);
      if (filters.dateRangeTo) params.set('dateTo', filters.dateRangeTo);

      const url = params.toString()
        ? `${window.location.pathname}?${params.toString()}`
        : window.location.pathname;

      window.history.replaceState({}, '', url);
    }, 100);

    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, [filters]);

  const clearFilters = useCallback(() => {
    const defaults = getDefaultFilters();
    setFilters(defaults);
    localStorage.removeItem(STORAGE_KEY);
    window.history.replaceState({}, '', window.location.pathname);
  }, []);

  return { filters, updateFilters, clearFilters, isLoaded: filters !== null };
};
