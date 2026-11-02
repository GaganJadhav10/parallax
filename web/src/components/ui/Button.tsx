import React from 'react';
import { Link, LinkProps } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-primary/15 text-primary-light border border-primary/40 hover:bg-primary/25 hover:border-primary/70 hover:shadow-glow-primary',
  secondary:
    'bg-surface-raised/80 text-slate-200 border border-surface-border hover:border-surface-border-strong hover:text-white hover:bg-surface-card',
  ghost:
    'bg-transparent text-slate-400 border border-transparent hover:text-primary-light hover:bg-primary/10',
  danger:
    'bg-signal-anomaly/15 text-signal-anomaly border border-signal-anomaly/40 hover:bg-signal-anomaly/25 hover:border-signal-anomaly/70 hover:shadow-glow-anomaly',
};

const SIZES: Record<Size, string> = {
  sm: 'text-xs px-2.5 py-1.5 gap-1.5 rounded-md',
  md: 'text-sm px-3.5 py-2 gap-2 rounded-lg',
  lg: 'text-sm px-5 py-2.5 gap-2 rounded-lg',
};

const BASE =
  'inline-flex items-center justify-center font-medium transition-all duration-200 select-none whitespace-nowrap ' +
  'disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none disabled:shadow-none';

interface CommonProps {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
}

export interface ButtonProps extends CommonProps, React.ButtonHTMLAttributes<HTMLButtonElement> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'secondary',
      size = 'md',
      loading = false,
      icon: Icon,
      className = '',
      children,
      disabled,
      ...rest
    },
    ref
  ) => (
    <button
      ref={ref}
      className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />
      ) : (
        Icon && <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
      )}
      {children}
    </button>
  )
);

Button.displayName = 'Button';

export interface ButtonLinkProps extends CommonProps, LinkProps {}

export const ButtonLink: React.FC<ButtonLinkProps> = ({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  className = '',
  children,
  ...rest
}) => (
  <Link className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`} {...rest}>
    {Icon && <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />}
    {children}
  </Link>
);

export interface ExternalButtonLinkProps
  extends CommonProps,
    React.AnchorHTMLAttributes<HTMLAnchorElement> {}

export const ExternalButtonLink: React.FC<ExternalButtonLinkProps> = ({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  className = '',
  children,
  ...rest
}) => (
  <a
    target="_blank"
    rel="noopener noreferrer"
    className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    {...rest}
  >
    {Icon && <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />}
    {children}
  </a>
);

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: icon-only controls are invisible to screen readers without it. */
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  variant?: Variant;
  spinning?: boolean;
}

export const IconButton: React.FC<IconButtonProps> = ({
  label,
  icon: Icon,
  variant = 'secondary',
  spinning = false,
  className = '',
  ...rest
}) => (
  <button
    aria-label={label}
    title={label}
    className={`${BASE} ${VARIANTS[variant]} p-2 rounded-lg ${className}`}
    {...rest}
  >
    <Icon className={`w-4 h-4 ${spinning ? 'animate-spin' : ''}`} aria-hidden="true" />
  </button>
);
