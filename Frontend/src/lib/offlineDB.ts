/**
 * IndexedDB Offline Database
 * Provides client-side caching for offline support and faster data access
 * Uses Dexie.js for simplified IndexedDB operations
 * 
 * WHY: 
 * - Users can view cached data when offline
 * - Reduces API calls by serving from local cache first
 * - Significantly faster than network requests (typically <10ms vs 100-200ms)
 * - Syncs automatically when connection restored
 */

import Dexie, { Table } from 'dexie';
import { supabase } from './supabase';
import { hashPassword } from './encryption';

export interface CachedRequirement {
  id: string;
  user_id: string;
  title: string;
  company?: string;
  status: string;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface CachedConsultant {
  id: string;
  user_id: string;
  name: string;
  email?: string;
  status: string;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface CachedInterview {
  id: string;
  requirement_id: string;
  user_id?: string;
  scheduled_date: string;
  status: string;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface CacheMetadata {
  key: string;
  lastUpdated: number;
  expiresAt: number;
  count?: number;
  value?: string;
}

// Feature 1: Offline Sync Queue
export interface SyncQueueItem {
  id: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  entityType: 'requirement' | 'consultant' | 'interview' | 'document' | 'email';
  entityId: string;
  payload: Record<string, unknown>;
  timestamp: number;
  retries: number;
  lastError?: string;
  status: 'pending' | 'syncing' | 'failed';
  nextAttempt?: number;
}

// Feature 3: Expanded Cache Coverage
export interface CachedDocument {
  id: string;
  user_id: string;
  name: string;
  content?: string;
  type: string;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface CachedEmail {
  id: string;
  requirement_id: string;
  user_id?: string;
  subject: string;
  body?: string;
  from: string;
  to: string;
  sent_date: string;
  created_at: string;
  [key: string]: unknown;
}

// Feature 8: Selective Sync Hook
export interface CachePreferences {
  key: string; // Required primary key for Dexie
  cacheRequirements: boolean;
  cacheConsultants: boolean;
  cacheInterviews: boolean;
  cacheDocuments: boolean;
  cacheEmails: boolean;
  maxCacheSize: number; // MB
  syncOnWiFiOnly: boolean;
}

// Feature 6: Sync Progress Tracking
export interface SyncStatus {
  isSyncing: boolean;
  itemsRemaining: number;
  lastSyncTime: number | null;
  failedItems: number;
  progress: number; // 0-100
  totalItems: number;
}

// Feature 7: Conflict Resolution
export interface ConflictRecord {
  id: string;
  entityType: string;
  entityId: string;
  strategy: 'local' | 'remote' | 'merge' | 'pending';
  timestamp: number;
  localVersion: Record<string, unknown>;
  remoteVersion: Record<string, unknown>;
  userResolved?: boolean;
  resolvedAt?: number;
  selectedVersion?: 'local' | 'remote';
}

// Feature 10: Cache Analytics
export interface CacheAnalytics {
  key: string; // Required primary key for Dexie
  offlineTime: number; // minutes
  itemsCreatedOffline: number;
  itemsUpdatedOffline: number;
  itemsDeletedOffline: number;
  syncSuccessRate: number; // 0-100
  averageSyncTime: number; // ms
  totalSyncEvents: number;
}

// Feature 11: Draft Models for Form Persistence
export interface DraftModel {
  key: string; // Primary key (unique draft identifier)
  value: string; // Serialized form data (JSON)
  updatedAt: number; // Last update timestamp
  entityType?: string; // Type of entity being drafted (requirement, consultant, etc.)
  userId?: string; // User who created the draft
}

class OfflineDatabase extends Dexie {
  requirements!: Table<CachedRequirement>;
  consultants!: Table<CachedConsultant>;
  interviews!: Table<CachedInterview>;
  drafts!: Table<DraftModel>;
  cacheMetadata!: Table<CacheMetadata>;
  syncQueue!: Table<SyncQueueItem>;
  documents!: Table<CachedDocument>;
  emails!: Table<CachedEmail>;
  cachePreferences!: Table<CachePreferences>;
  conflicts!: Table<ConflictRecord>;
  analytics!: Table<CacheAnalytics>;

  constructor() {
    super('NREOfflineDB');
    this.version(3).stores({
      // Use server-provided string `id` as primary key (UUID) to avoid numeric auto-increment mismatches
      requirements: 'id, user_id, status, created_at',
      consultants: 'id, user_id, status, created_at',
      interviews: 'id, requirement_id, scheduled_date, status, user_id',
      drafts: 'key, updatedAt, entityType, userId',
      cacheMetadata: 'key',
      // syncQueue uses string ids generated in addToSyncQueue
      syncQueue: 'id, entityType, entityId, status, timestamp',
      documents: 'id, user_id, created_at',
      emails: 'id, requirement_id, sent_date, user_id',
      cachePreferences: 'key',
      conflicts: 'id, entityType, entityId',
      analytics: 'key',
    });
  }
}

// ⚡ PERFORMANCE: Lazy-load Dexie database to avoid blocking app startup
// The database is only initialized when first accessed, not at module load time
let dbInstance: OfflineDatabase | null = null;

function getDB(): OfflineDatabase {
  if (!dbInstance) {
    dbInstance = new OfflineDatabase();
  }
  return dbInstance;
}

export const db = new Proxy({} as OfflineDatabase, {
  get(_, prop) {
     
    return (getDB() as any)[prop];
  },
});

// Cache TTL in milliseconds
const CACHE_DURATIONS = {
  REQUIREMENTS: 10 * 60 * 1000, // 10 minutes
  CONSULTANTS: 10 * 60 * 1000,  // 10 minutes
  INTERVIEWS: 5 * 60 * 1000,    // 5 minutes
  DOCUMENTS: 30 * 60 * 1000,    // 30 minutes
  EMAILS: 30 * 60 * 1000,       // 30 minutes
  USERS: 60 * 60 * 1000,        // 1 hour
} as const;

 const dispatchSyncQueueChanged = () => {
   if (typeof window === 'undefined') return;
   window.dispatchEvent(new CustomEvent('sync-queue-changed'));
 };

/**
 * Cache requirements data locally
 * Enables offline access and reduces API calls
 */
export async function cacheRequirements(
  requirements: CachedRequirement[],
  userId: string
): Promise<void> {
  try {
    // Perform upserts and metadata update in a transaction
    await db.transaction('rw', db.requirements, db.cacheMetadata, async () => {
      const CHUNK = 500;
      for (let i = 0; i < requirements.length; i += CHUNK) {
        await db.requirements.bulkPut(requirements.slice(i, i + CHUNK));
      }

      const count = await db.requirements.where('user_id').equals(userId).count();
      await db.cacheMetadata.put({
        key: `requirements_${userId}`,
        lastUpdated: Date.now(),
        expiresAt: Date.now() + CACHE_DURATIONS.REQUIREMENTS,
        count,
      });
    });
  } catch (error) {
    console.error('Failed to cache requirements:', error);
  }
}

export async function removeCachedRequirement(userId: string, requirementId: string): Promise<void> {
  try {
    await db.requirements.delete(requirementId);

    const metadataKey = `requirements_${userId}`;
    const metadata = await db.cacheMetadata.get(metadataKey);
    if (metadata) {
      const count = await db.requirements.where('user_id').equals(userId).count();
      await db.cacheMetadata.put({
        ...metadata,
        count,
      });
    }
  } catch (error) {
    console.error('Failed to remove cached requirement:', error);
  }
}

/**
 * Get cached requirements for offline use
 * Returns null if cache expired (unless offline, then returns expired cache)
 */
export async function getCachedRequirements(userId: string, allowExpired: boolean = false): Promise<CachedRequirement[] | null> {
  try {
    const metadata = await db.cacheMetadata.get(`requirements_${userId}`);

    if (!metadata) {
      return null;
    }

    // Check if cache is still valid
    const isExpired = metadata.expiresAt < Date.now();
    
    // If expired and not allowing expired cache, return null
    if (isExpired && !allowExpired) {
      return null;
    }

    // If offline, allow expired cache
    const isOffline = !navigator.onLine;
    if (isExpired && !isOffline && !allowExpired) {
      return null;
    }

    const cached = await db.requirements.where('user_id').equals(userId).toArray();
    
    // If using expired cache, log it
    if (isExpired && (isOffline || allowExpired)) {
      console.log(`[getCachedRequirements] Using expired cache (offline: ${isOffline})`);
    }

    return cached;
  } catch (error) {
    console.error('Failed to get cached requirements:', error);
    return null;
  }
}

/**
 * Cache consultants data locally
 */
export async function cacheConsultants(
  consultants: CachedConsultant[],
  userId: string
): Promise<void> {
  try {
    // Do delete + upsert + metadata update inside a transaction
    await db.transaction('rw', db.consultants, db.cacheMetadata, async () => {
      const existing = await db.consultants.where('user_id').equals(userId).toArray();
      const newIds = new Set(consultants.map(c => c.id));
      const toDelete = existing.filter(c => !newIds.has(c.id)).map(c => c.id);
      if (toDelete.length) await db.consultants.bulkDelete(toDelete as string[]);

      const CHUNK = 500;
      for (let i = 0; i < consultants.length; i += CHUNK) {
        await db.consultants.bulkPut(consultants.slice(i, i + CHUNK));
      }

      await db.cacheMetadata.put({
        key: `consultants_${userId}`,
        lastUpdated: Date.now(),
        expiresAt: Date.now() + CACHE_DURATIONS.CONSULTANTS,
        count: consultants.length,
      });
    });
  } catch (error) {
    console.error('Failed to cache consultants:', error);
  }
}

/**
 * Get cached consultants for offline use
 */
export async function getCachedConsultants(userId: string, allowExpired: boolean = false): Promise<CachedConsultant[] | null> {
  try {
    const metadata = await db.cacheMetadata.get(`consultants_${userId}`);
    if (!metadata) return null;

    const isExpired = metadata.expiresAt < Date.now();
    const isOffline = !navigator.onLine;
    if (isExpired && !isOffline && !allowExpired) return null;
    if (isExpired && (isOffline || allowExpired)) console.log(`[getCachedConsultants] Using expired cache (offline: ${isOffline})`);

    return await db.consultants.where('user_id').equals(userId).toArray();
  } catch (error) {
    console.error('Failed to get cached consultants:', error);
    return null;
  }
}

/**
 * Cache interviews data locally
 */
export async function cacheInterviews(
  interviews: CachedInterview[],
  userId: string
): Promise<void> {
  try {
    // Use indexed user_id query to find existing interviews for this user
    const existing = await db.interviews.where('user_id').equals(userId).toArray();
    const newIds = new Set(interviews.map(i => i.id));
    const toDelete = existing.filter(i => !newIds.has(i.id)).map(i => i.id);

    // Perform deletes and upserts in a transaction to avoid partial state
    await db.transaction('rw', db.interviews, db.cacheMetadata, async () => {
      if (toDelete.length) await db.interviews.bulkDelete(toDelete as string[]);

      const CHUNK = 500;
      for (let i = 0; i < interviews.length; i += CHUNK) {
        await db.interviews.bulkPut(interviews.slice(i, i + CHUNK));
      }

      await db.cacheMetadata.put({
        key: `interviews_${userId}`,
        lastUpdated: Date.now(),
        expiresAt: Date.now() + CACHE_DURATIONS.INTERVIEWS,
        count: interviews.length,
      });
    });
  } catch (error) {
    console.error('Failed to cache interviews:', error);
  }
}

/**
 * Get cached interviews for offline use
 */
export async function getCachedInterviews(userId?: string, allowExpired: boolean = false): Promise<CachedInterview[] | null> {
  try {
    if (userId) {
      const metadataKey = `interviews_${userId}`;
      const metadata = await db.cacheMetadata.get(metadataKey);
      if (!metadata) return null;

      const isExpired = metadata.expiresAt < Date.now();
      const isOffline = !navigator.onLine;
      if (isExpired && !isOffline && !allowExpired) return null;
      if (isExpired && (isOffline || allowExpired)) console.log(`[getCachedInterviews] Using expired cache (offline: ${isOffline})`);

      return await db.interviews.where('user_id').equals(userId).toArray();
    }

    return await db.interviews.toArray();
  } catch (error) {
    console.error('Failed to get cached interviews:', error);
    return null;
  }
}

/**
 * Clear all offline cache
 * Call when user logs out
 */
export async function clearOfflineCache(): Promise<void> {
  try {
    await db.requirements.clear();
    await db.consultants.clear();
    await db.interviews.clear();
    await db.cacheMetadata.clear();
  } catch (error) {
    console.error('Failed to clear offline cache:', error);
  }
}

/**
 * Clear cached requirements for a specific user
 * Use this when requirements are deleted from the server
 */
export async function clearCachedRequirements(userId: string): Promise<void> {
  try {
    await db.requirements.where('user_id').equals(userId).delete();
    await db.cacheMetadata.delete(`requirements_${userId}`);
  } catch (error) {
    console.error('Failed to clear cached requirements:', error);
  }
}

/**
 * Get cache statistics for debugging
 */
export async function getCacheStats(): Promise<{
  requirements: number;
  consultants: number;
  interviews: number;
  lastUpdated: Record<string, number>;
}> {
  try {
    const [reqCount, conCount, intCount, metadata] = await Promise.all([
      db.requirements.count(),
      db.consultants.count(),
      db.interviews.count(),
      db.cacheMetadata.toArray(),
    ]);

    const lastUpdated: Record<string, number> = {};
    metadata.forEach(m => {
      lastUpdated[m.key] = m.lastUpdated;
    });

    return {
      requirements: reqCount,
      consultants: conCount,
      interviews: intCount,
      lastUpdated,
    };
  } catch (error) {
    console.error('Failed to get cache stats:', error);
    return {
      requirements: 0,
      consultants: 0,
      interviews: 0,
      lastUpdated: {},
    };
  }
}

/**
 * Check if device is online
 */
export function isOnline(): boolean {
  return navigator.onLine;
}

// ============= FEATURE 1: OFFLINE SYNC QUEUE =============

/**
 * Add operation to sync queue (create/update/delete when offline)
 */
export async function addToSyncQueue(
  operation: SyncQueueItem['operation'],
  entityType: SyncQueueItem['entityType'],
  entityId: string,
  payload: Record<string, unknown>
): Promise<string> {
  try {
    const id = (typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function')
      ? (crypto as any).randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    const item: SyncQueueItem = {
      id,
      operation,
      entityType,
      entityId,
      payload,
      timestamp: Date.now(),
      retries: 0,
      status: 'pending',
    };
    
    await db.syncQueue.add(item);
    dispatchSyncQueueChanged();
    console.debug(`[offlineDB] addToSyncQueue: added id=${id} op=${operation} entity=${entityType}/${entityId} timestamp=${item.timestamp}`);
    return id;
  } catch (error) {
    console.error('Failed to add to sync queue:', error);
    throw error;
  }
}

/**
 * Get pending sync items
 */
export async function getPendingSyncItems(): Promise<SyncQueueItem[]> {
  try {
    return await db.syncQueue.where('status').anyOf(['pending', 'failed']).toArray();
  } catch (error) {
    console.error('Failed to get pending sync items:', error);
    return [];
  }
}

/**
 * Update sync item status
 */
export async function updateSyncItemStatus(
  id: string,
  status: SyncQueueItem['status'],
  error?: string
): Promise<void> {
  try {
    const existing = await db.syncQueue.get(id);
    const newRetries = status === 'failed' ? ((existing?.retries ?? 0) + 1) : 0;
    await db.syncQueue.update(id, {
      status,
      lastError: error,
      retries: newRetries,
    });
    dispatchSyncQueueChanged();
  } catch (error) {
    console.error('Failed to update sync item:', error);
  }
}

/**
 * Clear synced items from queue
 */
export async function clearSyncedItems(): Promise<void> {
  try {
    await db.syncQueue.where('status').notEqual('pending').delete();
    dispatchSyncQueueChanged();
  } catch (error) {
    console.error('Failed to clear synced items:', error);
  }
}

/**
 * Get pending conflicts awaiting user resolution
 */
export async function getPendingConflicts(): Promise<ConflictRecord[]> {
  try {
    return await db.conflicts
      .where('strategy')
      .equals('pending')
      .toArray();
  } catch (error) {
    console.error('Failed to get pending conflicts:', error);
    return [];
  }
}

/**
 * Resolve a conflict by letting user choose which version to keep
 * @param conflictId - The conflict ID
 * @param selectedVersion - Which version to apply: 'local' or 'remote'
 */
export async function resolveConflict(conflictId: string, selectedVersion: 'local' | 'remote'): Promise<void> {
  try {
    const conflict = await db.conflicts.get(conflictId);
    if (!conflict) {
      throw new Error(`Conflict ${conflictId} not found`);
    }

    // Update the conflict record
    await db.conflicts.update(conflictId, {
      strategy: selectedVersion,
      userResolved: true,
      resolvedAt: Date.now(),
      selectedVersion,
    });

    // Find the sync queue item for this conflict
    const syncItem = await db.syncQueue
      .where('entityId')
      .equals(conflict.entityId)
      .filter((item: SyncQueueItem) => item.operation === 'UPDATE')
      .first();

    if (syncItem) {
      // Update the payload with the selected version
      const updatedPayload = selectedVersion === 'local' 
        ? conflict.localVersion 
        : conflict.remoteVersion;

      await db.syncQueue.update(syncItem.id, {
        payload: updatedPayload,
        lastError: undefined,
        status: 'pending',
      });

      dispatchSyncQueueChanged();
      console.log(`Conflict resolved for ${conflict.entityId}: ${selectedVersion} version selected`);
    }
  } catch (error) {
    console.error('Failed to resolve conflict:', error);
    throw error;
  }
}

/**
 * Process pending sync queue items with exponential backoff on failures.
 * Attempts a limited batch and removes successfully-synced items from the queue.
 * Detects and handles conflicts (local vs remote changes).
 */
export async function processSyncQueue(batchSize: number = 10): Promise<{ processed: number; failed: number; conflicts: number }> {
  try {
    console.debug(`[offlineDB] processSyncQueue: starting batchSize=${batchSize}`);
    const now = Date.now();
    // Only pick items that are pending and ready to be retried (nextAttempt <= now or undefined)
    const items = await db.syncQueue
      .orderBy('timestamp')
      .filter((it: SyncQueueItem) => (it.status === 'pending' || it.status === 'failed') && (!it.nextAttempt || it.nextAttempt <= now))
      .limit(batchSize)
      .toArray();

    let processed = 0;
    let failed = 0;
    let conflicts = 0;

    console.debug(`[offlineDB] processSyncQueue: processing items=${items.length}`);
    for (const item of items) {
      console.debug(`[offlineDB] processSyncQueue: processing item id=${item.id} entity=${item.entityType}/${item.entityId} op=${item.operation} status=${item.status} retries=${item.retries}`);
      // mark as syncing
      await db.syncQueue.update(item.id, { status: 'syncing' });
      dispatchSyncQueueChanged();

      try {
        // For UPDATE operations, check for conflicts across entity types
        if (item.operation === 'UPDATE') {
          const tableName = `${item.entityType}s`;
          try {
            const { data: serverData, error: fetchError } = await supabase
              .from(tableName)
              .select('*')
              .eq('id', item.entityId)
              .single();

            if (!fetchError && serverData && serverData.updated_at) {
              const localUpdateTime = item.timestamp;
              const serverUpdateTime = new Date(serverData.updated_at).getTime();
              if (serverUpdateTime > localUpdateTime) {
                console.warn(`[Conflict Detected] Local change for ${item.entityType} ${item.entityId} - moving to pending resolution`);
                const conflictId = `${item.entityType}-${item.entityId}-${item.timestamp}`;
                await db.conflicts.put({
                  id: conflictId,
                  entityType: item.entityType,
                  entityId: item.entityId,
                  strategy: 'pending',
                  timestamp: Date.now(),
                  localVersion: item.payload,
                  remoteVersion: serverData as Record<string, unknown>,
                  userResolved: false,
                });

                conflicts++;
                await db.syncQueue.update(item.id, {
                  status: 'pending',
                  lastError: 'Conflict detected - awaiting user resolution',
                });
                dispatchSyncQueueChanged();
                continue;
              }
            }
          } catch (fetchErr) {
            // If fetch fails, allow the sync attempt to continue and rely on error handling below
            console.debug('[processSyncQueue] failed to fetch server version for conflict check', fetchErr);
          }
        }

        // Execute operation
        if (item.entityType === 'requirement') {
          if (item.operation === 'CREATE') {
            const { data, error } = await supabase
              .from('requirements')
              .insert(item.payload as Record<string, unknown>)
              .select('*');
            if (error) throw error;

            const created = (data && data.length > 0 ? data[0] : null) as (CachedRequirement | null);
            const tempId = item.entityId;

            if (created && typeof created.id === 'string' && tempId.startsWith('temp-')) {
              const newId = created.id;
              const createdUserId = created.user_id;

              await db.transaction('rw', db.requirements, db.syncQueue, db.cacheMetadata, async () => {
                // Replace cached temp requirement with server-created record
                const existingTemp = await db.requirements.get(tempId);
                if (existingTemp) {
                  await db.requirements.delete(tempId);
                }
                await db.requirements.put(created);

                // Rewrite any queued operations that referenced the tempId to the real id
                const related = await db.syncQueue.where('entityId').equals(tempId).toArray();
                for (const rel of related) {
                  if (rel.id === item.id) continue;
                  const nextPayload: Record<string, unknown> = { ...(rel.payload || {}) };
                  if (nextPayload.id === tempId) nextPayload.id = newId;
                  if (nextPayload.requirement_id === tempId) nextPayload.requirement_id = newId;

                  await db.syncQueue.update(rel.id, {
                    entityId: newId,
                    payload: nextPayload,
                  });
                }

                // Keep cache metadata count accurate
                const metaKey = `requirements_${createdUserId}`;
                const meta = await db.cacheMetadata.get(metaKey);
                if (meta) {
                  const count = await db.requirements.where('user_id').equals(createdUserId).count();
                  await db.cacheMetadata.put({
                    ...meta,
                    count,
                  });
                }
              });
            }
          } else if (item.operation === 'UPDATE') {
            const { error } = await supabase.from('requirements').update(item.payload as Record<string, unknown>).eq('id', item.entityId).select();
            if (error) throw error;
          } else if (item.operation === 'DELETE') {
            const { error } = await supabase.from('requirements').delete().eq('id', item.entityId);
            if (error) throw error;
          }
        } else {
          const table = `${item.entityType}s`;
          if (item.operation === 'CREATE') {
            const { data, error } = await supabase.from(table).insert(item.payload as Record<string, unknown>).select('*');
            if (error) throw error;

            // Handle temp-id replacement for created entities similarly to requirements
            const created = (data && data.length > 0 ? data[0] : null) as Record<string, any> | null;
            const tempId = item.entityId;
            if (created && typeof created.id === 'string' && tempId.startsWith('temp-')) {
              const newId = created.id;
              const createdUserId = created.user_id as string | undefined;
              const dbTable = (db as any)[table] as Dexie.Table<any, string> | undefined;
              if (dbTable) {
                await db.transaction('rw', dbTable, db.syncQueue, db.cacheMetadata, async () => {
                  const existingTemp = await dbTable.get(tempId);
                  if (existingTemp) {
                    await dbTable.delete(tempId);
                  }
                  await dbTable.put(created);

                  // Rewrite any queued operations that referenced the tempId to the real id
                  const related = await db.syncQueue.where('entityId').equals(tempId).toArray();
                  for (const rel of related) {
                    if (rel.id === item.id) continue;
                    const nextPayload: Record<string, unknown> = { ...(rel.payload || {}) };
                    if (nextPayload.id === tempId) nextPayload.id = newId;
                    if (nextPayload.requirement_id === tempId) nextPayload.requirement_id = newId;

                    await db.syncQueue.update(rel.id, {
                      entityId: newId,
                      payload: nextPayload,
                    });
                  }

                  // Update metadata count if applicable
                  if (createdUserId) {
                    const metaKey = `${item.entityType}s_${createdUserId}`;
                    const meta = await db.cacheMetadata.get(metaKey);
                    if (meta) {
                      const count = await dbTable.where('user_id').equals(createdUserId).count();
                      await db.cacheMetadata.put({ ...meta, count });
                    }
                  }
                });
              }
            }
          } else if (item.operation === 'UPDATE') {
            const { error } = await supabase.from(table).update(item.payload as Record<string, unknown>).eq('id', item.entityId);
            if (error) throw error;
          } else if (item.operation === 'DELETE') {
            const { error } = await supabase.from(table).delete().eq('id', item.entityId);
            if (error) throw error;
          }
        }

        // success: remove from queue
        await db.syncQueue.delete(item.id);
        dispatchSyncQueueChanged();
        console.debug(`[offlineDB] processSyncQueue: SUCCESS id=${item.id}`);
        processed++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const retries = (item.retries ?? 0) + 1;
        // Exponential backoff capped at 1 hour
        const nextAttempt = Date.now() + Math.min(60 * 60 * 1000, Math.pow(2, retries) * 1000);
        await db.syncQueue.update(item.id, {
          status: 'failed',
          lastError: errMsg,
          retries,
          nextAttempt,
        } as Partial<SyncQueueItem>);
        dispatchSyncQueueChanged();
        // Emit a global event so UI can show error details
        if (typeof window !== 'undefined') {
          try {
            window.dispatchEvent(new CustomEvent('sync-error', { detail: { id: item.id, entityType: item.entityType, entityId: item.entityId, error: errMsg } }));
          } catch (dispatchErr) {
            // ignore dispatch errors but log for debug
            console.debug('[processSyncQueue] failed to dispatch sync-error event', dispatchErr);
          }
        }
        console.debug(`[offlineDB] processSyncQueue: FAILED id=${item.id} retries=${retries} nextAttempt=${new Date(nextAttempt).toISOString()}`);
        failed++;
      }
    }

    return { processed, failed, conflicts };
  } catch (error) {
    console.error('Failed to process sync queue:', error);
    return { processed: 0, failed: 0, conflicts: 0 };
  }
}

// ============= FEATURE 3: EXPANDED CACHE COVERAGE =============

/**
 * Cache documents data locally
 */
export async function cacheDocuments(
  documents: CachedDocument[],
  userId: string
): Promise<void> {
  try {
    await db.transaction('rw', db.documents, db.cacheMetadata, async () => {
      const existing = await db.documents.where('user_id').equals(userId).toArray();
      const newIds = new Set(documents.map(d => d.id));
      const toDelete = existing.filter(d => !newIds.has(d.id)).map(d => d.id);
      if (toDelete.length) await db.documents.bulkDelete(toDelete as string[]);

      const CHUNK = 500;
      for (let i = 0; i < documents.length; i += CHUNK) {
        await db.documents.bulkPut(documents.slice(i, i + CHUNK));
      }

      await db.cacheMetadata.put({
        key: `documents_${userId}`,
        lastUpdated: Date.now(),
        expiresAt: Date.now() + CACHE_DURATIONS.DOCUMENTS,
        count: documents.length,
      });
    });
  } catch (error) {
    console.error('Failed to cache documents:', error);
  }
}

/**
 * Get cached documents for offline use
 */
export async function getCachedDocuments(userId: string, allowExpired: boolean = false): Promise<CachedDocument[] | null> {
  try {
    const metadata = await db.cacheMetadata.get(`documents_${userId}`);
    if (!metadata) return null;

    const isExpired = metadata.expiresAt < Date.now();
    const isOffline = !navigator.onLine;
    if (isExpired && !isOffline && !allowExpired) return null;
    if (isExpired && (isOffline || allowExpired)) console.log(`[getCachedDocuments] Using expired cache (offline: ${isOffline})`);

    return await db.documents.where('user_id').equals(userId).toArray();
  } catch (error) {
    console.error('Failed to get cached documents:', error);
    return null;
  }
}

/**
 * Cache emails data locally
 */
export async function cacheEmails(
  emails: CachedEmail[],
  userId: string
): Promise<void> {
  try {
    // Bulk upsert emails in chunks (avoid deleting globally, emails can be global across requirements)
    await db.transaction('rw', db.emails, db.cacheMetadata, async () => {
      const CHUNK = 500;
      for (let i = 0; i < emails.length; i += CHUNK) {
        await db.emails.bulkPut(emails.slice(i, i + CHUNK));
      }

      await db.cacheMetadata.put({
        key: `emails_${userId}`,
        lastUpdated: Date.now(),
        expiresAt: Date.now() + CACHE_DURATIONS.EMAILS,
        count: emails.length,
      });
    });
  } catch (error) {
    console.error('Failed to cache emails:', error);
  }
}

/**
 * Get cached emails for offline use
 */
export async function getCachedEmails(userId?: string, allowExpired: boolean = false): Promise<CachedEmail[] | null> {
  try {
    if (userId) {
      const metadata = await db.cacheMetadata.get(`emails_${userId}`);
      if (!metadata) return null;

      const isExpired = metadata.expiresAt < Date.now();
      const isOffline = !navigator.onLine;
      if (isExpired && !isOffline && !allowExpired) return null;
      if (isExpired && (isOffline || allowExpired)) console.log(`[getCachedEmails] Using expired cache (offline: ${isOffline})`);

      return await db.emails.where('user_id').equals(userId).toArray();
    }

    return await db.emails.toArray();
  } catch (error) {
    console.error('Failed to get cached emails:', error);
    return null;
  }
}

// ============= FEATURE 5: CACHE STORAGE MANAGEMENT =============

/**
 * Get current cache size in bytes
 */
export async function getCacheSize(): Promise<number> {
  try {
    if (navigator.storage?.estimate) {
      const estimate = await navigator.storage.estimate();
      return estimate.usage || 0;
    }
    return 0;
  } catch (error) {
    console.error('Failed to get cache size:', error);
    return 0;
  }
}

/**
 * Get cache quota in bytes
 */
export async function getCacheQuota(): Promise<number> {
  try {
    if (navigator.storage?.estimate) {
      const estimate = await navigator.storage.estimate();
      return estimate.quota || 0;
    }
    return 0;
  } catch (error) {
    console.error('Failed to get cache quota:', error);
    return 0;
  }
}

/**
 * Request persistent storage permission
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) {
      return await navigator.storage.persist();
    }
    return false;
  } catch (error) {
    console.error('Failed to request persistent storage:', error);
    return false;
  }
}

// ============= FEATURE 6: SYNC PROGRESS TRACKING =============

/**
 * Get current sync status
 */
export async function getSyncStatus(): Promise<SyncStatus> {
  try {
    const queue = await db.syncQueue.toArray();
    const syncing = queue.filter(q => q.status === 'syncing');
    const failed = queue.filter(q => q.status === 'failed');
    const metadata = await db.cacheMetadata.get('lastSyncTime');

    const totalItems = queue.length;
    const completedItems = totalItems - syncing.length;
    const progress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 100;

    return {
      isSyncing: syncing.length > 0,
      itemsRemaining: syncing.length,
      lastSyncTime: metadata?.lastUpdated ?? null,
      failedItems: failed.length,
      progress,
      totalItems,
    };
  } catch (error) {
    console.error('Failed to get sync status:', error);
    return {
      isSyncing: false,
      itemsRemaining: 0,
      lastSyncTime: null,
      failedItems: 0,
      progress: 100,
      totalItems: 0,
    };
  }
}

/**
 * Update last sync time
 */
export async function updateLastSyncTime(): Promise<void> {
  try {
    await db.cacheMetadata.put({
      key: 'lastSyncTime',
      lastUpdated: Date.now(),
      expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year
    });
  } catch (error) {
    console.error('Failed to update last sync time:', error);
  }
}

// ============= FEATURE 7: CONFLICT RESOLUTION =============

/**
 * Record a conflict for resolution
 */
export async function recordConflict(
  entityType: string,
  entityId: string,
  localVersion: Record<string, unknown>,
  remoteVersion: Record<string, unknown>
): Promise<void> {
  try {
    const conflict: ConflictRecord = {
      id: `${entityType}-${entityId}-${Date.now()}`,
      entityType,
      entityId,
      strategy: 'local', // Default to local, user can change
      timestamp: Date.now(),
      localVersion,
      remoteVersion,
    };

    await db.conflicts.add(conflict);
  } catch (error) {
    console.error('Failed to record conflict:', error);
  }
}

/**
 * Get unresolved conflicts
 */
export async function getUnresolvedConflicts(): Promise<ConflictRecord[]> {
  try {
    return await db.conflicts.toArray();
  } catch (error) {
    console.error('Failed to get conflicts:', error);
    return [];
  }
}

/**
 * Clear resolved conflicts
 */
export async function clearResolvedConflicts(): Promise<void> {
  try {
    await db.conflicts.clear();
  } catch (error) {
    console.error('Failed to clear conflicts:', error);
  }
}

// ============= FEATURE 4: SMART PRELOADING =============

/**
 * Preload all user data for offline access
 * This function should be called when user is online to proactively cache data
 */
export async function preloadUserData(userId?: string): Promise<void> {
  try {
    // Only preload if online
    if (!navigator.onLine) {
      console.log('[preloadUserData] Skipping preload - device is offline');
      return;
    }

    if (!userId) {
      console.warn('[preloadUserData] No userId provided, skipping preload');
      return;
    }

    const prefs = await getCachePreferences();
    const defaultPrefs: CachePreferences = {
      key: 'userPreferences',
      cacheRequirements: true,
      cacheConsultants: true,
      cacheInterviews: true,
      cacheDocuments: true,
      cacheEmails: true,
      maxCacheSize: 100,
      syncOnWiFiOnly: false,
    };
    const effectivePrefs = prefs || defaultPrefs;

    // Dynamically import API functions to avoid circular dependencies
    const [
      { getRequirementsPage },
      { getConsultants },
      { getInterviews },
    ] = await Promise.all([
      import('./api/requirements'),
      import('./api/consultants'),
      import('./api/interviews'),
    ]);

    const preloadPromises: Promise<void>[] = [];

    // Preload requirements
    if (effectivePrefs.cacheRequirements) {
      preloadPromises.push(
        getRequirementsPage({ userId, limit: 1000, includeCount: false })
          .then(result => {
            if (result.success && result.requirements) {
              const cachedReqs = result.requirements.map(r => ({ ...r } as CachedRequirement));
              return cacheRequirements(cachedReqs, userId);
            }
          })
          .then(() => console.log('[preloadUserData] Requirements cached'))
          .catch(err => console.error('[preloadUserData] Failed to cache requirements:', err))
      );
    }

    // Preload consultants
    if (effectivePrefs.cacheConsultants) {
      preloadPromises.push(
        getConsultants(userId)
          .then(result => {
            if (result.success && result.consultants) {
              const cachedCons = result.consultants.map(c => ({ ...c } as CachedConsultant));
              return cacheConsultants(cachedCons, userId);
            }
          })
          .then(() => console.log('[preloadUserData] Consultants cached'))
          .catch(err => console.error('[preloadUserData] Failed to cache consultants:', err))
      );
    }

    // Preload interviews
    if (effectivePrefs.cacheInterviews) {
      preloadPromises.push(
        getInterviews(userId)
          .then(result => {
            if (result.success && result.interviews) {
              const cachedInts = result.interviews.map(i => ({ ...i } as CachedInterview));
              return cacheInterviews(cachedInts, userId);
            }
          })
          .then(() => console.log('[preloadUserData] Interviews cached'))
          .catch(err => console.error('[preloadUserData] Failed to cache interviews:', err))
      );
    }

    // Note: Documents and emails preloading would require their respective API functions
    // For now, we'll skip them as they may not be available or may require different handling

    await Promise.allSettled(preloadPromises);
    console.log('[preloadUserData] Preload completed');
  } catch (error) {
    console.error('[preloadUserData] Failed to preload user data:', error);
  }
}

// ============= FEATURE 8: SELECTIVE SYNC =============

/**
 * Get cache preferences
 */
export async function getCachePreferences(): Promise<CachePreferences | undefined> {
  try {
    return await db.cachePreferences.get('userPreferences');
  } catch (error) {
    console.error('Failed to get cache preferences:', error);
    return undefined;
  }
}

/**
 * Save cache preferences
 */
export async function saveCachePreferences(prefs: CachePreferences): Promise<void> {
  try {
    const prefsWithKey = { ...prefs, key: 'userPreferences' };
    await db.cachePreferences.put(prefsWithKey);
  } catch (error) {
    console.error('Failed to save cache preferences:', error);
  }
}

// ============= FEATURE 9: BACKGROUND SYNC API =============

/**
 * Register background sync
 */
export async function registerBackgroundSync(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;

      // If Background Sync API is available, register a sync tag
      const regWithSync = registration as unknown as { sync?: { register: (tag: string) => Promise<void> } };
      if ('SyncManager' in window && regWithSync.sync && typeof regWithSync.sync.register === 'function') {
        await regWithSync.sync.register('sync-offline-queue');
        console.log('Background sync registered');
      } else {
        // Fallback: notify service worker to use a messaging-based fallback
        if (registration.active && typeof registration.active.postMessage === 'function') {
          registration.active.postMessage({ type: 'register-sync-fallback' });
          console.log('Background sync not supported; fallback message sent to service worker');
        }
      }
    }
  } catch (error) {
    console.error('Failed to register background sync:', error);
  }
}

// ============= FEATURE 10: CACHE ANALYTICS =============

/**
 * Get cache analytics
 */
export async function getCacheAnalytics(): Promise<CacheAnalytics | undefined> {
  try {
    return await db.analytics.get('cacheStats');
  } catch (error) {
    console.error('Failed to get cache analytics:', error);
    return undefined;
  }
}

/**
 * Record analytics event
 */
export async function recordAnalytics(event: string, data: Record<string, unknown>): Promise<void> {
  try {
    const existing = await db.analytics.get('cacheStats');
    const analytics: CacheAnalytics = existing || {
      key: 'cacheStats',
      offlineTime: 0,
      itemsCreatedOffline: 0,
      itemsUpdatedOffline: 0,
      itemsDeletedOffline: 0,
      syncSuccessRate: 100,
      averageSyncTime: 0,
      totalSyncEvents: 0,
    };

    if (event === 'offline_create') analytics.itemsCreatedOffline += 1;
    if (event === 'offline_update') analytics.itemsUpdatedOffline += 1;
    if (event === 'offline_delete') analytics.itemsDeletedOffline += 1;
    if (event === 'sync_complete') analytics.totalSyncEvents += 1;
    if (event === 'offline_time' && typeof data.minutes === 'number') {
      analytics.offlineTime += data.minutes;
    }

    await db.analytics.put(analytics);
  } catch (error) {
    console.error('Failed to record analytics:', error);
  }
}

// ============= DRAFT HELPERS (simple localStorage-backed) =============
// These helpers provide a lightweight draft persistence mechanism so forms
// can save in-progress state across reloads even when offline.
export async function saveDraft(key: string, data: Record<string, unknown> | string): Promise<void> {
  try {
    let value = typeof data === 'string' ? data : JSON.stringify(data);

    // Redact sensitive fields before persisting drafts to IndexedDB/localStorage
    try {
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      const redacted = redactSensitiveFields(parsed);
      value = JSON.stringify(redacted);
    } catch (err) {
      // non-JSON payload - keep as-is
      console.debug('[offline] saveDraft non-json payload', err);
    }

    // If encryption unlocked, encrypt value before storing
    if (runtimeDraftKey) {
      try {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const enc = new TextEncoder().encode(value);
        const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, runtimeDraftKey, enc);
        const stored = JSON.stringify({ encrypted: true, iv: bufToBase64(iv.buffer), data: bufToBase64(cipher) });
        await db.drafts.put({ key, value: stored, updatedAt: Date.now() });
        console.debug(`[offlineDB] saveDraft: saved encrypted draft key=${key} size=${stored.length}`);
        return;
      } catch (e) {
        console.warn('[offline] draft encryption failed, falling back to plaintext save', e);
      }
    }

    // Prefer IndexedDB drafts table
    await db.drafts.put({ key, value, updatedAt: Date.now() });
    console.debug(`[offlineDB] saveDraft: saved plaintext draft key=${key} size=${value.length}`);
  } catch (err) {
    console.warn('IndexedDB draft save failed, falling back to localStorage', err);
    try {
      const value = typeof data === 'string' ? data : JSON.stringify(data);
      localStorage.setItem(`offline_draft:${key}`, value);
      console.debug(`[offlineDB] saveDraft: saved fallback localStorage draft key=${key} size=${value.length}`);
    } catch (e) {
      console.error('Failed to save draft to localStorage:', e);
    }
  }
}

// Redact common sensitive fields from draft objects to avoid storing PII/secrets
export function redactSensitiveFields(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  const SENSITIVE_KEYS = ['password', 'token', 'access_token', 'refresh_token', 'ssn', 'creditCard', 'cardNumber'];
  const clone: any = Array.isArray(obj) ? [] : {};
  for (const k of Object.keys(obj)) {
    try {
      const v = obj[k];
      if (SENSITIVE_KEYS.includes(k)) {
        clone[k] = 'REDACTED';
      } else if (typeof v === 'object' && v !== null) {
        clone[k] = redactSensitiveFields(v);
      } else {
        clone[k] = v;
      }
    } catch {
      clone[k] = obj[k];
    }
  }
  return clone;
}

export async function getDraft(key: string): Promise<Record<string, unknown> | string | null> {
  try {
    const rec = await db.drafts.get(key);
    if (rec && rec.value != null) {
      // Try parse stored value
      try {
        const parsed = JSON.parse(rec.value);
        if (parsed && parsed.encrypted) {
          // Encrypted draft
          if (!runtimeDraftKey) {
            // Not unlocked
            return { __encrypted: true } as any;
          }
          try {
            const iv = base64ToArrayBuffer(String(parsed.iv));
            const data = base64ToArrayBuffer(String(parsed.data));
            const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(iv) }, runtimeDraftKey, data);
            const decoded = new TextDecoder().decode(plainBuf);
            try {
              return JSON.parse(decoded) as Record<string, unknown>;
            } catch {
              return decoded;
            }
          } catch (de) {
            console.error('Failed to decrypt draft', de);
            return null;
          }
        }
        // Not encrypted
        return parsed as Record<string, unknown>;
      } catch {
        return rec.value;
      }
    }
  } catch (err) {
    console.warn('IndexedDB draft read failed, falling back to localStorage', err);
  }

