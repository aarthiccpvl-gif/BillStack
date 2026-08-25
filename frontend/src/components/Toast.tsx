import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';

/**
 * Toast notifications. Announced politely to assistive technology, and never
 * colour-only — every toast carries an icon and a text message.
 */

type ToastTone = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
  detail?: string;
}

interface ToastContextValue {
  notify: (tone: ToastTone, message: string, detail?: string) => void;
  success: (message: string, detail?: string) => void;
  error: (message: string, detail?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const ICONS: Record<ToastTone, typeof Info> = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const TONE_CLASS: Record<ToastTone, string> = {
  success: 'text-bg-success',
  error: 'text-bg-danger',
  warning: 'text-bg-warning',
  info: 'text-bg-secondary',
};

let nextId = 1;

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    (tone: ToastTone, message: string, detail?: string) => {
      const id = nextId++;
      setToasts((current) => [...current, { id, tone, message, detail }]);
      /* Errors stay until dismissed; the rest clear themselves. */
      if (tone !== 'error') {
        window.setTimeout(() => dismiss(id), 5000);
      }
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      notify,
      success: (message, detail) => notify('success', message, detail),
      error: (message, detail) => notify('error', message, detail),
    }),
    [notify],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="toast-container position-fixed bottom-0 end-0 p-3"
        style={{ zIndex: 1080 }}
        aria-live="polite"
        aria-atomic="true"
      >
        {toasts.map((toast) => {
          const Icon = ICONS[toast.tone];
          return (
            <div key={toast.id} className={`toast show ${TONE_CLASS[toast.tone]} border-0 mb-2`}>
              <div className="toast-body d-flex align-items-start gap-2">
                <Icon size={16} className="flex-shrink-0 mt-1" aria-hidden />
                <div className="flex-grow-1">
                  <div>{toast.message}</div>
                  {toast.detail && <div className="small opacity-75 mt-1">{toast.detail}</div>}
                </div>
                <button
                  type="button"
                  className="btn-close btn-close-white ms-2"
                  aria-label="Dismiss"
                  onClick={() => dismiss(toast.id)}
                >
                  <X size={0} aria-hidden />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextValue => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
};
