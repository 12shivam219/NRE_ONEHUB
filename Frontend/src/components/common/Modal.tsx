import { ReactNode, useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  initialFocusRef?: React.RefObject<HTMLElement>;
}

/**
 * Accessible Modal Component with Focus Trap
 * Features:
 * - Focus trap (keeps focus within modal)
 * - Returns focus to trigger element on close
 * - Escape key handling
 * - ARIA attributes
 * - Scroll lock
 * - Responsive sizing
 */
export const Modal = ({ isOpen, onClose, title, children, size = 'md', initialFocusRef }: ModalProps) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const previousBodyOverflowRef = useRef<string>('');
  const reactId = useId();
  
  // Store the element that triggered the modal
  useEffect(() => {
    if (isOpen) {
      previousActiveElementRef.current = document.activeElement as HTMLElement;
    }
  }, [isOpen]);

  // Focus management and scroll lock
  useEffect(() => {
    if (isOpen) {
      // Store the current active element before doing anything
      const activeElement = document.activeElement as HTMLElement;
      
      // Blur the active element to prevent it from being focused when modal closes
      if (activeElement && activeElement !== document.body) {
        activeElement.blur();
      }
      
      // Lock scroll when modal is open
      previousBodyOverflowRef.current = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      
      // Focus the first focusable element or the close button
      setTimeout(() => {
        const focusTarget = initialFocusRef?.current || closeButtonRef.current;
        focusTarget?.focus();
        
        // If focus is still on body, focus the dialog itself as fallback
        if (document.activeElement === document.body && dialogRef.current) {
          dialogRef.current.focus();
        }
      }, 100);
      
      return () => {
        // Unlock scroll when modal closes
        document.body.style.overflow = previousBodyOverflowRef.current;
        
        // Return focus to previous element
        requestAnimationFrame(() => {
          if (previousActiveElementRef.current) {
            // Check if the element is still in the DOM
            if (document.body.contains(previousActiveElementRef.current)) {
              previousActiveElementRef.current.focus();
            } else {
              // Fallback: focus the first focusable element in the document
              const focusable = document.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
              focusable?.focus();
            }
          }
        });
      };
    }
  }, [isOpen, initialFocusRef]);

  // Focus trap: keep focus within modal
  useEffect(() => {
    if (!isOpen || !dialogRef.current) return;

    const modal = dialogRef.current;
    
    // Function to get all focusable elements in the modal
    const getFocusableElements = () => {
      return Array.from(
        modal.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => {
        // Filter out disabled and hidden elements
        return !el.hasAttribute('disabled') && 
               el.getAttribute('aria-hidden') !== 'true' &&
               !el.closest('[aria-hidden="true"]') &&
               window.getComputedStyle(el).display !== 'none';
      });
    };

    const handleFocusIn = (e: FocusEvent) => {
      const focusableElements = getFocusableElements();
      const firstElement = focusableElements[0];

      // If there are no focusable elements, focus the dialog itself
      if (focusableElements.length === 0) {
        e.preventDefault();
        modal.focus();
        return;
      }

      // If focus is outside the modal, move it to the first focusable element
      if (!modal.contains(e.target as Node)) {
        e.preventDefault();
        firstElement?.focus();
      }
    };

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      const focusableElements = getFocusableElements();
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      // If there is nothing focusable, keep focus on the dialog itself.
      if (focusableElements.length === 0) {
        e.preventDefault();
        modal.focus();
        return;
      }

      const active = document.activeElement as HTMLElement | null;
      
      // If focus somehow escaped the modal, bring it back in.
      if (!active || !modal.contains(active)) {
        e.preventDefault();
        firstElement?.focus();
        return;
      }

      // Handle Shift+Tab from first element
      if (e.shiftKey && active === firstElement) {
        e.preventDefault();
        lastElement?.focus();
      } 
      // Handle Tab from last element
      else if (!e.shiftKey && active === lastElement) {
        e.preventDefault();
        firstElement?.focus();
      }
    };

    // Add event listeners
    document.addEventListener('keydown', handleTabKey);
    document.addEventListener('focusin', handleFocusIn as EventListener);
    
    return () => {
      document.removeEventListener('keydown', handleTabKey);
      document.removeEventListener('focusin', handleFocusIn as EventListener);
    };
  }, [isOpen]);

  // Handle Escape key to close modal
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Click outside to close
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-2xl',
    lg: 'max-w-4xl',
    xl: 'max-w-6xl',
  };

  const hasTitle = Boolean(title && title.trim().length > 0);
  const titleElementId = `modal-title-${reactId}`;

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-2 sm:p-4 animate-fade-in backdrop-blur-sm"
      role="presentation"
      onClick={handleBackdropClick}
    >
      <div 
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={hasTitle ? titleElementId : undefined}
        aria-label={hasTitle ? undefined : 'Dialog'}
        className={`bg-white rounded-card shadow-xl w-full ${sizeClasses[size]} max-h-[95vh] sm:max-h-[90vh] flex flex-col animate-slide-up border border-gray-200`}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 flex-shrink-0">
          <h2 id={titleElementId} className="text-base sm:text-lg font-bold font-heading text-slate-900 pr-4 letter-spacing-tight">{title}</h2>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all duration-200 focus:ring-2 focus:ring-blue-300 flex-shrink-0"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5 sm:w-6 sm:h-6" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</div>
      </div>
    </div>
  );
};
