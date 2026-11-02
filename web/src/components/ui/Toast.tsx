import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

type ToastTone = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastContextValue {
  notify: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONES: Record<
  ToastTone,
  { icon: React.ComponentType<{ className?: string }>; color: string; border: string }
> = {
  success: { icon: CheckCircle2, color: 'text-signal-verified', border: 'border-signal-verified/35' },
  error: { icon: AlertCircle, color: 'text-signal-anomaly', border: 'border-signal-anomaly/35' },
  info: { icon: Info, color: 'text-primary', border: 'border-primary/35' },
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, tone, message }]);
      window.setTimeout(() => dismiss(id), 3500);
    },
    [dismiss]
  );

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/* Announced politely so confirmations reach screen readers too. */}
      <div
        role="status"
        aria-live="polite"
        className="fixed bottom-4 right-4 z-[70] flex flex-col gap-2 w-[min(22rem,calc(100vw-2rem))]"
      >
        {toasts.map((toast) => {
          const { icon: Icon, color, border } = TONES[toast.tone];
          return (
            <div
              key={toast.id}
              className={`flex items-start gap-2.5 p-3 rounded-lg bg-surface-raised border ${border} shadow-raised animate-slide-in-right`}
            >
              <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${color}`} aria-hidden="true" />
              <p className="text-sm text-slate-200 flex-1 leading-snug">{toast.message}</p>
              <button
                onClick={() => dismiss(toast.id)}
                aria-label="Dismiss notification"
                className="text-slate-600 hover:text-white transition-colors shrink-0"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