  try {
    const value = localStorage.getItem(`offline_draft:${key}`);
    if (!value) return null;
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return value;
    }
  } catch (e) {
    console.error('Failed to get draft from localStorage:', e);
    return null;
  }
}

export async function clearDraft(key: string): Promise<void> {
  try {
    await db.drafts.delete(key);
  } catch (err) {
    console.warn('IndexedDB draft delete failed, falling back to localStorage', err);
    try {
      localStorage.removeItem(`offline_draft:${key}`);
    } catch (e) {
      console.error('Failed to clear draft from localStorage:', e);
    }
  }
}

// ----------------- Encryption-at-rest for drafts -----------------
let runtimeDraftKey: CryptoKey | null = null;

function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function deriveKeyFromPassphrase(passphrase: string, saltBase64: string): Promise<CryptoKey> {
  const salt = base64ToArrayBuffer(saltBase64);
  const enc = new TextEncoder().encode(passphrase);
  const baseKey = await crypto.subtle.importKey('raw', enc, { name: 'PBKDF2' }, false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt, iterations: 100000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  return key;
}

export async function setDraftEncryptionPassphrase(passphrase: string): Promise<void> {
  try {
    // generate salt
    const saltBytes = crypto.getRandomValues(new Uint8Array(16));
    const saltB64 = bufToBase64(saltBytes.buffer);
    // store verifier hash and salt in localStorage
    const verifier = await hashPassword(passphrase);
    // Prefer storing metadata in IndexedDB cacheMetadata
    await db.cacheMetadata.put({ key: 'draft_enc_salt', lastUpdated: Date.now(), expiresAt: 0, value: saltB64 });
    await db.cacheMetadata.put({ key: 'draft_enc_verifier', lastUpdated: Date.now(), expiresAt: 0, value: verifier });
    await db.cacheMetadata.put({ key: 'draft_encryption_enabled', lastUpdated: Date.now(), expiresAt: 0, value: '1' });
    // derive and cache runtime key
    runtimeDraftKey = await deriveKeyFromPassphrase(passphrase, saltB64);
  } catch (err) {
    console.error('Failed to set draft encryption passphrase', err);
    throw err;
  }
}

export async function unlockDraftEncryption(passphrase: string): Promise<boolean> {
  try {
    // Prefer reading from IndexedDB
    const saltRec = await db.cacheMetadata.get('draft_enc_salt');
    const verRec = await db.cacheMetadata.get('draft_enc_verifier');
    let saltB64 = saltRec?.value ?? null;
    let verifier = verRec?.value ?? null;
    // fallback to localStorage for older installs
    if (!saltB64) saltB64 = localStorage.getItem('draft_enc_salt');
    if (!verifier) verifier = localStorage.getItem('draft_enc_verifier');
    if (!saltB64 || !verifier) return false;
    const ok = await hashPassword(passphrase);
    if (ok !== verifier) return false;
    runtimeDraftKey = await deriveKeyFromPassphrase(passphrase, saltB64);
    return true;
  } catch (err) {
    console.error('Failed to unlock draft encryption', err);
    return false;
  }
}

export function lockDraftEncryption(): void {
  runtimeDraftKey = null;
}

export async function disableDraftEncryption(): Promise<void> {
  try {
    await db.cacheMetadata.delete('draft_encryption_enabled');
    await db.cacheMetadata.delete('draft_enc_salt');
    await db.cacheMetadata.delete('draft_enc_verifier');
    try { localStorage.removeItem('draft_enc_salt'); } catch (e) { console.debug('[offline] ignore localStorage remove draft_enc_salt', e); }
    try { localStorage.removeItem('draft_enc_verifier'); } catch (e) { console.debug('[offline] ignore localStorage remove draft_enc_verifier', e); }
    try { localStorage.removeItem('draft_encryption_enabled'); } catch (e) { console.debug('[offline] ignore localStorage remove draft_encryption_enabled', e); }
    lockDraftEncryption();
  } catch (err) {
    console.error('Failed to disable draft encryption', err);
  }
}

export async function isDraftEncryptionEnabled(): Promise<boolean> {
  try {
    const rec = await db.cacheMetadata.get('draft_encryption_enabled');
    if (rec && rec.value === '1') return true;
  } catch (e) {
    console.debug('[offline] isDraftEncryptionEnabled check failed', e);
  }
  return !!localStorage.getItem('draft_encryption_enabled');
}

// Migrate any existing localStorage drafts into IndexedDB on first run
export async function migrateLocalDraftsToIndexedDB(): Promise<number> {
  try {
    const migratedFlag = 'offline_drafts_migrated_v1';
    if (localStorage.getItem(migratedFlag)) return 0;

    const prefix = 'offline_draft:';
    const keysToMigrate: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) keysToMigrate.push(key);
    }

    if (keysToMigrate.length === 0) {
      // Still mark migration attempted so we don't scan repeatedly
      localStorage.setItem(migratedFlag, '1');
      return 0;
    }

    let migratedCount = 0;
    let enqueuedCount = 0;

    for (const k of keysToMigrate) {
      try {
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        const key = k.substring(prefix.length);
        await db.drafts.put({ key, value: raw, updatedAt: Date.now() });

        // Try to map the draft into a syncQueue item automatically
        try {
          const mapped = await mapDraftToSyncQueue(key, raw);
          if (mapped) {
            // If mapped, remove the draft after enqueuing
            await db.drafts.delete(key);
            enqueuedCount += 1;
          }
        } catch (me) {
          console.warn('Failed to map draft to sync queue', key, me);
        }

        // cleanup localStorage copy
        localStorage.removeItem(k);
        migratedCount += 1;
      } catch (err) {
        console.warn('Failed migrating draft', k, err);
      }
    }

    localStorage.setItem(migratedFlag, '1');
    // record analytics about migration
    try {
      await recordAnalytics('drafts_migrated', { migrated: migratedCount, enqueued: enqueuedCount });
    } catch {
      // swallow analytics errors
    }

    return migratedCount;
  } catch (err) {
    console.error('Failed to migrate localStorage drafts to IndexedDB:', err);
    return 0;
  }
}

