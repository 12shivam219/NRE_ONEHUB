import { memo, useState, useCallback } from 'react';
import { X, Loader2 } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';

interface CreateFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (
    name: string,
    description?: string
  ) => Promise<{ success?: boolean; error?: string } | void>;
  isLoading?: boolean;
  // Optional parent folder name for subfolder creation mode
  parentFolderName?: string;
}

export const CreateFolderModal = memo(
  ({
    isOpen,
    onClose,
    onCreate,
    isLoading = false,
    parentFolderName,
  }: CreateFolderModalProps) => {
    const [folderName, setFolderName] = useState('');
    const [description, setDescription] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { showToast } = useToast();

    // Determine if creating subfolder based on parentFolderName presence
    const isSubfolder = !!parentFolderName;
    const title = isSubfolder ? 'Create Subfolder' : 'Create New Folder';

    const handleSubmit = useCallback(
      async (e: React.FormEvent) => {
        e.preventDefault();

        if (!folderName.trim()) {
          showToast({
            type: 'error',
            title: 'Invalid input',
            message: 'Please enter a folder name',
          });
          return;
        }

        // BUG FIX #10: Prevent double submission on rapid clicks
        if (isSubmitting || isLoading) return;

        setIsSubmitting(true);

        try {
          const result = await onCreate(folderName.trim(), description.trim() || undefined);
          if (result && typeof result === 'object' && 'success' in result && result.success === false) {
            return;
          }
          setFolderName('');
          setDescription('');
          onClose();
        } catch (error) {
          // Error toast is handled in the calling function
          console.error(`Failed to create ${isSubfolder ? 'subfolder' : 'folder'}:`, error);
        } finally {
          setIsSubmitting(false);
        }
      },
      [folderName, description, onCreate, onClose, showToast, isSubmitting, isLoading, isSubfolder]
    );

    const handleClose = useCallback(() => {
      if (!isLoading && !isSubmitting) {
        setFolderName('');
        setDescription('');
        onClose();
      }
    }, [isLoading, isSubmitting, onClose]);

    if (!isOpen) return null;

    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg max-w-md w-full">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            <button
              onClick={handleClose}
              disabled={isLoading || isSubmitting}
              className="text-gray-500 hover:text-gray-700 disabled:opacity-50"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {isSubfolder && (
              <div>
                <p className="text-xs text-gray-500 mb-3">
                  Creating subfolder in: <span className="font-medium text-gray-700">{parentFolderName}</span>
                </p>
              </div>
            )}

            <div>
              <label htmlFor="folder-name" className="block text-sm font-medium text-gray-900 mb-1">
                Folder Name *
              </label>
              <input
                id="folder-name"
                type="text"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                placeholder={isSubfolder ? 'e.g., Applications' : 'e.g., My Documents'}
                disabled={isLoading || isSubmitting}
                maxLength={255}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600 disabled:bg-gray-100"
                autoFocus
              />
            </div>

            <div>
              <label htmlFor="folder-description" className="block text-sm font-medium text-gray-900 mb-1">
                Description (optional)
              </label>
              <textarea
                id="folder-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={isSubfolder ? 'e.g., For storing application documents' : 'e.g., For storing my application materials'}
                disabled={isLoading || isSubmitting}
                maxLength={255}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600 disabled:bg-gray-100 resize-none"
              />
              <p className="text-xs text-gray-500 mt-1">{description.length}/255</p>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={handleClose}
                disabled={isLoading || isSubmitting}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading || isSubmitting || !folderName.trim()}
                className="flex-1 px-4 py-2 bg-primary-800 text-white rounded-lg text-sm font-medium hover:bg-primary-900 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {isSubmitting || isLoading ? 'Creating...' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }
);

CreateFolderModal.displayName = 'CreateFolderModal';
