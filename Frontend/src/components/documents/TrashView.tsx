import { useState, useEffect, useCallback, useMemo } from 'react';
import { Trash2, RotateCcw, Trash, AlertCircle, ChevronLeft } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../contexts/ToastContext';
import { getUserTrash, restoreFromTrash, permanentlyDeleteDocument } from '../../lib/api/documents';
import { formatFileSize } from '../../lib/dateFormatter';
import { getRelativeTime } from '../../lib/dateFormatter';
import { ConfirmDialog } from '../common/ConfirmDialog';

type TrashItem = {
  id: string;
  resource_name: string;
  deleted_at: string;
  expires_at: string;
  size_bytes: number;
  resource_type: string;
  resource_id: string;
};

interface TrashViewProps {
  onBack?: () => void;
}

export function TrashView({ onBack }: TrashViewProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [trash, setTrash] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [toDeleteId, setToDeleteId] = useState<string | null>(null);
  const [deletingPermanently, setDeletingPermanently] = useState(false);

  const loadTrash = useCallback(async () => {
    setLoading(true);
    const result = await getUserTrash();
    if (result.success) {
      setTrash(result.trash || []);
    } else {
      showToast({
        type: 'error',
        title: 'Error loading trash',
        message: result.error || 'Failed to load trash'
      });
    }
    setLoading(false);
  }, [showToast]);

  useEffect(() => {
    if (user?.id) {
      loadTrash();
    }
  }, [user?.id, loadTrash, user]);

  const handleRestore = async (trashId: string, resourceName: string) => {
    const result = await restoreFromTrash(trashId);
    if (result.success) {
      showToast({
        type: 'success',
        title: 'Restored',
        message: `"${resourceName}" has been restored`
      });
      loadTrash();
    } else {
      showToast({
        type: 'error',
        title: 'Restore failed',
        message: result.error || 'Failed to restore'
      });
    }
  };

  const handlePermanentDelete = async () => {
    if (!toDeleteId) return;
    
    setDeletingPermanently(true);
    const item = trash.find(t => t.id === toDeleteId);
    
    const result = await permanentlyDeleteDocument(item?.resource_id || '');
    if (result.success) {
      showToast({
        type: 'success',
        title: 'Deleted permanently',
        message: `"${item?.resource_name}" has been permanently deleted`
      });
      loadTrash();
    } else {
      showToast({
        type: 'error',
        title: 'Delete failed',
        message: result.error || 'Failed to permanently delete'
      });
    }
    
    setToDeleteId(null);
    setDeletingPermanently(false);
  };

  // eslint-disable-next-line react-hooks/purity
  const currentTime = useMemo(() => Date.now(), []);

  if (loading) {
    return (
      <div className="p-6 text-center py-12">
        <p className="text-gray-500">Loading trash...</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center gap-4 mb-6">
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            title="Back to Documents"
          >
            <ChevronLeft className="w-5 h-5" />
            <span className="text-sm font-medium">Back</span>
          </button>
        )}
        <Trash2 className="w-6 h-6 text-red-600" />
        <h1 className="text-2xl font-bold">Trash</h1>
        <span className="ml-auto text-sm text-gray-500">
          {trash.length} item{trash.length !== 1 ? 's' : ''}
        </span>
      </div>

      {trash.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <Trash2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Trash is empty</p>
        </div>
      ) : (
        <div className="space-y-2">
          {trash.map((item) => {
            const daysLeft = Math.ceil(
              (new Date(item.expires_at).getTime() - currentTime) / (1000 * 60 * 60 * 24)
            );
            
            return (
              <div 
                key={item.id} 
                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors border border-gray-200"
              >
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{item.resource_name}</p>
                  <div className="flex items-center gap-4 mt-1 text-xs text-gray-600">
                    <span>{formatFileSize(item.size_bytes)}</span>
                    <span>Deleted {getRelativeTime(new Date(item.deleted_at))}</span>
                    {daysLeft <= 7 && (
                      <span className="flex items-center gap-1 text-orange-600">
                        <AlertCircle className="w-3 h-3" />
                        Expires in {daysLeft} day{daysLeft !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleRestore(item.id, item.resource_name)}
                    className="px-3 py-2 bg-blue-100 text-blue-700 rounded text-sm hover:bg-blue-200 transition-colors flex items-center gap-1 font-medium"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Restore
                  </button>
                  <button
                    onClick={() => setToDeleteId(item.id)}
                    className="px-3 py-2 bg-red-100 text-red-700 rounded text-sm hover:bg-red-200 transition-colors flex items-center gap-1 font-medium"
                  >
                    <Trash className="w-4 h-4" />
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Permanent delete confirmation */}
      <ConfirmDialog
        isOpen={toDeleteId !== null}
        title="Delete Permanently?"
        message="This will permanently delete the item and it cannot be recovered."
        confirmLabel="Yes, delete permanently"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={deletingPermanently}
        onConfirm={handlePermanentDelete}
        onClose={() => setToDeleteId(null)}
      />
    </div>
  );
}
