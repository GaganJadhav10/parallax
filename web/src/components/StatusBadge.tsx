import React from 'react';
import { ScanStatus } from '../types';

interface StatusBadgeProps {
  status: ScanStatus | string;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  const norm = status.toLowerCase();

  let colorClasses = 'bg-slate-800 text-slate-300 border-slate-700';
  let dotColor = 'bg-slate-400';

  if (norm === 'completed' || norm === 'available' || norm === 'ok' || norm === 'connected') {
    colorClasses = 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60';
    dotColor = 'bg-emerald-400';
  } else if (norm === 'running' || norm === 'collecting' || norm === 'resolving') {
    colorClasses = 'bg-sky-950/60 text-sky-400 border-sky-800/60';
    dotColor = 'bg-sky-400 animate-pulse';
  } else if (norm === 'failed' || norm === 'error' || norm === 'disconnected') {
    colorClasses = 'bg-rose-950/60 text-rose-400 border-rose-800/60';
    dotColor = 'bg-rose-400';
  } else if (norm === 'pending' || norm === 'queued' || norm === 'api_key_required' || norm === 'checking') {
    colorClasses = 'bg-amber-950/60 text-amber-400 border-amber-800/60';
    dotColor = 'bg-amber-400';
  }

  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';

  return (
    <span className={`inline-flex items-center gap-1.5 font-medium rounded-full border ${colorClasses} ${sizeClasses}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
      <span className="capitalize">{status}</span>
    </span>
  );
};
