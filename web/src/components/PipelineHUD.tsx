import React from 'react';
import { CheckCircle2, XCircle, Crosshair, Layers, Globe, ShieldCheck } from 'lucide-react';
import { ProviderProgress, ScanProgressState } from '../hooks/useScanEvents';
import { formatNumber } from '../lib/format';

interface PipelineHUDProps {
  target: string;
  state: ScanProgressState;
  providers: Record<string, ProviderProgress>;
  rawCount: number;
  uniqueCount: number;
  liveCount: number;
  resolveEnabled: boolean;
}

type StageKey = 'target' | 'providers' | 'dedupe' | 'dns' | 'inventory';

/** Which pipeline stages are done by the time we reach a given engine state. */
const STAGE_ORDER: StageKey[] = ['target', 'providers', 'dedupe', 'dns', 'inventory'];

const REACHED: Record<ScanProgressState, StageKey> = {
  Queued: 'target',
  Running: 'target',
  Collecting: 'providers',
  Resolving: 'dns',
  Completed: 'inventory',
  Failed: 'inventory',
};

const Connector: React.FC<{ active: boolean }> = ({ active }) => (
  <div className="hidden lg:flex items-center justify-center w-8 shrink-0" aria-hidden="true">
    <svg width="32" height="2" className="overflow-visible">
      <line
        x1="0"
        y1="1"
        x2="32"
        y2="1"
        strokeWidth="1.5"
        strokeDasharray="4 4"
        className={active ? 'stroke-primary animate-flow-dash' : 'stroke-surface-border'}
      />
    </svg>
  </div>
);

const Stage: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  caption?: string;
  status: 'done' | 'active' | 'idle';
}> = ({ icon: Icon, label, value, caption, status }) => {
  const ring =
    status === 'active'
      ? 'border-primary/60 bg-primary/8 shadow-glow-primary'
      : status === 'done'
      ? 'border-signal-verified/35 bg-signal-verified/5'
      : 'border-surface-border bg-background/50';

  const accent =
    status === 'active' ? 'text-primary' : status === 'done' ? 'text-signal-verified' : 'text-slate-600';

  return (
    <div className={`flex-1 min-w-0 rounded-lg border p-3 transition-colors ${ring}`}>
      <div className="flex items-center gap-2">
        <Icon className={`w-3.5 h-3.5 shrink-0 ${accent}`} aria-hidden="true" />
        <span className="eyebrow truncate">{label}</span>
        {status === 'active' && (
          <span
            className="ml-auto w-2.5 h-2.5 border border-primary border-t-transparent rounded-full animate-spin shrink-0"
            aria-hidden="true"
          />
        )}
      </div>

      <p className="mt-2 font-mono text-lg font-bold text-white tabular-nums leading-none truncate">
        {value}
      </p>
      {caption && <p className="mt-1 text-micro font-mono text-slate-600 truncate">{caption}</p>}
    </div>
  );
};

/**
 * Visual flow of the reconnaissance pipeline while a scan runs: the target fans
 * out to parallel provider workers, collapses through deduplication, then
 * optionally through DNS resolution into the verified inventory.
 */
export const PipelineHUD: React.FC<PipelineHUDProps> = ({
  target,
  state,
  providers,
  rawCount,
  uniqueCount,
  liveCount,
  resolveEnabled,
}) => {
  const providerList = Object.values(providers);
  const finished = providerList.filter((provider) => provider.status !== 'started').length;
  const reachedIndex = STAGE_ORDER.indexOf(REACHED[state]);

  const statusOf = (stage: StageKey): 'done' | 'active' | 'idle' => {
    const index = STAGE_ORDER.indexOf(stage);
    if (index < reachedIndex) return 'done';
    if (index === reachedIndex) return state === 'Completed' ? 'done' : 'active';
    return 'idle';
  };

  return (
    <section className="card border-primary/25 p-5 space-y-5" aria-label="Reconnaissance pipeline">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-semibold font-display text-white flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" aria-hidden="true" />
          Reconnaissance pipeline
        </h2>
        <span className="text-micro font-mono uppercase tracking-widest text-primary">
          {state}
        </span>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-stretch gap-2">
        <Stage
          icon={Crosshair}
          label="Target"
          value={target || '—'}
          caption="apex under investigation"
          status={statusOf('target')}
        />
        <Connector active={reachedIndex >= 1} />

        <Stage
          icon={Layers}
          label="Providers"
          value={`${finished}/${providerList.length || '—'}`}
          caption="parallel workers returned"
          status={statusOf('providers')}
        />
        <Connector active={reachedIndex >= 2} />

        <Stage
          icon={Globe}
          label="Deduplication"
          value={formatNumber(uniqueCount)}
          caption={`${formatNumber(rawCount)} raw findings in`}
          status={statusOf('dedupe')}
        />
        <Connector active={reachedIndex >= 3} />

        <Stage
          icon={ShieldCheck}
          label={resolveEnabled ? 'DNS resolution' : 'DNS skipped'}
          value={resolveEnabled ? formatNumber(liveCount) : 'off'}
          caption={resolveEnabled ? 'hosts resolved live' : 'passive results only'}
          status={resolveEnabled ? statusOf('dns') : 'idle'}
        />
      </div>

      {providerList.length > 0 && (
        <div>
          <h3 className="eyebrow mb-2">Worker telemetry</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-2">
            {providerList.map((provider) => (
              <div
                key={provider.name}
                className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg border text-xs transition-colors ${
                  provider.status === 'failed'
                    ? 'bg-signal-anomaly/5 border-signal-anomaly/25'
                    : provider.status === 'completed'
                    ? 'bg-background/60 border-surface-border'
                    : 'bg-primary/5 border-primary/25'
                }`}
                title={provider.error}
              >
                <span className="font-mono text-slate-300 truncate">{provider.name}</span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="font-mono text-slate-500 tabular-nums">
                    {formatNumber(provider.candidates)}
                  </span>
                  {provider.status === 'completed' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-signal-verified" aria-hidden="true" />
                  ) : provider.status === 'failed' ? (
                    <XCircle className="w-3.5 h-3.5 text-signal-anomaly" aria-hidden="true" />
                  ) : (
                    <span
                      className="w-3 h-3 border border-primary border-t-transparent rounded-full animate-spin"
                      aria-hidden="true"
                    />
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
