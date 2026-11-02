import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { GitCompare, Plus, Minus, Check, Copy, Search, Download, ArrowRight } from 'lucide-react';
import { api } from '../services/api';
import { ScanRecord, ScanComparison } from '../types';
import { PageHeader } from '../components/ui/PageHeader';
import { Button, IconButton } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { EmptyState } from '../components/ui/EmptyState';
import { useToast } from '../components/ui/Toast';
import { downloadTextFile, formatDateTime, formatNumber, shortId } from '../lib/format';

type DiffTab = 'added' | 'removed' | 'common';

const TAB_META: Record<
  DiffTab,
  { label: string; prefix: string; accent: string; active: string; row: string; icon: React.ComponentType<{ className?: string }> }
> = {
  added: {
    label: 'Discovered',
    prefix: '+',
    accent: 'text-signal-verified',
    active: 'bg-signal-verified/10 border-signal-verified/50',
    row: 'bg-signal-verified/5 border-signal-verified/20 text-signal-verified hover:bg-signal-verified/10',
    icon: Plus,
  },
  removed: {
    label: 'Decommissioned',
    prefix: '−',
    accent: 'text-signal-anomaly',
    active: 'bg-signal-anomaly/10 border-signal-anomaly/50',
    row: 'bg-signal-anomaly/5 border-signal-anomaly/20 text-signal-anomaly hover:bg-signal-anomaly/10',
    icon: Minus,
  },
  common: {
    label: 'Unchanged',
    prefix: '',
    accent: 'text-slate-400',
    active: 'bg-primary/10 border-primary/50',
    row: 'bg-background/60 border-surface-border text-slate-400 hover:bg-surface-raised',
    icon: Check,
  },
};