// Attempt to interpret a draft and enqueue a syncQueue item for it
export async function mapDraftToSyncQueue(key: string, rawValue: string): Promise<boolean> {
  try {
    console.debug(`[offlineDB] mapDraftToSyncQueue: mapping draft key=${key} sample=${rawValue ? rawValue.slice(0,200) : ''}`);
    const knownEntities = ['requirement', 'consultant', 'interview', 'document', 'email'];
    let entityType: SyncQueueItem['entityType'] | null = null;
    let operation: SyncQueueItem['operation'] = 'CREATE';
    let entityId = 'temp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    let payload: Record<string, unknown> = { raw: rawValue };

    // Infer entityType from key pattern first: supports 'entity:id', 'draft:entity:id', 'draft:entity'
    const keyParts = key.split(':').filter(Boolean);
    if (keyParts.length > 0) {
      // pattern: 'requirement:123' or 'draft:requirement:unsaved'
      if (knownEntities.includes(keyParts[0])) {
        entityType = keyParts[0] as SyncQueueItem['entityType'];
        if (keyParts[1]) entityId = keyParts[1];
      } else if (keyParts[0] === 'draft' && keyParts.length > 1 && knownEntities.includes(keyParts[1])) {
        entityType = keyParts[1] as SyncQueueItem['entityType'];
        if (keyParts[2]) entityId = keyParts[2];
      }
    }


    // Templates for draft shapes. These are used to deterministically map
    // free-form drafts into entity sync operations. You can extend these
    // templates if your forms produce additional shapes.
    const DRAFT_TEMPLATES: Record<string, string[]> = {
      requirement: ['title', 'company', 'status'],
      consultant: ['name', 'email', 'status'],
      interview: ['requirement_id', 'scheduled_date', 'status'],
      document: ['name', 'type'],
      email: ['subject', 'from', 'to'],
    };

    // Try to parse JSON and infer operation/id and payload
    let parsed: any = null;
    try {
      parsed = JSON.parse(rawValue);
      if (parsed && typeof parsed === 'object') {
        payload = parsed as Record<string, unknown>;
        if ('id' in parsed && parsed.id) {
          operation = 'UPDATE';
          entityId = String((parsed as any).id);
        } else {
          operation = 'CREATE';
        }
        if (!entityType && (parsed as any).entityType) {
          const et = String((parsed as any).entityType);
          if (knownEntities.includes(et)) entityType = et as any;
        }
        // Accept also common type hints
        if (!entityType) {
          const hint = (parsed as any).type || (parsed as any)._type || (parsed as any).kind;
          if (hint && typeof hint === 'string' && knownEntities.includes(String(hint))) {
            entityType = String(hint) as any;
          }
        }
      }
    } catch {
      // not JSON - keep raw payload
    }

    // If no entityType yet, attempt deterministic inference using templates
    if (!entityType && parsed && typeof parsed === 'object') {
      const scores: Record<string, number> = {};
      for (const ent of Object.keys(DRAFT_TEMPLATES)) {
        const keys = DRAFT_TEMPLATES[ent];
        let match = 0;
        for (const k of keys) if (k in parsed) match++;
        scores[ent] = match;
      }
      // Determine best candidate and require a minimum confidence
      const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
      if (sorted.length > 0) {
        const [bestEnt, bestMatch] = sorted[0];
        const totalKeys = DRAFT_TEMPLATES[bestEnt].length || 1;
        const matchRatio = bestMatch / totalKeys;
        // Confidence threshold: at least 50% keys match OR at least 2 explicit key matches
        if (bestMatch >= 2 || matchRatio >= 0.5) {
          entityType = bestEnt as SyncQueueItem['entityType'];
        }
      }
      // Special-case email drafts even if they score low: presence of 'subject' and ('to' or 'from')
      if (!entityType && 'subject' in parsed && ('to' in parsed || 'from' in parsed)) {
        entityType = 'email';
      }
      // Special-case documents: name + (content|fileName)
      if (!entityType && 'name' in parsed && ('content' in parsed || 'fileName' in parsed)) {
        entityType = 'document';
      }
    }

    // If key pattern indicates entity (e.g., 'requirement:123' or 'draft:requirement:123'), extract it
    if (!entityType) {
      const parts = key.split(':').filter(Boolean);
      // patterns like 'requirement', 'requirement:123', 'draft:requirement:unsaved'
      for (const p of parts) {
        if (knownEntities.includes(p)) {
          entityType = p as any;
          break;
        }
      }
    }

    if (!entityType) {
      try {
        await recordAnalytics('draft_map_failed', { key, sample: rawValue ? rawValue.slice(0, 200) : '' });
      } catch (err) {
        console.debug('[offline] draft mapping analytics failed', err);
      }
      console.debug(`[offlineDB] mapDraftToSyncQueue: failed to infer entityType for key=${key}`);
      return false;
    }

    // Enqueue to syncQueue
    try {
      const id = await addToSyncQueue(operation, entityType, entityId, payload as Record<string, unknown>);
      console.debug(`[offlineDB] mapDraftToSyncQueue: enqueued id=${id} op=${operation} entity=${entityType}/${entityId} payloadKeys=${Object.keys(payload || {}).slice(0,10).join(',')}`);
      return true;
    } catch (err) {
      console.warn('Failed to add draft to sync queue', key, err);
      return false;
    }
  } catch (err) {
    console.error('mapDraftToSyncQueue unexpected error', err);
    return false;
  }
}

