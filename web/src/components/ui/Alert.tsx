import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';

type AlertTone = 'error' | 'warning' | 'success' | 'info';

const TONES: Record<
  AlertTone,
  { wrapper: string; icon: React.ComponentType<{ className?: string }>; iconColor: string }
> = {
  error: {
    wrapper: 'bg-signal-anomaly/8 border-signal-anomaly/30',
    icon: AlertCircle,
    iconColor: 'text-signal-anomaly',
  },
  warning: {
    wrapper: 'bg-signal-attention/8 border-signal-attention/30',
    icon: AlertTriangle,
    iconColor: 'text-signal-attention',
  },
  success: {
    wrapper: 'bg-signal-verified/8 border-signal-verified/30',
    icon: CheckCircle2,
    iconColor: 'text-signal-verified',
  },
  info: {
    wrapper: 'bg-surface/70 border-surface-border',
    icon: Info,
    iconColor: 'text-primary',
  },
};

interface AlertProps {
  tone?: AlertTone;
  title?: string;
  children: React.ReactNode;
  /** Rendered on the trailing edge, typically a Retry button. */
  action?: React.ReactNode;
}

export const Alert: React.FC<AlertProps> = ({ tone = 'info', title, children, action }) => {
  const { wrapper, icon: Icon, iconColor } = TONES[tone];

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-3 p-4 rounded-xl border text-sm backdrop-blur-sm ${wrapper}`}
    >
      <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${iconColor}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold text-white">{title}</p>}
        <div className={`leading-relaxed text-slate-400 ${title ? 'mt-1' : ''}`}>{children}</div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
};
