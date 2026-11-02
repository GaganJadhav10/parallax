import React from 'react';
import {
  Info,
  Server,
  Heart,
  RefreshCw,
  Code2,
  Terminal,
  Monitor,
  Database,
  ArrowDown,
  Keyboard,
} from 'lucide-react';
import { api } from '../services/api';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { useEngineStatus } from '../hooks/useEngineStatus';
import { formatDateTime, formatDuration } from '../lib/format';

interface Endpoint {
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  description: string;
}

const ENDPOINTS: Endpoint[] = [
  { method: 'GET', path: '/api/health', description: 'Service liveness and version' },
  { method: 'GET', path: '/api/sources', description: 'Provider catalog and auth state' },
  { method: 'POST', path: '/api/scans', description: 'Start a passive reconnaissance scan' },
  { method: 'GET', path: '/api/scans', description: 'List stored scan records' },
  { method: 'GET', path: '/api/scans/{id}', description: 'Status of a single scan' },
  { method: 'GET', path: '/api/scans/{id}/events', description: 'Live SSE progress stream' },
  { method: 'GET', path: '/api/scans/{id}/results', description: 'Full report with subdomains' },
  { method: 'GET', path: '/api/scans/{id}/report', description: 'Export as HTML or JSON' },
  { method: 'GET', path: '/api/scans/compare', description: 'Diff two scans of one target' },
  { method: 'DELETE', path: '/api/scans/{id}', description: 'Delete a stored scan record' },
];

const METHOD_CHIP: Record<Endpoint['method'], string> = {
  GET: 'chip-intel',
  POST: 'chip-verified',
  DELETE: 'chip-anomaly',
};

const SHORTCUTS: Array<[string, string]> = [
  ['⌘K / Ctrl+K', 'Open the command palette'],
  ['/', 'Open the palette while not typing'],
  ['↑ ↓', 'Move through palette results'],
  ['Enter', 'Run the highlighted command'],
  ['Esc', 'Close the palette or any dialog'],
];

const Node: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  accent: string;
}> = ({ icon: Icon, title, subtitle, accent }) => (
  <div className="flex-1 min-w-0 p-4 rounded-lg bg-background border border-surface-border text-center">
    <Icon className={`w-5 h-5 mx-auto ${accent}`} aria-hidden="true" />
    <p className="mt-2 text-sm font-semibold text-white truncate">{title}</p>
    <p className="text-micro font-mono text-slate-600 mt-0.5">{subtitle}</p>
  </div>
);

