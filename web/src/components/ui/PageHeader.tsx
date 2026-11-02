import React from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  /** Short uppercase string rendered above the title, e.g. "Mission Control". */
  eyebrow?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  icon: Icon,
  eyebrow,
  badge,
  actions,
}) => (
  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between pb-5 border-b border-surface-border/70">
    <div className="min-w-0">
      {eyebrow && <p className="eyebrow mb-2 text-primary/70">{eyebrow}</p>}

      <div className="flex items-center gap-3 flex-wrap">
        {Icon && (
          <span className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/30 text-primary flex items-center justify-center shrink-0 shadow-glow-primary">
            <Icon className="w-5 h-5" aria-hidden="true" />
          </span>
        )}
        <h1 className="text-2xl sm:text-3xl font-bold font-display text-white tracking-tight">
          {title}
        </h1>
        {badge}
      </div>

      {description && (
        <p className="mt-2 text-sm text-slate-400 max-w-2xl leading-relaxed">{description}</p>
      )}
    </div>

    {actions && <div className="flex items-center gap-2 flex-wrap lg:shrink-0">{actions}</div>}
  </div>
);
