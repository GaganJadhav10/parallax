import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Database, ShieldCheck, KeyRound, CheckCircle2, RefreshCw, X } from 'lucide-react';
import { api } from '../services/api';
import { SourceInfo } from '../types';
import { PageHeader } from '../components/ui/PageHeader';
import { Button, IconButton } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { Skeleton } from '../components/ui/Skeleton';
import { Gauge } from '../components/ui/Telemetry';
import { EmptyState } from '../components/ui/EmptyState';
import { CATEGORY_CHIP, SourceCategory, metaFor } from '../lib/sources';
import { formatNumber } from '../lib/format';

const SourceCard: React.FC<{ source: SourceInfo }> = ({ source }) => {
  const meta = metaFor(source.id);

  return (
    <article className="card-interactive reticle p-5 flex flex-col justify-between gap-4">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-mono text-base font-bold text-white truncate">{source.name}</h3>
            <code className="text-micro font-mono text-slate-600">{source.id}</code>
          </div>

          {source.auth_required ? (
            <span className={source.enabled ? 'chip-verified' : 'chip-attention'}>
              <KeyRound className="w-3 h-3" aria-hidden="true" />
              {source.enabled ? 'keyed' : 'key required'}
            </span>
          ) : (
            <span className="chip-verified">
              <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
              no auth
            </span>
          )}
        </div>

        <p className="text-sm text-slate-400 mt-3 leading-relaxed">{meta.description}</p>
      </div>

      <div className="pt-3 border-t border-surface-border flex items-center justify-between gap-2">
        <span className={CATEGORY_CHIP[meta.category]}>{meta.category}</span>
        <span className="text-micro font-mono text-slate-700">passive</span>
      </div>
    </article>
  );
};

export const SourcesPage: React.FC = () => {
  const [sources, setSources] = useState<SourceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<SourceCategory | 'all'>('all');

  const loadSources = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSources(await api.getSources());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch the OSINT provider catalog');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  const categories = useMemo(() => {
    const seen = new Map<SourceCategory, number>();
    for (const source of sources) {
      const { category: sourceCategory } = metaFor(source.id);
      seen.set(sourceCategory, (seen.get(sourceCategory) ?? 0) + 1);
    }
    return [...seen.entries()].sort((a, b) => b[1] - a[1]);
  }, [sources]);

  const visible = useMemo(
    () =>
      category === 'all'
        ? sources
        : sources.filter((source) => metaFor(source.id).category === category),
    [sources, category]
  );

  const activeCount = sources.filter((source) => source.enabled).length;
  const needKey = sources.filter((source) => source.auth_required && !source.enabled).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Feed matrix"
        title="OSINT Providers"
        description="Non-intrusive public intelligence catalogs queried concurrently during reconnaissance."
        icon={Database}
        actions={
          <IconButton
            label="Refresh provider catalog"
            icon={RefreshCw}
            spinning={loading}
            onClick={loadSources}
          />
        }
      />

      <section className="card reticle p-5 flex flex-col sm:flex-row items-center gap-6">
        <Gauge
          value={activeCount}
          max={Math.max(sources.length, 1)}
          tone={needKey > 0 ? 'attention' : 'verified'}
          size={96}
          label="Operational providers"
        >
          <span className="text-2xl font-bold font-mono text-white tabular-nums leading-none">
            {activeCount}
          </span>
          <span className="text-micro font-mono text-slate-600 mt-1">
            of {sources.length || '—'}
          </span>
        </Gauge>

        <div className="flex-1 min-w-0 text-center sm:text-left">
          <h2 className="text-lg font-semibold font-display text-white">
            {activeCount} provider{activeCount === 1 ? '' : 's'} ready to query
          </h2>
          <p className="mt-1.5 text-sm text-slate-400 leading-relaxed">
            Keyless feeds work out of the box. Authenticated feeds activate once their key is set on
            the server — the browser never receives them.
          </p>
          {needKey > 0 && (
            <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-mono text-signal-attention">
              <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
              {needKey} provider{needKey === 1 ? '' : 's'} awaiting an API key
            </p>
          )}
        </div>
      </section>

      <Alert tone="info" title="Passive reconnaissance only">
        Parallax never performs port scanning, brute-force enumeration or exploitation against
        target infrastructure. Every query goes to public third-party Certificate Transparency logs,
        historical passive DNS repositories and intelligence search engines.
      </Alert>

      {error && (
        <Alert
          tone="error"
          action={
            <Button size="sm" variant="ghost" onClick={loadSources}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {!loading && sources.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="eyebrow">Category</span>
          <button
            onClick={() => setCategory('all')}
            aria-pressed={category === 'all'}
            className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
              category === 'all'
                ? 'bg-primary/12 text-primary border-primary/30'
                : 'bg-surface border-surface-border text-slate-500 hover:text-white hover:border-surface-border-strong'
            }`}
          >
            All {formatNumber(sources.length)}
          </button>

          {categories.map(([name, count]) => (
            <button
              key={name}
              onClick={() => setCategory(name)}
              aria-pressed={category === name}
              className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                category === name
                  ? 'bg-primary/12 text-primary border-primary/30'
                  : 'bg-surface border-surface-border text-slate-500 hover:text-white hover:border-surface-border-strong'
              }`}
            >
              {name} {count}
            </button>
          ))}

          {category !== 'all' && (
            <button
              onClick={() => setCategory('all')}
              className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-white transition-colors"
            >
              <X className="w-3 h-3" aria-hidden="true" />
              Clear
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-44 w-full rounded-xl" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Database}
            title="No providers in this category"
            action={<Button onClick={() => setCategory('all')}>Show all providers</Button>}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visible.map((source) => (
            <SourceCard key={source.id} source={source} />
          ))}
        </div>
      )}

      {!loading && sources.length > 0 && (
        <p className="flex items-start gap-2 text-xs text-slate-600 leading-relaxed">
          <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
          Authenticated feeds read their credentials server-side from{' '}
          <code className="font-mono text-slate-500">VT_API_KEY</code>,{' '}
          <code className="font-mono text-slate-500">SHODAN_API_KEY</code> and{' '}
          <code className="font-mono text-slate-500">OTX_API_KEY</code>.
        </p>
      )}
    </div>
  );
};
