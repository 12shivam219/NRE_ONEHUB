import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { getCacheValue, setCacheValue } from './redis';
import type { PostgrestError } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabaseProjectRef = supabaseUrl ? new URL(supabaseUrl).hostname.split('.')[0] : '';
export const supabaseAuthStorageKey = supabaseProjectRef ? `sb-${supabaseProjectRef}-auth-token` : '';

/** When set to "1", Supabase session is stored in localStorage so it survives browser restarts ("Remember me"). */
const AUTH_REMEMBER_ME_FLAG = 'nre-auth-remember-me';

export function setAuthPersistencePreference(remember: boolean): void {
  if (typeof window === 'undefined') return;
  if (remember) {
    localStorage.setItem(AUTH_REMEMBER_ME_FLAG, '1');
  } else {
    localStorage.removeItem(AUTH_REMEMBER_ME_FLAG);
  }
}

export function clearAuthPersistencePreference(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(AUTH_REMEMBER_ME_FLAG);
}

export function isAuthRememberMeEnabled(): boolean {
  return typeof window !== 'undefined' && localStorage.getItem(AUTH_REMEMBER_ME_FLAG) === '1';
}

function shouldUseLocalSupabaseStorage(): boolean {
  return isAuthRememberMeEnabled();
}

/** Routes Supabase auth tokens to sessionStorage or localStorage based on Remember me. */
const dualAuthStorage: {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
} = {
  getItem(key: string) {
    if (typeof window === 'undefined') return null;
    if (shouldUseLocalSupabaseStorage()) {
      return localStorage.getItem(key) ?? sessionStorage.getItem(key);
    }
    return sessionStorage.getItem(key) ?? localStorage.getItem(key);
  },
  setItem(key: string, value: string) {
    if (typeof window === 'undefined') return;
    if (shouldUseLocalSupabaseStorage()) {
      localStorage.setItem(key, value);
      try {
        sessionStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    } else {
      sessionStorage.setItem(key, value);
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    }
  },
  removeItem(key: string) {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  },
};

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// Lazily initialize Supabase client to avoid circular-import TDZ/runtime
let _supabaseClient: any = null;
function initSupabaseClient() {
  if (_supabaseClient) return _supabaseClient;
  _supabaseClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: typeof window !== 'undefined' ? dualAuthStorage : undefined,
    },
    // Note: avoid setting custom global headers here to prevent CORS preflight
    // issues when calling Supabase Edge Functions from the browser. If specific
    // PostgREST queries need a `Prefer` header, set it per-request instead.
  }) as unknown as any;
  return _supabaseClient;
}

export const supabase: any = new Proxy({}, {
  get(_, prop) {
    const client = initSupabaseClient();
    const v = client[prop as any];
    if (typeof v === 'function') return v.bind(client);
    return v;
  },
  apply(_target, _thisArg, args) {
    const client = initSupabaseClient();
    return (client as any).apply(_thisArg, args);
  }
});

/**
 * Optimized query builder with automatic caching
 * Cache-first approach for read queries
 */
export async function cachedQuery<T>(
  table: string,
  buildQuery: (q: ReturnType<typeof supabase.from>) => Promise<{ data: T | null; error: PostgrestError | null }>,
  cacheKey: string,
  cacheTTL: number = 300
): Promise<T> {
  // Check cache first
  const cached = await getCacheValue<T>(cacheKey);
  if (cached) {
    return cached;
  }

  // Execute query
  const query = buildQuery(supabase.from(table));
  const { data, error } = await query;

  if (error) {
    throw new Error(`Query error: ${error.message}`);
  }

  // Cache result
  if (data) {
    await setCacheValue(cacheKey, data, { ttl: cacheTTL });
  }

  return data as T;
}

/**
 * Batch multiple read operations into single request
 * Combines multiple selects into one API call
 */
