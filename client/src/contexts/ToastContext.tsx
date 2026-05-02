import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { X, CheckCircle, AlertTriangle, Info, XCircle } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
  description?: string;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType, description?: string) => void;
  success: (message: string, description?: string) => void;
  error: (message: string, description?: string) => void;
  warning: (message: string, description?: string) => void;
  info: (message: string, description?: string) => void;
}

const ToastContext = createContext<ToastContextValue>({
  toast: () => {},
  success: () => {},
  error: () => {},
  warning: () => {},
  info: () => {},
});

export const useToast = () => useContext(ToastContext);

let nextId = 1;

const TOAST_LIFE_MS: Record<ToastType, number> = {
  success: 3500,
  info: 4000,
  warning: 5000,
  error: 6000,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, type: ToastType = 'info', description?: string) => {
      const id = nextId++;
      setToasts((prev) => [...prev, { id, message, type, description }]);
      const ttl = TOAST_LIFE_MS[type] ?? 4000;
      window.setTimeout(() => remove(id), ttl);
    },
    [remove]
  );

  const success = useCallback(
    (message: string, description?: string) => toast(message, 'success', description),
    [toast]
  );
  const error = useCallback(
    (message: string, description?: string) => toast(message, 'error', description),
    [toast]
  );
  const warning = useCallback(
    (message: string, description?: string) => toast(message, 'warning', description),
    [toast]
  );
  const info = useCallback(
    (message: string, description?: string) => toast(message, 'info', description),
    [toast]
  );

  const icons: Record<ToastType, ReactNode> = {
    success: <CheckCircle className="w-4 h-4" strokeWidth={2.2} />,
    error: <XCircle className="w-4 h-4" strokeWidth={2.2} />,
    warning: <AlertTriangle className="w-4 h-4" strokeWidth={2.2} />,
    info: <Info className="w-4 h-4" strokeWidth={2.2} />,
  };

  return (
    <ToastContext.Provider value={{ toast, success, error, warning, info }}>
      {children}
      <div
        className="nx-toast-stack"
        role="region"
        aria-label="Notifications"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div key={t.id} className={`nx-toast is-${t.type}`} role="status">
            <div className="nx-toast-icon" aria-hidden>
              {icons[t.type]}
            </div>
            <div className="nx-toast-body">
              <div className="nx-toast-title">{t.message}</div>
              {t.description && <div className="nx-toast-desc">{t.description}</div>}
            </div>
            <button
              className="nx-toast-close"
              onClick={() => remove(t.id)}
              aria-label="Dismiss notification"
              type="button"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
