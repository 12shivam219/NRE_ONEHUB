import { memo } from 'react';
import { CreateFolderModal } from './CreateFolderModal';

interface CreateSubfolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (
    name: string,
    description?: string
  ) => Promise<{ success?: boolean; error?: string } | void>;
  parentFolderName: string;
  isLoading?: boolean;
}

/**
 * @deprecated Use CreateFolderModal with parentFolderName prop instead.
 * This component is maintained for backward compatibility only.
 */
export const CreateSubfolderModal = memo(
  ({
    isOpen,
    onClose,
    onCreate,
    parentFolderName,
    isLoading = false,
  }: CreateSubfolderModalProps) => {
    // Simply delegate to CreateFolderModal with parentFolderName
    return (
      <CreateFolderModal
        isOpen={isOpen}
        onClose={onClose}
        onCreate={onCreate}
        isLoading={isLoading}
        parentFolderName={parentFolderName}
      />
    );
  }
);

CreateSubfolderModal.displayName = 'CreateSubfolderModal';
