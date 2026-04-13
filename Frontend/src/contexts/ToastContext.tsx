import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import { generateId } from '../lib/utils';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  message: string;
  title?: string;
  type?: ToastType;
  durationMs?: number;
}

interface ToastContextValue {
  showToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = generateId();
      const duration = toast.durationMs ?? 4000;

      setToasts((current) => [...current, { id, ...toast }]);

      if (duration > 0) {
        window.setTimeout(() => removeToast(id), duration);
      }
    },
    [removeToast]
  );

  const contextValue = useMemo(
    () => ({ showToast, removeToast }),
    [showToast, removeToast]
  );

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      {/* Toast stack */}
      <div className="fixed top-24 right-4 z-[1500] space-y-3 w-full max-w-sm">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`rounded-lg shadow-lg px-4 py-3 text-sm text-white flex items-start justify-between gap-3 ${
              toast.type === 'success'
                ? 'bg-green-600'
                : toast.type === 'error'
                ? 'bg-red-600'
                : toast.type === 'warning'
                ? 'bg-amber-500'
                : 'bg-slate-800'
            }`}
          >
            <div>
              {toast.title && <p className="font-semibold mb-0.5">{toast.title}</p>}
              <p className="text-sm leading-snug">{toast.message}</p>
            </div>
            <button
              type="button"
              className="ml-2 inline-flex items-center justify-center w-8 h-8 rounded opacity-80 hover:opacity-100 focus-ring"
              onClick={() => removeToast(toast.id)}
              aria-label="Dismiss notification"
              title="Dismiss"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useToast = (): ToastContextValue => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
};