// Prune drafts older than `maxAgeMs` (default 30 days)
export async function pruneOldDrafts(maxAgeMs = 30 * 24 * 60 * 60 * 1000): Promise<number> {
  try {
    const cutoff = Date.now() - maxAgeMs;
    const all = await db.drafts.where('updatedAt').below(cutoff).toArray();
    const keys = all.map((r: any) => r.key);
    console.debug(`[offlineDB] pruneOldDrafts: pruning ${keys.length} drafts older than ${new Date(cutoff).toISOString()}`);
    await Promise.all(keys.map((k) => db.drafts.delete(k)));
    return keys.length;
  } catch (err) {
    console.error('Failed to prune old drafts', err);
    return 0;
  }
}

// Enforce limits on draft storage: max entries and max total bytes.
export async function enforceDraftStorageLimits(options?: { maxEntries?: number; maxTotalBytes?: number }): Promise<{ pruned: number; bytesFreed: number }> {
  const maxEntries = options?.maxEntries ?? 1000; // default max drafts
  const maxTotalBytes = options?.maxTotalBytes ?? 5 * 1024 * 1024; // default 5MB
  try {
    const all = await db.drafts.toArray();
    if (!all || all.length === 0) return { pruned: 0, bytesFreed: 0 };

    // Compute sizes (approx) using TextEncoder
    const encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
    const sized = all.map((r: any) => {
      const raw = typeof r.value === 'string' ? r.value : JSON.stringify(r.value || '');
      const bytes = encoder ? encoder.encode(raw).length : raw.length;
      return { key: r.key, updatedAt: r.updatedAt, bytes };
    });

    let totalBytes = sized.reduce((s, x) => s + x.bytes, 0);
    let pruned = 0;
    let bytesFreed = 0;

    // If within limits, nothing to do
    if (sized.length <= maxEntries && totalBytes <= maxTotalBytes) {
      return { pruned: 0, bytesFreed: 0 };
    }

    // Sort by oldest first
    sized.sort((a, b) => a.updatedAt - b.updatedAt);

    const toDelete: string[] = [];
    // First ensure entry count
    while (sized.length - toDelete.length > maxEntries) {
      const item = sized.shift();
      if (item) toDelete.push(item.key);
    }

    // Recompute totalBytes after entry pruning
    totalBytes = sized.reduce((s, x) => s + x.bytes, 0);

    // Then prune by size if necessary
    while (totalBytes > maxTotalBytes && sized.length > 0) {
      const item = sized.shift();
      if (!item) break;
      toDelete.push(item.key);
      totalBytes -= item.bytes;
    }

    if (toDelete.length > 0) {
      await Promise.all(toDelete.map((k) => db.drafts.delete(k)));
      pruned = toDelete.length;
      bytesFreed = toDelete.reduce((s, k) => s + (sized.find(x => x.key === k)?.bytes || 0), 0);
      try {
        await recordAnalytics('drafts_pruned', { pruned, bytesFreed });
      } catch (e) {
        console.debug('[offline] recordAnalytics drafts_pruned failed', e);
      }
    }

    return { pruned, bytesFreed };
  } catch (err) {
    console.error('Failed to enforce draft storage limits', err);
    return { pruned: 0, bytesFreed: 0 };
  }
}