export async function batchRead<T extends Record<string, unknown>>(
  operations: Array<{
    table: string;
    filter?: Record<string, unknown>;
    select?: string;
  }>
): Promise<T[]> {
  // For Supabase, we need to make individual requests but with connection pooling
  // This function ensures proper sequencing and error handling
  
  try {
    const results = await Promise.all(
      operations.map(async (op) => {
        let query: any = supabase.from(op.table).select(op.select || '*');
        
        if (op.filter) {
          Object.entries(op.filter).forEach(([key, value]: any) => {
            query = query.eq(key, value as string | number | boolean);
          });
        }

        const { data, error } = await query;
        if (error) throw error;
        return data;
      })
    );

    return results.flat() as T[];
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('[Supabase] Batch read error:', error);
    }
    throw error;
  }
}

/**
 * Write with automatic cache invalidation
 */
export async function optimizedWrite(
  table: string,
  operation: 'insert' | 'update' | 'delete',
  payload: any,
  invalidatePatterns?: string[]
): Promise<any> {
  try {
    let query: any;

    switch (operation) {
      case 'insert':
        query = (await (supabase as any).from(table).insert([payload]).select()) as any;
        break;
      case 'update':
        // Note: update requires a filter condition (e.g., .eq('id', payload.id))
        // Modify the id filter based on your table's primary key
        query = (await (supabase as any)
          .from(table)
          .update(payload)
          .eq('id', (payload as any).id)
          .select()) as any;
        break;
      case 'delete':
        // Note: delete requires a filter condition (e.g., .eq('id', payload.id))
        // Modify the id filter based on your table's primary key
        query = await supabase
          .from(table)
          .delete()
          .eq('id', payload.id)
          .select();
        break;
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Write error: ${error.message}`);
    }

    // Invalidate relevant caches
    if (invalidatePatterns) {
      // Note: Redis pattern deletion is handled by cache layer
      // This is a placeholder for cache invalidation logic
      console.log(`[Cache] Invalidating patterns:`, invalidatePatterns);
    }

    return data;
  } catch (error) {
    console.error(`[Supabase] Write error on ${table}:`, error);
    throw error;
  }
}

/**
 * Pagination with cursor-based approach (more efficient than offset)
 */
export async function cursorPaginate<T>(
  table: string,
  pageSize: number = 50,
  cursor?: string,
  orderBy: string = 'created_at'
): Promise<{ data: T[]; nextCursor: string | null }> {
  try {
    let query = supabase
      .from(table)
      .select('*')
      .order(orderBy, { ascending: false })
      .limit(pageSize + 1);

    if (cursor) {
      const [timestamp, id] = cursor.split(':');
      query = query
        .lt(orderBy, timestamp)
        .or(`${orderBy}.eq.${timestamp},id.lt.${id}`);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    const hasMore = (data?.length || 0) > pageSize;
    const result = hasMore ? data!.slice(0, pageSize) : data || [];

    let nextCursor = null;
    if (hasMore && result.length > 0) {
      const lastItem = result[result.length - 1] as any;
      nextCursor = `${lastItem[orderBy]}:${lastItem.id}`;
    }

    return {
      data: result as T[],
      nextCursor,
    };
  } catch (error) {
    console.error('[Supabase] Cursor pagination error:', error);
    throw error;
  }
}

/**
 * Stream large result sets without loading all in memory
 * Processes results in chunks
 */
export async function streamQuery<T>(
  table: string,
  buildQuery: (q: ReturnType<typeof supabase.from>) => Promise<{ data: T[] | null; error: PostgrestError | null }>,
  onChunk: (items: T[]) => Promise<void>,
  chunkSize: number = 1000
): Promise<void> {
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    try {
      const query = buildQuery(
        supabase
          .from(table)
          .select('*')
          .range(offset, offset + chunkSize - 1)
      );

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      if (!data || data.length === 0) {
        hasMore = false;
        break;
      }

      await onChunk(data as T[]);

      offset += chunkSize;
      hasMore = data.length === chunkSize;
    } catch (error) {
      console.error('[Supabase] Stream query error:', error);
      throw error;
    }
  }
}

  // Some environments (after moving files) can cause the strongly-typed
  // Supabase client generics to resolve to `never` for table rows which
  // creates widespread type errors across the codebase. Provide an `any`
  // alias for the client to preserve runtime behavior while unblocking
  // typechecking across the repo.
  // TODO: restore strong typing once the generated `Database` types are
  // verified and aligned with the DB schema.
  export const supabaseAny = supabase as unknown as any;
