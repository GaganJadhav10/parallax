import React from 'react';

interface EmptyStateProps {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  /** An empty screen should always offer the next step. */
  action?: React.ReactNode;
  compact?: boolean;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
}) => (
  <div
    className={`flex flex-col items-center justify-center text-center ${
      compact ? 'py-10 px-4' : 'py-16 px-6'
    }`}
  >
    {Icon && (
      <span className="reticle w-14 h-14 rounded-xl bg-surface-raised/60 border border-surface-border text-slate-600 flex items-center justify-center mb-4">
        <Icon className="w-6 h-6" aria-hidden="true" />
      </span>
    )}
    <h3 className="text-base font-semibold font-display text-white">{title}</h3>
    {description && (
      <p className="mt-2 text-sm text-slate-500 max-w-sm leading-relaxed">{description}</p>
    )}
    {action && <div className="mt-5">{action}</div>}
  </div>
);
