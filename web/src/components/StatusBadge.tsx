import React from 'react';
import { ScanStatus } from '../types';

interface StatusBadgeProps {
  status: ScanStatus | string;
  size?: 'sm' | 'md';
}

type Tone = 'verified' | 'active' | 'anomaly' | 'attention' | 'neutral';

const TONES: Record<Tone, { wrapper: string; dot: string; pulse: boolean }> = {
  verified: {
    wrapper: 'bg-signal-verified/10 text-signal-verified border-signal-verified/35',
    dot: 'bg-signal-verified',
    pulse: false,
  },
  active: {
    wrapper: 'bg-primary/10 text-primary border-primary/35',
    dot: 'bg-primary',
    pulse: true,
  },
  anomaly: {
    wrapper: 'bg-signal-anomaly/10 text-signal-anomaly border-signal-anomaly/35',
    dot: 'bg-signal-anomaly',
    pulse: false,
  },
  attention: {
    wrapper: 'bg-signal-attention/10 text-signal-attention border-signal-attention/35',
    dot: 'bg-signal-attention',
    pulse: false,
  },
  neutral: {
    wrapper: 'bg-surface-raised text-slate-400 border-surface-border',
    dot: 'bg-slate-500',
    pulse: false,
  },
};

const TONE_BY_STATUS: Record<string, Tone> = {
  completed: 'verified',
  available: 'verified',
  ok: 'verified',
  connected: 'verified',
  enabled: 'verified',
  running: 'active',
  collecting: 'active',
  resolving: 'active',
  failed: 'anomaly',
  error: 'anomaly',
  disconnected: 'anomaly',
  pending: 'attention',
  queued: 'attention',
  checking: 'attention',
  api_key_required: 'attention',
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  const tone = TONE_BY_STATUS[status.toLowerCase()] ?? 'neutral';
  const { wrapper, dot, pulse } = TONES[tone];
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-micro' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono font-medium uppercase tracking-wider rounded border whitespace-nowrap ${wrapper} ${sizeClasses}`}
    >
      <span className="relative flex h-1.5 w-1.5 shrink-0" aria-hidden="true">
        {pulse && (
          <span
            className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${dot}`}
          />
        )}
        <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${dot}`} />
      </span>
      {status.replace(/_/g, ' ')}
    </span>
  );
};
