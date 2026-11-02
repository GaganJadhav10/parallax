import React from 'react';
import { AlertOctagon } from 'lucide-react';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Without this, any render-time exception unmounts the whole tree and the user
 * is left staring at a blank page with no way back.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Unhandled UI error:', error, info.componentStack);
  }

  render(): React.ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6 font-sans">
        <div className="card reticle p-8 max-w-lg w-full text-center space-y-4">
          <span className="w-12 h-12 rounded-xl bg-signal-anomaly/10 border border-signal-anomaly/30 text-signal-anomaly flex items-center justify-center mx-auto">
            <AlertOctagon className="w-6 h-6" aria-hidden="true" />
          </span>

          <div>
            <h1 className="text-lg font-semibold font-display text-white">Something went wrong</h1>
            <p className="mt-2 text-sm text-slate-400 leading-relaxed">
              The dashboard hit an unexpected error and could not finish rendering this view.
            </p>
          </div>

          <pre className="text-left text-xs font-mono text-signal-anomaly bg-background border border-surface-border rounded-lg p-3 overflow-x-auto">
            {error.message}
          </pre>

          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => this.setState({ error: null })}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-surface-raised border border-surface-border text-slate-200 hover:border-surface-border-strong transition-colors"
            >
              Try again
            </button>
            <button
              onClick={() => {
                window.location.href = '/';
              }}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-primary/15 border border-primary/40 text-primary-light hover:bg-primary/25 transition-colors"
            >
              Back to dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }
}
