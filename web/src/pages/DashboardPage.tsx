import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Radar,
  Globe,
  Gauge as GaugeIcon,
  Zap,
  ArrowRight,
  RefreshCw,
  Crosshair,
  Activity,
  Database,
  KeyRound,
  CheckCircle2,
} from 'lucide-react';
import { api } from '../services/api';
import { ScanRecord, SourceInfo } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { PageHeader } from '../components/ui/PageHeader';
import { Button, ButtonLink, IconButton } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { SkeletonTable, SkeletonTiles } from '../components/ui/Skeleton';
import { Alert } from '../components/ui/Alert';
import { Gauge, Meter, Sparkbars, StatTile } from '../components/ui/Telemetry';
import { useToast } from '../components/ui/Toast';
import { isValidTarget, normalizeTarget } from '../lib/domain';
import { formatDuration, formatNumber, formatRelativeTime, formatDateTime, ratio } from '../lib/format';

/** Aggregates are computed over this window; the tile hints say so. */
const STATS_WINDOW = 200;
const RECENT_ROWS = 7;
const TREND_DAYS = 14;

/** Inline launcher so a scan can start without leaving the dashboard. */
const TargetAcquisition: React.FC = () => {
  const navigate = useNavigate();
  const { notify } = useToast();
  const [target, setTarget] = useState('');
  const [launching, setLaunching] = useState(false);

  const normalized = normalizeTarget(target);
  const valid = isValidTarget(target);

  const launch = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid) return;

    setLaunching(true);
    try {
      const response = await api.createScan({ target: normalized, resolve: true });
      notify(`Reconnaissance started for ${normalized}`, 'success');
      navigate(`/scans/${response.id}`);
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Failed to start scan', 'error');
      setLaunching(false);
    }
  };

  return (
    <form onSubmit={launch} className="card reticle p-5 bg-surface/60">
      <div className="flex items-center gap-2 mb-3">
        <Crosshair className="w-4 h-4 text-primary" aria-hidden="true" />
        <h2 className="eyebrow text-primary/80">Target acquisition</h2>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <span
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-primary/60 font-mono text-sm select-none"
            aria-hidden="true"
          >
            &gt;
          </span>
          <input
            type="text"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            placeholder="example.com"
            aria-label="Target domain"
            spellCheck={false}
            autoComplete="off"
            className="input-mono pl-8"
          />
        </div>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          icon={Radar}
          loading={launching}
          disabled={!valid}
          className="sm:w-auto"
        >
          Launch recon
        </Button>
      </div>

      <p className="mt-2 text-micro font-mono text-slate-600">
        {target && !valid
          ? 'Enter a full domain — no protocol, path or port.'
          : normalized && normalized !== target.trim().toLowerCase()
          ? `resolves to ${normalized}`
          : 'All enabled providers · DNS verification on · press ⌘K for the command palette'}
      </p>
    </form>
  );
};