export const ScanComparisonPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { notify } = useToast();

  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [scanA, setScanA] = useState(searchParams.get('a') ?? '');
  const [scanB, setScanB] = useState(searchParams.get('b') ?? '');
  const [comparison, setComparison] = useState<ScanComparison | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DiffTab>('added');
  const [copiedItem, setCopiedItem] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    api
      .getScans({ limit: 500 })
      .then(setScans)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Failed to load the scan list')
      );
  }, []);

  const runComparison = useCallback(
    async (idA: string, idB: string) => {
      if (!idA || !idB) return;
      setLoading(true);
      setError(null);
      setComparison(null);

      try {
        const data = await api.compareScans(idA, idB);
        setComparison(data);
        setSearchParams({ a: idA, b: idB }, { replace: true });
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Comparison failed');
      } finally {
        setLoading(false);
      }
    },
    [setSearchParams]
  );

  // Deep links such as /compare?a=…&b=… run immediately on mount.
  useEffect(() => {
    const a = searchParams.get('a');
    const b = searchParams.get('b');
    if (a && b) {
      setScanA(a);
      setScanB(b);
      runComparison(a, b);
    }
    // Mount-only: later changes go through the Compare button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recordA = scans.find((scan) => scan.id === scanA);
  const recordB = scans.find((scan) => scan.id === scanB);

  const validationError = useMemo(() => {
    if (!scanA || !scanB) return null;
    if (scanA === scanB) return 'Select two different scans — comparing a scan with itself is empty.';
    if (recordA && recordB && recordA.target !== recordB.target) {
      return `These scans target different domains (${recordA.target} vs ${recordB.target}). The diff will not be meaningful.`;
    }
    return null;
  }, [scanA, scanB, recordA, recordB]);

  const activeList = useMemo(() => {
    if (!comparison) return [];
    const list = comparison[activeTab];
    const needle = query.toLowerCase().trim();
    return needle ? list.filter((name) => name.toLowerCase().includes(needle)) : list;
  }, [comparison, activeTab, query]);

  const copy = (text: string, key: string, message: string) => {
    navigator.clipboard.writeText(text).then(
      () => {
        setCopiedItem(key);
        notify(message, 'success');
        window.setTimeout(() => setCopiedItem(null), 1500);
      },
      () => notify('Clipboard access was blocked by the browser', 'error')
    );
  };

  const exportList = () => {
    if (!comparison) return;
    downloadTextFile(
      `parallax-delta-${comparison.target}-${activeTab}.txt`,
      activeList.join('\n'),
      'text/plain'
    );
    notify(`Exported ${formatNumber(activeList.length)} hostnames`, 'success');
  };

  const scanOptions = (exclude: string) =>
    scans
      .filter((scan) => scan.status === 'completed' && scan.id !== exclude)
      .map((scan) => (
        <option key={scan.id} value={scan.id}>
          {scan.target} · {shortId(scan.id)} · {formatDateTime(scan.started_at)}
        </option>
      ));

  const netChange = comparison ? comparison.counts.added - comparison.counts.removed : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Delta analysis"
        title="Attack Surface Diff"
        description="Track how a target's external footprint changed between two reconnaissance runs."
        icon={GitCompare}
      />

      <section className="card p-5 sm:p-6 space-y-4">
        <h2 className="eyebrow">Select two completed scans</h2>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-end">
          <div>
            <label htmlFor="scan-a" className="block text-sm font-medium text-slate-300 mb-1.5">
              Baseline (older)
            </label>
            <select
              id="scan-a"
              value={scanA}
              onChange={(event) => setScanA(event.target.value)}
              className="input-mono text-xs"
            >
              <option value="">Choose a scan…</option>
              {scanOptions(scanB)}
            </select>
          </div>

          <ArrowRight className="w-5 h-5 text-slate-700 hidden md:block mb-3 mx-auto" aria-hidden="true" />

          <div>
            <label htmlFor="scan-b" className="block text-sm font-medium text-slate-300 mb-1.5">
              Comparison (newer)
            </label>
            <select
              id="scan-b"
              value={scanB}
              onChange={(event) => setScanB(event.target.value)}
              className="input-mono text-xs"
            >
              <option value="">Choose a scan…</option>
              {scanOptions(scanA)}
            </select>
          </div>
        </div>

        {validationError && <Alert tone="warning">{validationError}</Alert>}

        <div className="flex justify-end">
          <Button
            variant="primary"
            icon={GitCompare}
            loading={loading}
            onClick={() => runComparison(scanA, scanB)}
            disabled={!scanA || !scanB || scanA === scanB}
          >
            Run diff
          </Button>
        </div>
      </section>

      {error && <Alert tone="error">{error}</Alert>}

      {!comparison && !loading && !error && (
        <div className="card">
          <EmptyState
            icon={GitCompare}
            title="No diff yet"
            description="Pick a baseline and a newer scan of the same target to see which hostnames appeared or disappeared."
          />
        </div>
      )}

      {comparison && (
        <div className="space-y-4">
          <section className="card reticle p-5 flex flex-col xl:flex-row xl:items-center justify-between gap-5">
            <div className="min-w-0">
              <span className="eyebrow">Target</span>
              <h2 className="text-xl font-bold font-mono text-white mt-1 break-all">
                {comparison.target}
              </h2>
              <p className="mt-2 text-micro font-mono text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>
                  <span className="text-slate-300">{shortId(comparison.older_scan_id)}</span>{' '}
                  {formatDateTime(comparison.older_scan_date)}
                </span>
                <ArrowRight className="w-3 h-3 text-slate-700" aria-hidden="true" />
                <span>
                  <span className="text-slate-300">{shortId(comparison.newer_scan_id)}</span>{' '}
                  {formatDateTime(comparison.newer_scan_date)}
                </span>
              </p>

              <p className="mt-3 text-sm">
                <span className="eyebrow">Net change </span>
                <span
                  className={`font-mono font-bold text-lg ${
                    netChange > 0
                      ? 'text-signal-verified'
                      : netChange < 0
                      ? 'text-signal-anomaly'
                      : 'text-slate-400'
                  }`}
                >
                  {netChange > 0 ? '+' : ''}
                  {formatNumber(netChange)}
                </span>
                <span className="text-slate-600 ml-1.5">assets</span>
              </p>
            </div>

            <div role="tablist" aria-label="Diff category" className="grid grid-cols-3 gap-2 xl:shrink-0">
              {(['added', 'removed', 'common'] as DiffTab[]).map((tab) => {
                const meta = TAB_META[tab];
                const isActive = activeTab === tab;
                return (
                  <button
                    key={tab}
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => {
                      setActiveTab(tab);
                      setQuery('');
                    }}
                    className={`px-4 py-2.5 rounded-lg border text-center transition-colors ${
                      isActive
                        ? meta.active
                        : 'bg-background/60 border-surface-border hover:border-surface-border-strong'
                    }`}
                  >
                    <span className="eyebrow block">{meta.label}</span>
                    <span className={`text-xl font-bold font-mono tabular-nums ${meta.accent}`}>
                      {meta.prefix}
                      {formatNumber(comparison.counts[tab])}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="card overflow-hidden">
            <div className="p-4 border-b border-surface-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="text-sm font-semibold font-display text-white flex items-center gap-2">
                {React.createElement(TAB_META[activeTab].icon, {
                  className: `w-4 h-4 ${TAB_META[activeTab].accent}`,
                })}
                {TAB_META[activeTab].label} hostnames
                <span className="font-mono text-xs text-slate-600">
                  {formatNumber(activeList.length)}
                </span>
              </h3>

              <div className="flex items-center gap-2">
                <div className="relative flex-1 min-w-[10rem]">
                  <Search
                    className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Filter…"
                    aria-label="Filter hostnames in this list"
                    className="input-mono pl-8 py-1.5 text-xs"
                  />
                </div>

                <Button
                  size="sm"
                  icon={copiedItem === '__list__' ? Check : Copy}
                  disabled={activeList.length === 0}
                  onClick={() =>
                    copy(
                      activeList.join('\n'),
                      '__list__',
                      `Copied ${formatNumber(activeList.length)} hostnames`
                    )
                  }
                >
                  Copy
                </Button>

                <Button size="sm" icon={Download} onClick={exportList} disabled={activeList.length === 0}>
                  Export
                </Button>
              </div>
            </div>

            {activeList.length === 0 ? (
              <EmptyState
                compact
                icon={TAB_META[activeTab].icon}
                title={query ? 'Nothing matches that filter' : `No ${activeTab} hostnames`}
                description={
                  query
                    ? 'Clear the filter to see the full list.'
                    : activeTab === 'added'
                    ? 'The newer scan found no hostnames the baseline missed.'
                    : activeTab === 'removed'
                    ? 'Every hostname from the baseline is still present.'
                    : 'The two scans share no hostnames.'
                }
              />
            ) : (
              <ul className="max-h-[32rem] overflow-y-auto p-3 space-y-1.5">
                {activeList.map((name) => (
                  <li
                    key={name}
                    className={`flex items-center justify-between gap-2 p-2 pl-3 rounded-lg border font-mono text-xs transition-colors ${TAB_META[activeTab].row}`}
                  >
                    <span className={`truncate ${activeTab === 'removed' ? 'line-through' : ''}`}>
                      {name}
                    </span>
                    <IconButton
                      label={`Copy ${name}`}
                      icon={copiedItem === name ? Check : Copy}
                      variant="ghost"
                      onClick={() => copy(name, name, 'Hostname copied')}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
};
