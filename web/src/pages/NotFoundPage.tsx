import React from 'react';
import { useLocation } from 'react-router-dom';
import { Compass, LayoutDashboard, History } from 'lucide-react';
import { ButtonLink } from '../components/ui/Button';

export const NotFoundPage: React.FC = () => {
  const location = useLocation();

  return (
    <div className="card reticle py-16 px-6 text-center max-w-lg mx-auto">
      <span className="w-14 h-14 rounded-xl bg-surface-raised border border-surface-border text-slate-600 flex items-center justify-center mx-auto">
        <Compass className="w-7 h-7" aria-hidden="true" />
      </span>

      <p className="mt-5 text-5xl font-bold font-mono text-primary tracking-tight">404</p>
      <h1 className="mt-2 text-lg font-semibold font-display text-white">No such route</h1>
      <p className="mt-2 text-sm text-slate-500 leading-relaxed">
        Nothing is mapped to{' '}
        <code className="font-mono text-slate-400 bg-background px-1.5 py-0.5 rounded border border-surface-border">
          {location.pathname}
        </code>
      </p>

      <div className="mt-6 flex items-center justify-center gap-2 flex-wrap">
        <ButtonLink to="/" variant="primary" icon={LayoutDashboard}>
          Dashboard
        </ButtonLink>
        <ButtonLink to="/history" icon={History}>
          Scan history
        </ButtonLink>
      </div>
    </div>
  );
};