export const DashboardPage: React.FC = () => {
  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [sources, setSources] = useState<SourceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (isBackground = false) => {
    if (isBackground) setRefreshing(true);
    setError(null);
    try {
      const [scanRecords, sourceList] = await Promise.all([
        api.getScans({ limit: STATS_WINDOW }),
        api.getSources().catch(() => [] as SourceInfo[]),
      ]);
      setScans(scanRecords);
      setSources(sourceList);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard telemetry');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const stats = useMemo(() => {
    const completed = scans.filter((scan) => scan.status === 'completed');
    const active = scans.filter((scan) => scan.status === 'running' || scan.status === 'pending');

    const assets = scans.reduce((sum, scan) => sum + (scan.final_subdomains || 0), 0);
    const rawFindings = scans.reduce((sum, scan) => sum + (scan.raw_results || 0), 0);
    const totalDuration = completed.reduce((sum, scan) => sum + (scan.duration_ms || 0), 0);

    // Scans per day over the trailing window, oldest bucket first.
    const dayMs = 86_400_000;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const trend = Array.from({ length: TREND_DAYS }, (_, index) => {
      const bucketStart = todayStart.getTime() - (TREND_DAYS - 1 - index) * dayMs;
      return scans.filter((scan) => {
        const started = new Date(scan.started_at).getTime();
        return started >= bucketStart && started < bucketStart + dayMs;
      }).length;
    });

    return {
      total: scans.length,
      completed: completed.length,
      failed: scans.filter((scan) => scan.status === 'failed').length,
      active,
      assets,
      rawFindings,
      avgDuration: completed.length > 0 ? totalDuration / completed.length : 0,
      trend,
      scansToday: trend[trend.length - 1] ?? 0,
    };
  }, [scans]);

  // A running scan changes these numbers underneath the user; poll until settled.
  useEffect(() => {
    if (stats.active.length === 0) return;
    const interval = window.setInterval(() => fetchData(true), 5_000);
    return () => window.clearInterval(interval);
  }, [stats.active.length, fetchData]);

  const activeSources = sources.filter((source) => source.enabled);
  const keyedOut = sources.filter((source) => source.auth_required && !source.enabled);
  const recentScans = scans.slice(0, RECENT_ROWS);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Mission Control"
        title="Intelligence Dashboard"
        description="Passive asset inventory, provider health and reconnaissance tempo."
        icon={Radar}
        actions={
          <>
            <IconButton
              label="Refresh telemetry"
              icon={RefreshCw}
              spinning={refreshing || loading}
              onClick={() => fetchData(true)}
              disabled={loading}
            />
            <ButtonLink to="/scans/new" variant="primary" icon={Radar}>
              Configure scan
            </ButtonLink>
          </>
        }
      />

      {error && (
        <Alert
          tone="error"
          title="Cannot reach the engine"
          action={
            <Button size="sm" variant="ghost" onClick={() => fetchData()}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      <TargetAcquisition />

      {/* Live mission banner — only present while something is in flight. */}
      {stats.active.length > 0 && (
        <div className="card border-primary/30 animate-pulse-border p-4 flex flex-col sm:flex-row sm:items-center gap-4">
          <span className="flex items-center gap-2.5 shrink-0">
            <Activity className="w-4 h-4 text-primary animate-pulse" aria-hidden="true" />
            <span className="eyebrow text-primary/80">
              {stats.active.length} scan{stats.active.length > 1 ? 's' : ''} in flight
            </span>
          </span>

          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
            {stats.active.slice(0, 4).map((scan) => (
              <Link
                key={scan.id}
                to={`/scans/${scan.id}`}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-background/60 border border-surface-border hover:border-primary/40 transition-colors"
              >
                <span className="font-mono text-xs text-white truncate max-w-[12rem]">
                  {scan.target}
                </span>
                <StatusBadge status={scan.status} size="sm" />
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {loading ? (
          <SkeletonTiles count={4} />
        ) : (
          <>
            <StatTile
              label="Discovered assets"
              value={formatNumber(stats.assets)}
              tone="primary"
              icon={Globe}
              footer={<Meter value={stats.assets} max={Math.max(stats.rawFindings, 1)} tone="primary" label="Assets kept from raw findings" />}
              hint={`${formatNumber(stats.rawFindings)} raw findings deduplicated`}
            />

            <StatTile
              label="Success rate"
              value={`${Math.round(ratio(stats.completed, Math.max(stats.total, 1)))}%`}
              tone="verified"
              icon={CheckCircle2}
              footer={
                <Meter
                  value={stats.completed}
                  max={Math.max(stats.total, 1)}
                  tone="verified"
                  label="Completed scans"
                />
              }
              hint={`${formatNumber(stats.completed)} completed · ${formatNumber(stats.failed)} failed`}
            />

            <StatTile
              label="Average duration"
              value={formatDuration(stats.avgDuration)}
              tone="attention"
              icon={Zap}
              footer={<Sparkbars values={stats.trend} tone="attention" label={`Scans per day over the last ${TREND_DAYS} days`} />}
              hint={`${formatNumber(stats.scansToday)} today · ${TREND_DAYS}-day tempo`}
            />

            <div className="card reticle p-4 sm:p-5 flex items-center gap-4">
              <Gauge
                value={activeSources.length}
                max={Math.max(sources.length, 1)}
                tone={keyedOut.length > 0 ? 'attention' : 'verified'}
                label="Operational OSINT providers"
              >
                <span className="text-xl font-bold font-mono text-white tabular-nums leading-none">
                  {activeSources.length}
                </span>
                <span className="text-micro font-mono text-slate-600 mt-0.5">
                  /{sources.length || '—'}
                </span>
              </Gauge>

              <div className="min-w-0">
                <span className="eyebrow flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-signal-verified" aria-hidden="true" />
                  OSINT engines
                </span>
                <p className="mt-2 text-sm text-slate-300 leading-snug">
                  {activeSources.length} of {sources.length || '—'} providers ready to query.
                </p>
                {keyedOut.length > 0 && (
                  <p className="mt-1.5 text-micro font-mono text-signal-attention flex items-center gap-1">
                    <KeyRound className="w-3 h-3" aria-hidden="true" />
                    {keyedOut.length} awaiting an API key
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <section className="card overflow-hidden xl:col-span-2">
          <div className="p-4 border-b border-surface-border flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold font-display text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" aria-hidden="true" />
              Target inventory
            </h2>
            <Link
              to="/history"
              className="text-xs text-primary hover:text-primary-light font-medium flex items-center gap-1 transition-colors"
            >
              Full history
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </Link>
          </div>

          {!loading && recentScans.length === 0 ? (
            <EmptyState
              icon={Radar}
              title="No reconnaissance on record"
              description="Launch a scan from the target acquisition panel above to start building the inventory."
              action={
                <ButtonLink to="/scans/new" variant="primary" icon={Radar}>
                  Configure a scan
                </ButtonLink>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Target</th>
                    <th scope="col">State</th>
                    <th scope="col" className="text-right">Assets</th>
                    <th scope="col" className="text-right">Elapsed</th>
                    <th scope="col">Started</th>
                    <th scope="col" className="text-right" />
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <SkeletonTable columns={6} rows={5} />
                  ) : (
                    recentScans.map((scan) => (
                      <tr key={scan.id}>
                        <td>
                          <Link
                            to={`/scans/${scan.id}`}
                            className="font-mono font-medium text-white hover:text-primary transition-colors"
                          >
                            {scan.target}
                          </Link>
                        </td>
                        <td>
                          <StatusBadge status={scan.status} size="sm" />
                        </td>
                        <td className="text-right font-mono tabular-nums text-slate-200">
                          {formatNumber(scan.final_subdomains)}
                        </td>
                        <td className="text-right font-mono tabular-nums text-slate-500 text-xs">
                          {formatDuration(scan.duration_ms)}
                        </td>
                        <td className="text-slate-500 text-xs whitespace-nowrap">
                          <time dateTime={scan.started_at} title={formatDateTime(scan.started_at)}>
                            {formatRelativeTime(scan.started_at)}
                          </time>
                        </td>
                        <td className="text-right">
                          <Link
                            to={`/scans/${scan.id}`}
                            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-light transition-colors"
                          >
                            Inspect
                            <ArrowRight className="w-3 h-3" aria-hidden="true" />
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Provider matrix: which feeds are live right now. */}
        <section className="card overflow-hidden">
          <div className="p-4 border-b border-surface-border flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold font-display text-white flex items-center gap-2">
              <Database className="w-4 h-4 text-primary" aria-hidden="true" />
              OSINT feed matrix
            </h2>
            <Link
              to="/sources"
              className="text-xs text-primary hover:text-primary-light font-medium transition-colors"
            >
              Details
            </Link>
          </div>

          <ul className="divide-y divide-surface-border/60 max-h-[26rem] overflow-y-auto">
            {loading ? (
              <li className="p-4 space-y-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="skeleton h-5 w-full" />
                ))}
              </li>
            ) : sources.length === 0 ? (
              <li>
                <EmptyState compact icon={Database} title="Provider catalog unavailable" />
              </li>
            ) : (
              sources.map((source) => (
                <li
                  key={source.id}
                  className="flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-surface-raised/50 transition-colors"
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        source.enabled ? 'bg-signal-verified' : 'bg-signal-attention'
                      }`}
                      aria-hidden="true"
                    />
                    <span className="font-mono text-xs text-slate-200 truncate">{source.name}</span>
                  </span>

                  <span className={source.enabled ? 'chip-verified' : 'chip-attention'}>
                    {source.enabled ? 'live' : 'key req'}
                  </span>
                </li>
              ))
            )}
          </ul>

          {!loading && sources.length > 0 && (
            <div className="px-4 py-3 border-t border-surface-border bg-surface-raised/30 flex items-center gap-2">
              <GaugeIcon className="w-3.5 h-3.5 text-slate-600" aria-hidden="true" />
              <span className="text-micro font-mono text-slate-500">
                {activeSources.length}/{sources.length} operational
              </span>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
