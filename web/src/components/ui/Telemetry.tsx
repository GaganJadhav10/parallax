import React, { useId } from 'react';
import { ratio } from '../../lib/format';

export type Tone = 'primary' | 'verified' | 'attention' | 'anomaly' | 'alias' | 'neutral';

export const TONE_TEXT: Record<Tone, string> = {
  primary: 'text-primary',
  verified: 'text-signal-verified',
  attention: 'text-signal-attention',
  anomaly: 'text-signal-anomaly',
  alias: 'text-signal-alias',
  neutral: 'text-slate-400',
};

export const TONE_BG: Record<Tone, string> = {
  primary: 'bg-primary',
  verified: 'bg-signal-verified',
  attention: 'bg-signal-attention',
  anomaly: 'bg-signal-anomaly',
  alias: 'bg-signal-alias',
  neutral: 'bg-slate-500',
};

export const TONE_BOX: Record<Tone, string> = {
  primary: 'bg-primary/10 border-primary/30 text-primary',
  verified: 'bg-signal-verified/10 border-signal-verified/30 text-signal-verified',
  attention: 'bg-signal-attention/10 border-signal-attention/30 text-signal-attention',
  anomaly: 'bg-signal-anomaly/10 border-signal-anomaly/30 text-signal-anomaly',
  alias: 'bg-signal-alias/10 border-signal-alias/30 text-signal-alias',
  neutral: 'bg-surface-raised border-surface-border text-slate-400',
};

/** Horizontal ratio bar. `value`/`max` are real counts, not percentages. */
export const Meter: React.FC<{
  value: number;
  max: number;
  tone?: Tone;
  label?: string;
  className?: string;
}> = ({ value, max, tone = 'primary', label, className = '' }) => {
  const percent = ratio(value, max);
  return (
    <div
      className={`h-1 rounded-full bg-surface-border/70 overflow-hidden ${className}`}
      role="meter"
      aria-valuenow={Math.round(percent)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-500 ${TONE_BG[tone]}`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
};

/** Circular gauge used where a part-of-whole reads better than a bar. */
export const Gauge: React.FC<{
  value: number;
  max: number;
  tone?: Tone;
  size?: number;
  children?: React.ReactNode;
  label?: string;
}> = ({ value, max, tone = 'primary', size = 72, children, label }) => {
  const percent = ratio(value, max);
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const gradientId = useId();

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="meter"
      aria-valuenow={Math.round(percent)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-surface-border/70"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - (percent / 100) * circumference}
          stroke={`url(#${gradientId})`}
          className="transition-[stroke-dashoffset] duration-700"
        />
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" className={TONE_TEXT[tone]} stopColor="currentColor" stopOpacity="0.5" />
            <stop offset="100%" className={TONE_TEXT[tone]} stopColor="currentColor" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center leading-none">
        {children}
      </div>
    </div>
  );
};

/** Compact bar chart of recent activity. Values are plotted oldest to newest. */
export const Sparkbars: React.FC<{
  values: number[];
  tone?: Tone;
  className?: string;
  label?: string;
}> = ({ values, tone = 'primary', className = '', label }) => {
  const max = Math.max(...values, 1);
  return (
    <div
      className={`flex items-end gap-[3px] h-8 ${className}`}
      role="img"
      aria-label={label ?? `Recent activity: ${values.join(', ')}`}
    >
      {values.map((value, index) => (
        <div
          key={index}
          className={`flex-1 min-w-[3px] rounded-sm transition-all duration-500 ${
            value === 0 ? 'bg-surface-border/60' : TONE_BG[tone]
          }`}
          style={{
            height: `${Math.max(8, (value / max) * 100)}%`,
            opacity: value === 0 ? 1 : 0.4 + (value / max) * 0.6,
          }}
        />
      ))}
    </div>
  );
};

interface StatTileProps {
  label: string;
  value: React.ReactNode;
  tone?: Tone;
  icon?: React.ComponentType<{ className?: string }>;
  /** Footer slot: a meter, sparkbars, or a short caption. */
  footer?: React.ReactNode;
  hint?: string;
  loading?: boolean;
}

/**
 * The dashboard's instrument tile. Unlike a plain stat card it always carries a
 * second dimension in the footer — a ratio, a rate, a trend — so the number has
 * context instead of standing alone.
 */
export const StatTile: React.FC<StatTileProps> = ({
  label,
  value,
  tone = 'neutral',
  icon: Icon,
  footer,
  hint,
  loading = false,
}) => (
  <div className="card reticle p-4 sm:p-5 flex flex-col gap-3">
    <div className="flex items-start justify-between gap-3">
      <span className="eyebrow flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${TONE_BG[tone]}`} aria-hidden="true" />
        {label}
      </span>
      {Icon && (
        <span
          className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${TONE_BOX[tone]}`}
        >
          <Icon className="w-4 h-4" aria-hidden="true" />
        </span>
      )}
    </div>

    {loading ? (
      <div className="skeleton h-9 w-24" />
    ) : (
      <div className="text-3xl font-bold text-white font-mono tabular-nums tracking-tight leading-none">
        {value}
      </div>
    )}

    {(footer || hint) && (
      <div className="mt-auto space-y-1.5">
        {footer}
        {hint && <p className="text-micro font-mono text-slate-500 truncate">{hint}</p>}
      </div>
    )}
  </div>
);