export async function getAllDrafts(): Promise<Array<{ key: string; value: string; updatedAt: number }>> {
  try {
    const all = await db.drafts.toArray();
    return all.map((r: any) => ({ key: r.key, value: r.value, updatedAt: r.updatedAt }));
  } catch (err) {
    console.warn('Failed to read all drafts from IndexedDB, falling back to localStorage', err);
    const prefix = 'offline_draft:';
    const results: Array<{ key: string; value: string; updatedAt: number }> = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) {
        const key = k.substring(prefix.length);
        const raw = localStorage.getItem(k) || '';
        results.push({ key, value: raw, updatedAt: Date.now() });
      }
    }
    return results;
  }
}

// Encrypt all existing plaintext drafts in-place using the runtime key.
export async function encryptAllDrafts(): Promise<{ migrated: number }> {
  try {
    if (!runtimeDraftKey) throw new Error('Encryption key not unlocked');
    const all = await db.drafts.toArray();
    let migrated = 0;
    for (const r of all) {
      try {
        if (!r || !r.value) continue;
        // detect already-encrypted
        let isEncrypted = false;
        try {
          const parsed = JSON.parse(r.value);
          if (parsed && parsed.encrypted) isEncrypted = true;
        } catch {
          // not JSON
        }
        if (isEncrypted) continue;
        const plain = typeof r.value === 'string' ? r.value : JSON.stringify(r.value);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const enc = new TextEncoder().encode(plain);
        const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, runtimeDraftKey, enc);
        const stored = JSON.stringify({ encrypted: true, iv: bufToBase64(iv.buffer), data: bufToBase64(cipher) });
        await db.drafts.put({ key: r.key, value: stored, updatedAt: Date.now() });
        migrated += 1;
      } catch (e) {
        console.warn('[offline] encrypt draft failed for', r && r.key, e);
      }
    }
    try { await recordAnalytics('drafts_encrypted_migrated', { migrated }); } catch { console.debug('[analytics] migrated failed'); }
    return { migrated };
  } catch (err) {
    console.error('Failed to encrypt all drafts', err);
    return { migrated: 0 };
  }
}

// Auto-process sync queue when the app regains connectivity
if (typeof window !== 'undefined') {
  window.addEventListener('online', async () => {
    try {
      console.log('[offlineDB] Online - processing sync queue');
      const res = await processSyncQueue(20);
      if (res.processed > 0) {
        await updateLastSyncTime();
        await recordAnalytics('sync_complete', {});
      }
    } catch (err) {
      console.error('[offlineDB] Failed processing sync on reconnect', err);
    }
  });
}
