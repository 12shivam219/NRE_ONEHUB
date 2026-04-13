import { useEffect, useMemo, useState } from 'react';
import { Clock, User, Shield, Activity } from 'lucide-react';
import { getResourceActivityLogs } from '../../lib/api/audit';
import { getUserName } from '../../lib/api/requirements';

type LogEntry = {
  id: string;
  action: string;
  created_at: string;
  user_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
};

interface ResourceAuditTimelineProps {
  resourceType: string;
  resourceId: string;
  title?: string;
}

const formatDateTime = (value: string) => {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
};

export const ResourceAuditTimeline = ({ resourceId, resourceType, title = 'Audit trail' }: ResourceAuditTimelineProps) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userNames, setUserNames] = useState<Map<string, { name: string; email?: string }>>(new Map());

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const result = await getResourceActivityLogs({ resourceId, resourceType, limit: 25 });
      if (!result.success || !result.logs) {
        setError(result.error || 'Unable to load audit history');
        setLoading(false);
        return;
      }
      setLogs(result.logs as LogEntry[]);
      setError(null);
      setLoading(false);
    };
    if (resourceId) {
      load();
    }
  }, [resourceId, resourceType]);

  const actorIds = useMemo(
    () => Array.from(new Set(logs.map(log => log.user_id).filter(Boolean))) as string[],
    [logs]
  );

  useEffect(() => {
    const missingIds = actorIds.filter(id => !userNames.has(id));
    
    if (missingIds.length === 0) return;
    
    const fetchActors = async () => {
      const next = new Map(userNames);
      for (const id of missingIds) {
        const user = await getUserName(id);
        next.set(id, { name: user?.full_name || 'Unknown', email: user?.email || undefined });
      }
      setUserNames(next);
    };
    fetchActors();
  }, [actorIds, userNames]);

  if (loading) {
    return (
      <div className="border border-gray-200 rounded-lg p-4 bg-white">
        <p className="text-xs text-gray-500">Loading audit trail…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-amber-200 rounded-lg p-4 bg-amber-50 text-amber-800 text-xs">
        {error}
      </div>
    );
  }

  if (!logs.length) {
    return (
      <div className="border border-gray-200 rounded-lg p-4 bg-white">
        <p className="text-xs text-gray-500">No audit entries yet.</p>
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded-lg bg-white">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
        <Activity className="w-4 h-4 text-primary-600" />
        <h4 className="text-xs font-medium text-gray-900">{title}</h4>
      </div>
      <ul className="divide-y divide-gray-100">
        {logs.map((log) => {
          const actor = log.user_id ? userNames.get(log.user_id) : null;
          const actorLabel = actor && typeof actor.name === 'string' ? actor.name : 'Unknown';
          const description = log.details && typeof log.details === 'object' && 'description' in log.details
            ? ((log.details as Record<string, unknown>).description as string | null)
            : null;
          
          return (
            <li key={log.id} className="px-4 py-3 space-y-1">
              <div className="flex items-center gap-2 text-xs text-gray-700">
                <Shield className="w-4 h-4 text-gray-400" />
                <span className="font-semibold text-gray-900">{log.action.replace(/_/g, ' ')}</span>
              </div>
              <div className="flex flex-wrap gap-3 items-center text-xs text-gray-600">
                <span className="inline-flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-gray-400" />
                  {actorLabel}
                  {actor?.email ? <span className="text-gray-500">({actor.email})</span> : null}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-gray-400" />
                  {formatDateTime(log.created_at)}
                </span>
              </div>
              {description && typeof description === 'string' && (
                <p className="text-sm text-gray-700 font-medium">{description}</p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

