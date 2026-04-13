import { useEffect, useRef, useCallback } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';
import { BrandButton } from '../brand/BrandButton';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  isLoading?: boolean;
}

/**
 * Accessible confirmation dialog to replace window.confirm()
 * Features:
 * - Focus trap
 * - Keyboard navigation (Escape to cancel, Enter to confirm)
 * - ARIA attributes
 * - Loading states
 * - Brand styling with variant support
 */
export const ConfirmDialog = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'warning',
  isLoading = false,
}: ConfirmDialogProps) => {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  // Focus management
  useEffect(() => {
    if (isOpen) {
      // Focus cancel button by default (safer option)
      setTimeout(() => {
        cancelButtonRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  const handleConfirm = useCallback(async () => {
    await onConfirm();
  }, [onConfirm]);

  // Keyboard handling
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Enter' && !isLoading) {
        // Only confirm on Enter if focus is inside this dialog and not within a text input.
        const active = document.activeElement as HTMLElement | null;
        const isInThisDialog =
          !!active &&
          (active === confirmButtonRef.current || active === cancelButtonRef.current || !!active.closest('[role="dialog"]'));

        if (!isInThisDialog) return;

        const tagName = (active?.tagName || '').toLowerCase();
        const isTypingElement = tagName === 'textarea' || tagName === 'input' || tagName === 'select';
        if (isTypingElement) return;

        void handleConfirm();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isLoading, onClose, handleConfirm]);

  const variantStyles = {
    danger: {
      icon: 'text-red-600',
      confirmVariant: 'danger' as const,
      title: 'text-red-900',
    },
    warning: {
      icon: 'text-amber-600',
      confirmVariant: 'primary' as const,
      title: 'text-amber-900',
    },
    info: {
      icon: 'text-blue-600',
      confirmVariant: 'primary' as const,
      title: 'text-blue-900',
    },
  };

  const styles = variantStyles[variant];

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <div className="space-y-4">
        <div className="flex items-start gap-4">
          <div className={`flex-shrink-0 ${styles.icon}`}>
            <AlertTriangle className="w-6 h-6" aria-hidden="true" />
          </div>
          <div className="flex-1">
            <h3 className="sr-only" id="confirm-dialog-title">
              {title}
            </h3>
            <p className="text-[color:var(--text-secondary)]" id="confirm-dialog-message">
              {message}
            </p>
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row gap-3 justify-end pt-4 border-t border-[color:var(--border)]">
          <BrandButton
            ref={cancelButtonRef}
            onClick={onClose}
            disabled={isLoading}
            variant="secondary"
            size="sm"
            aria-label={cancelLabel}
          >
            {cancelLabel}
          </BrandButton>
          <BrandButton
            ref={confirmButtonRef}
            onClick={handleConfirm}
            disabled={isLoading}
            variant={styles.confirmVariant}
            size="sm"
            isLoading={isLoading}
            aria-label={confirmLabel}
            aria-busy={isLoading}
          >
            {confirmLabel}
          </BrandButton>
        </div>
      </div>
    </Modal>
  );
};