export const AboutPage: React.FC = () => {
  const engine = useEngineStatus(60_000);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <PageHeader
        eyebrow="Reference"
        title="About & API"
        description="Architecture, backend connectivity, keyboard shortcuts and upstream attribution."
        icon={Info}
      />

      <section className="card p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-semibold font-display text-white flex items-center gap-2">
            <Server className="w-4 h-4 text-primary" aria-hidden="true" />
            Engine connection
          </h2>
          <Button
            size="sm"
            icon={RefreshCw}
            loading={engine.state === 'checking'}
            onClick={engine.refresh}
          >
            Probe now
          </Button>
        </div>

        <dl className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-lg bg-background border border-surface-border min-w-0">
            <dt className="eyebrow">API base</dt>
            <dd
              className="text-sm font-mono font-semibold text-white mt-1 truncate"
              title={api.getBaseURL()}
            >
              {api.getBaseURL()}
            </dd>
          </div>

          <div className="p-3.5 rounded-lg bg-background border border-surface-border">
            <dt className="eyebrow">State</dt>
            <dd
              className={`text-sm font-mono font-semibold mt-1 ${
                engine.state === 'checking'
                  ? 'text-signal-attention'
                  : engine.state === 'online'
                  ? 'text-signal-verified'
                  : 'text-signal-anomaly'
              }`}
            >
              {engine.state}
            </dd>
          </div>

          <div className="p-3.5 rounded-lg bg-background border border-surface-border">
            <dt className="eyebrow">Round trip</dt>
            <dd className="text-sm font-mono font-semibold text-slate-300 mt-1 tabular-nums">
              {engine.latencyMs === null ? '—' : formatDuration(engine.latencyMs)}
            </dd>
          </div>

          <div className="p-3.5 rounded-lg bg-background border border-surface-border">
            <dt className="eyebrow">Version</dt>
            <dd className="text-sm font-mono font-semibold text-slate-300 mt-1">
              {engine.version || '—'}
            </dd>
          </div>
        </dl>

        {engine.checkedAt && (
          <p className="text-micro font-mono text-slate-600">
            last probe {formatDateTime(engine.checkedAt)}
          </p>
        )}

        {engine.state === 'offline' && (
          <Alert tone="error" title="Cannot reach the API">
            Start the backend with <code className="font-mono text-slate-300">parallax serve</code>{' '}
            and make sure its <code className="font-mono text-slate-300">--cors-origins</code> flag
            includes this page's origin.
          </Alert>
        )}
      </section>

      <section className="card p-5 sm:p-6 space-y-5">
        <h2 className="text-sm font-semibold font-display text-white flex items-center gap-2">
          <Code2 className="w-4 h-4 text-primary" aria-hidden="true" />
          System architecture
        </h2>

        <p className="text-sm text-slate-400 leading-relaxed">
          One Go reconnaissance core serves two interfaces: a standalone CLI for terminal operators
          and this browser dashboard. Both share the same passive OSINT providers, DNS resolution
          and SQLite history.
        </p>

        <div className="p-4 rounded-lg bg-surface-raised/40 border border-surface-border space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <Node
              icon={Monitor}
              title="Browser dashboard"
              subtitle="React + TypeScript"
              accent="text-primary"
            />
            <Node
              icon={Terminal}
              title="Command line"
              subtitle="parallax CLI"
              accent="text-signal-attention"
            />
          </div>

          <ArrowDown className="w-4 h-4 text-slate-700 mx-auto" aria-hidden="true" />

          <div className="p-4 rounded-lg bg-background border border-primary/25 text-center">
            <p className="text-sm font-semibold text-white">Core engine</p>
            <p className="text-micro font-mono text-slate-600 mt-0.5">
              internal/engine · REST + SSE
            </p>
          </div>

          <ArrowDown className="w-4 h-4 text-slate-700 mx-auto" aria-hidden="true" />

          <div className="p-4 rounded-lg bg-background border border-surface-border text-center">
            <Database className="w-5 h-5 mx-auto text-signal-alias" aria-hidden="true" />
            <p className="mt-2 text-sm font-semibold text-white">SQLite persistence</p>
            <p className="text-micro font-mono text-slate-600 mt-0.5">pure Go, no CGO</p>
          </div>
        </div>
      </section>

      <section className="card p-5 sm:p-6 space-y-4">
        <h2 className="text-sm font-semibold font-display text-white flex items-center gap-2">
          <Keyboard className="w-4 h-4 text-primary" aria-hidden="true" />
          Keyboard shortcuts
        </h2>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
          {SHORTCUTS.map(([keys, description]) => (
            <div key={keys} className="flex items-center justify-between gap-3 min-w-0">
              <dt className="text-sm text-slate-400 truncate">{description}</dt>
              <dd>
                <kbd className="text-micro font-mono text-slate-300 border border-surface-border bg-background rounded px-1.5 py-0.5 whitespace-nowrap">
                  {keys}
                </kbd>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="card overflow-hidden">
        <div className="p-5 sm:p-6 pb-4">
          <h2 className="text-sm font-semibold font-display text-white flex items-center gap-2">
            <Server className="w-4 h-4 text-primary" aria-hidden="true" />
            REST API reference
          </h2>
          <p className="text-sm text-slate-400 mt-1.5">
            Every dashboard action maps to one of these endpoints — scriptable directly with curl.
          </p>
        </div>

        <div className="overflow-x-auto border-t border-surface-border">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Method</th>
                <th scope="col">Endpoint</th>
                <th scope="col">Purpose</th>
              </tr>
            </thead>
            <tbody>
              {ENDPOINTS.map((endpoint) => (
                <tr key={`${endpoint.method}-${endpoint.path}`}>
                  <td>
                    <span className={METHOD_CHIP[endpoint.method]}>{endpoint.method}</span>
                  </td>
                  <td className="font-mono text-xs text-white whitespace-nowrap">{endpoint.path}</td>
                  <td className="text-slate-500 text-xs">{endpoint.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card p-5 sm:p-6 space-y-3">
        <h2 className="text-sm font-semibold font-display text-white flex items-center gap-2">
          <Heart className="w-4 h-4 text-signal-anomaly" aria-hidden="true" />
          Upstream attribution
        </h2>

        <p className="text-sm text-slate-300 leading-relaxed">
          Parallax extends <span className="font-semibold text-white">subscan</span> by{' '}
          <span className="font-semibold text-white">Mikael Nurminen</span>, released under the MIT
          License.
        </p>

        <p className="text-sm text-slate-500 leading-relaxed">
          All upstream copyright notices are preserved. Parallax keeps the original passive
          intelligence foundation and adds pure-Go SQLite persistence, scan diffing, offline HTML
          reporting, an asynchronous REST/SSE backend and this dashboard.
        </p>
      </section>
    </div>
  );
};
