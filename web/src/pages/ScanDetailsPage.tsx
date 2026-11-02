import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Clock,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  FileCode,
  FileText,
  Trash2,
  Search,
  ExternalLink,
  Activity,
  Terminal,
  ArrowLeft,
  RefreshCw,
  Download,
  ArrowUpDown,
  Globe,
  Layers,
  Repeat,
  ChevronDown,
  ChevronRight,
  Network,
  Table2,
  Server,
} from 'lucide-react';
import { api } from '../services/api';
import { Report, ScanStatusResponse, Subdomain } from '../types';
import { useScanEvents } from '../hooks/useScanEvents';
import { StatusBadge } from '../components/StatusBadge';
import { Modal } from '../components/Modal';
import { PipelineHUD } from '../components/PipelineHUD';
import { StatTile, Meter } from '../components/ui/Telemetry';
import { Button, ExternalButtonLink, IconButton } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { EmptyState } from '../components/ui/EmptyState';
import { Pagination } from '../components/ui/Pagination';
import { useToast } from '../components/ui/Toast';
import { fingerprintHost, fingerprintSummary, groupHosts, GroupMode, uniqueIPs } from '../lib/infra';
import {
  csvCell,
  downloadTextFile,
  formatDateTime,
  formatDuration,
  formatNumber,
  formatTime,
  shortId,
} from '../lib/format';

type SortKey = 'name' | 'sources' | 'ips';
type SortDirection = 'asc' | 'desc';
type ViewMode = 'table' | 'infrastructure';

/** Long IP lists made rows six lines tall; collapse past this and let users expand. */
const INLINE_CHIP_LIMIT = 3;

const ChipList: React.FC<{ values: string[]; className: string }> = ({ values, className }) => {
  const [expanded, setExpanded] = useState(false);
  if (values.length === 0) return <span className="text-slate-700">—</span>;

  const visible = expanded ? values : values.slice(0, INLINE_CHIP_LIMIT);
  const hidden = values.length - visible.length;

  return (
    <div className="flex flex-wrap gap-1 items-center">
      {visible.map((value) => (
        <span key={value} className={className}>
          {value}
        </span>
      ))}
      {hidden > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="text-micro font-mono text-primary hover:text-primary-light transition-colors px-1"
        >
          +{hidden}
        </button>
      )}
      {expanded && values.length > INLINE_CHIP_LIMIT && (
        <button
          onClick={() => setExpanded(false)}
          className="text-micro font-mono text-slate-600 hover:text-slate-400 transition-colors px-1"
        >
          less
        </button>
      )}
    </div>
  );
};

const GROUP_LABELS: Record<GroupMode, string> = {
  ip: 'Shared IP',
  subnet: 'Subnet /24',
  cname: 'CNAME target',
};

export const ScanDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { notify } = useToast();

  const [scanStatus, setScanStatus] = useState<ScanStatusResponse | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedItem, setCopiedItem] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [resolvedOnly, setResolvedOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [groupMode, setGroupMode] = useState<GroupMode>('ip');
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [telemetryOpen, setTelemetryOpen] = useState(false);

  const fetchResults = useCallback(async (scanId: string) => {
    try {
      setReport(await api.getScanResults(scanId));
    } catch (err: unknown) {
      console.warn('Scan results not yet available:', err);
    }
  }, []);

  const loadScanData = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const status = await api.getScanStatus(id);
      setScanStatus(status);
      if (status.status === 'completed') {
        await fetchResults(id);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to retrieve scan');
    } finally {
      setLoading(false);
    }
  }, [id, fetchResults]);

  useEffect(() => {
    loadScanData();
  }, [loadScanData]);

  const isScanActive = scanStatus?.status === 'running' || scanStatus?.status === 'pending';

  const {
    events,
    progressState,
    providers,
    rawCount,
    uniqueCount,
    liveCount,
    isConnected,
    error: sseError,
  } = useScanEvents(id, isScanActive, loadScanData);

  // SSE can be blocked by a proxy; poll as a fallback so the page still advances.
  useEffect(() => {
    if (!isScanActive || isConnected) return;
    const interval = window.setInterval(loadScanData, 4_000);
    return () => window.clearInterval(interval);
  }, [isScanActive, isConnected, loadScanData]);

  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [events.length]);

  const copyText = useCallback(
    (text: string, key: string, message: string) => {
      navigator.clipboard.writeText(text).then(
        () => {
          setCopiedItem(key);
          notify(message, 'success');
          window.setTimeout(() => setCopiedItem(null), 1500);
        },
        () => notify('Clipboard access was blocked by the browser', 'error')
      );
    },
    [notify]
  );

  const visibleSubdomains = useMemo(() => {
    if (!report) return [];
    const query = searchQuery.toLowerCase().trim();

    const filtered = report.subdomains.filter((sub) => {
      if (resolvedOnly && !(sub.ips && sub.ips.length > 0)) return false;
      if (!query) return true;
      return (
        sub.name.toLowerCase().includes(query) ||
        sub.sources.some((source) => source.toLowerCase().includes(query)) ||
        sub.ips?.some((ip) => ip.includes(query)) ||
        sub.cnames?.some((cname) => cname.toLowerCase().includes(query))
      );
    });

    const direction = sortDirection === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'sources':
          return (a.sources.length - b.sources.length) * direction;
        case 'ips':
          return ((a.ips?.length ?? 0) - (b.ips?.length ?? 0)) * direction;
        default:
          return a.name.localeCompare(b.name) * direction;
      }
    });
  }, [report, searchQuery, resolvedOnly, sortKey, sortDirection]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, resolvedOnly, sortKey, sortDirection, pageSize, viewMode]);

  const pagedSubdomains = useMemo(
    () => visibleSubdomains.slice((page - 1) * pageSize, page * pageSize),
    [visibleSubdomains, page, pageSize]
  );

  const groups = useMemo(
    () => (viewMode === 'infrastructure' ? groupHosts(visibleSubdomains, groupMode) : []),
    [viewMode, visibleSubdomains, groupMode]
  );

  const fingerprints = useMemo(
    () => (report ? fingerprintSummary(report.subdomains) : []),
    [report]
  );

  const allIPs = useMemo(() => uniqueIPs(visibleSubdomains), [visibleSubdomains]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const exportCsv = () => {
    if (!report) return;
    const header = ['hostname', 'sources', 'ip_addresses', 'cname_aliases', 'infrastructure'];
    const rows = visibleSubdomains.map((sub) =>
      [
        csvCell(sub.name),
        csvCell(sub.sources.join(' ')),
        csvCell((sub.ips ?? []).join(' ')),
        csvCell((sub.cnames ?? []).join(' ')),
        csvCell(fingerprintHost(sub).join(' ')),
      ].join(',')
    );
    downloadTextFile(
      `parallax-${report.domain}-${shortId(id)}.csv`,
      [header.join(','), ...rows].join('\n'),
      'text/csv'
    );
    notify(`Exported ${formatNumber(visibleSubdomains.length)} hostnames`, 'success');
  };

  const handleDeleteScan = async () => {
    if (!id) return;
    setDeleting(true);
    try {
      await api.deleteScan(id);
      notify('Scan record deleted', 'success');
      navigate('/history');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete scan');
      setDeleting(false);
      setIsDeleteModalOpen(false);
    }
  };

  const rerunScan = async () => {
    if (!scanStatus) return;
    try {
      const response = await api.createScan({
        target: scanStatus.target,
        resolve: scanStatus.resolved_enabled,
      });
      notify(`Re-running reconnaissance for ${scanStatus.target}`, 'success');
      navigate(`/scans/${response.id}`);
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Failed to re-run scan', 'error');
    }
  };

  if (loading) {
    return (
      <div className="py-24 text-center space-y-3">
        <RefreshCw className="w-8 h-8 animate-spin mx-auto text-primary" aria-hidden="true" />
        <p className="text-sm text-slate-500 font-mono">loading investigation…</p>
      </div>
    );
  }

  if (error && !scanStatus) {
    return (
      <div className="card max-w-lg mx-auto">
        <EmptyState
          icon={XCircle}
          title="Scan not found"
          description={error}
          action={
            <Link
              to="/history"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              Return to scan history
            </Link>
          }
        />
      </div>
    );
  }

  const effectiveStatus = (isScanActive ? progressState : scanStatus?.status) || 'unknown';
  const targetDomain = scanStatus?.target || report?.domain || '';
  const failedSources = report?.metadata.failed_sources ?? [];
  const timings = report?.metadata.source_timings ?? [];
  const resolvedCount = visibleSubdomains.filter((sub) => (sub.ips?.length ?? 0) > 0).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 pb-5 border-b border-surface-border/70">
        <div className="flex items-start gap-3 min-w-0">
          <IconButton
            label="Back to scan history"
            icon={ArrowLeft}
            variant="ghost"
            onClick={() => navigate('/history')}
            className="mt-1 shrink-0"
          />
          <div className="min-w-0">
            <p className="eyebrow text-primary/70 mb-1.5">Mission control</p>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-bold font-mono text-white tracking-tight break-all">
                {targetDomain}
              </h1>
              <StatusBadge status={effectiveStatus} />
            </div>
            <p className="text-micro font-mono text-slate-600 mt-2 flex items-center gap-3 flex-wrap">
              <span>id {shortId(id)}</span>
              {scanStatus?.started_at && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" aria-hidden="true" />
                  {formatDateTime(scanStatus.started_at)}
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap lg:shrink-0">
          <Button size="sm" icon={Repeat} onClick={rerunScan} disabled={!scanStatus}>
            Re-run
          </Button>
          {id && (
            <>
              <ExternalButtonLink size="sm" href={api.getReportURL(id, 'html')} icon={FileText}>
                HTML
                <ExternalLink className="w-3 h-3 text-slate-600" aria-hidden="true" />
              </ExternalButtonLink>
              <ExternalButtonLink size="sm" href={api.getReportURL(id, 'json')} icon={FileCode}>
                JSON
                <ExternalLink className="w-3 h-3 text-slate-600" aria-hidden="true" />
              </ExternalButtonLink>
              <IconButton
                label="Delete scan record"
                icon={Trash2}
                variant="ghost"
                onClick={() => setIsDeleteModalOpen(true)}
                className="hover:text-signal-anomaly"
              />
            </>
          )}
        </div>
      </div>

      {sseError && <Alert tone="error">{sseError}</Alert>}

      {isScanActive && (
        <>
          <PipelineHUD
            target={targetDomain}
            state={progressState}
            providers={providers}
            rawCount={rawCount}
            uniqueCount={uniqueCount}
            liveCount={liveCount}
            resolveEnabled={scanStatus?.resolved_enabled ?? false}
          />

          {events.length > 0 && (
            <section className="card p-4 space-y-2">
              <h3 className="eyebrow flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5" aria-hidden="true" />
                Event stream
                {!isConnected && <span className="text-slate-600 normal-case">(polling)</span>}
              </h3>
              <div
                ref={logRef}
                className="bg-background rounded-lg p-3 max-h-48 overflow-y-auto font-mono text-micro text-slate-400 space-y-1 border border-surface-border"
              >
                {events.map((event, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <span className="text-slate-700 shrink-0">{formatTime(event.timestamp)}</span>
                    <span className="text-primary shrink-0">{event.type}</span>
                    <span className="truncate">
                      {event.source_name ? `${event.source_name} ` : ''}
                      {event.candidates !== undefined ? `(${event.candidates})` : ''}
                      {event.error ? `error: ${event.error}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {report && (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            <StatTile
              label="Assets"
              value={formatNumber(report.total_found)}
              tone="primary"
              icon={Globe}
              footer={
                <Meter
                  value={report.total_found}
                  max={Math.max(report.metadata.raw_results, 1)}
                  tone="primary"
                  label="Unique assets from raw findings"
                />
              }
              hint={`${formatNumber(report.metadata.raw_results)} raw findings deduplicated`}
            />

            <StatTile
              label="Resolved"
              value={report.resolved_enabled ? formatNumber(resolvedCount) : 'off'}
              tone={report.resolved_enabled ? 'verified' : 'neutral'}
              icon={CheckCircle2}
              footer={
                report.resolved_enabled ? (
                  <Meter
                    value={resolvedCount}
                    max={Math.max(visibleSubdomains.length, 1)}
                    tone="verified"
                    label="Hosts with an A or AAAA record"
                  />
                ) : undefined
              }
              hint={
                report.resolved_enabled
                  ? `${formatNumber(report.metadata.wildcard_filtered ?? 0)} wildcard entries filtered`
                  : 'DNS verification was disabled'
              }
            />

            <StatTile
              label="Elapsed"
              value={formatDuration(report.metadata.duration_ms)}
              tone="attention"
              icon={Clock}
              hint={`${formatNumber(timings.length)} providers queried in parallel`}
            />

            <StatTile
              label="Provider health"
              value={`${timings.length - failedSources.length}/${timings.length}`}
              tone={failedSources.length > 0 ? 'attention' : 'verified'}
              icon={Layers}
              footer={
                <Meter
                  value={timings.length - failedSources.length}
                  max={Math.max(timings.length, 1)}
                  tone={failedSources.length > 0 ? 'attention' : 'verified'}
                  label="Providers that responded"
                />
              }
              hint={
                failedSources.length > 0
                  ? `${failedSources.length} failed, results still usable`
                  : 'all providers responded'
              }
            />
          </div>

          {fingerprints.length > 0 && (
            <section className="card p-4">
              <h2 className="eyebrow flex items-center gap-2 mb-3">
                <Server className="w-3.5 h-3.5" aria-hidden="true" />
                Infrastructure attribution
                <span className="normal-case tracking-normal text-slate-600">
                  derived from CNAME targets
                </span>
              </h2>
              <div className="flex flex-wrap gap-2">
                {fingerprints.map(({ label, count }) => (
                  <button
                    key={label}
                    onClick={() => {
                      setViewMode('table');
                      setSearchQuery(label === 'GitHub Pages' ? 'github.io' : label.toLowerCase());
                    }}
                    className="chip-alias hover:border-signal-alias transition-colors"
                    title={`Filter hostnames pointing at ${label}`}
                  >
                    {label}
                    <span className="text-slate-500">{formatNumber(count)}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {failedSources.length > 0 && (
            <Alert tone="warning" title={`${failedSources.length} provider(s) did not respond`}>
              <ul className="mt-1 space-y-1 font-mono text-xs">
                {failedSources.map((source) => (
                  <li key={source.id}>
                    <span className="text-signal-attention">{source.name}</span> — {source.health}
                    {source.error ? `: ${source.error}` : ''}
                  </li>
                ))}
              </ul>
            </Alert>
          )}

          {timings.length > 0 && (
            <section className="card overflow-hidden">
              <button
                onClick={() => setTelemetryOpen((open) => !open)}
                aria-expanded={telemetryOpen}
                className="w-full p-4 flex items-center justify-between gap-2 text-left hover:bg-surface-raised/40 transition-colors"
              >
                <span className="text-sm font-semibold font-display text-white flex items-center gap-2">
                  <Activity className="w-4 h-4 text-primary" aria-hidden="true" />
                  Provider breakdown
                  <span className="font-mono text-xs text-slate-600">({timings.length})</span>
                </span>
                {telemetryOpen ? (
                  <ChevronDown className="w-4 h-4 text-slate-500" aria-hidden="true" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-slate-500" aria-hidden="true" />
                )}
              </button>

              {telemetryOpen && (
                <div className="border-t border-surface-border overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th scope="col">Provider</th>
                        <th scope="col">Status</th>
                        <th scope="col" className="text-right">Candidates</th>
                        <th scope="col" className="text-right">Latency</th>
                        <th scope="col" className="w-1/3">Yield</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...timings]
                        .sort((a, b) => b.candidates - a.candidates)
                        .map((timing) => (
                          <tr key={timing.id}>
                            <td className="font-mono text-white">{timing.name}</td>
                            <td>
                              <StatusBadge status={timing.status} size="sm" />
                            </td>
                            <td className="text-right font-mono tabular-nums text-slate-200">
                              {formatNumber(timing.candidates)}
                            </td>
                            <td className="text-right font-mono tabular-nums text-slate-500 text-xs">
                              {formatDuration(timing.duration_ms)}
                            </td>
                            <td>
                              <Meter
                                value={timing.candidates}
                                max={Math.max(...timings.map((item) => item.candidates), 1)}
                                tone="primary"
                                label={`${timing.name} candidate yield`}
                              />
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          <section className="card overflow-hidden">
            <div className="p-4 border-b border-surface-border space-y-3">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-sm font-semibold font-display text-white">Asset inventory</h2>
                  <span className="font-mono text-xs text-slate-600">
                    {formatNumber(visibleSubdomains.length)} / {formatNumber(report.total_found)}
                  </span>

                  {/* View switch: flat list vs co-hosting clusters. */}
                  <div
                    role="tablist"
                    aria-label="Inventory view"
                    className="flex items-center gap-0.5 p-0.5 rounded-lg bg-background/70 border border-surface-border"
                  >
                    {([
                      ['table', 'Table', Table2],
                      ['infrastructure', 'Infrastructure', Network],
                    ] as const).map(([mode, label, Icon]) => (
                      <button
                        key={mode}
                        role="tab"
                        aria-selected={viewMode === mode}
                        onClick={() => setViewMode(mode)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                          viewMode === mode
                            ? 'bg-primary/15 text-primary'
                            : 'text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Export command bar. */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    icon={copiedItem === '__hosts__' ? Check : Copy}
                    onClick={() =>
                      copyText(
                        visibleSubdomains.map((sub) => sub.name).join('\n'),
                        '__hosts__',
                        `Copied ${formatNumber(visibleSubdomains.length)} hostnames`
                      )
                    }
                    disabled={visibleSubdomains.length === 0}
                  >
                    Hosts
                  </Button>

                  <Button
                    size="sm"
                    icon={copiedItem === '__ips__' ? Check : Server}
                    onClick={() =>
                      copyText(
                        allIPs.join('\n'),
                        '__ips__',
                        `Copied ${formatNumber(allIPs.length)} unique IPs`
                      )
                    }
                    disabled={allIPs.length === 0}
                    title="Copy every distinct IP address in view"
                  >
                    IPs
                  </Button>

                  <Button
                    size="sm"
                    icon={Download}
                    onClick={exportCsv}
                    disabled={visibleSubdomains.length === 0}
                  >
                    CSV
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[14rem]">
                  <Search
                    className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Filter hostnames, IPs, CNAMEs, sources…"
                    aria-label="Filter hostnames"
                    className="input-mono pl-8 py-1.5 text-xs"
                  />
                </div>

                {report.resolved_enabled && (
                  <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={resolvedOnly}
                      onChange={(event) => setResolvedOnly(event.target.checked)}
                      className="w-3.5 h-3.5 rounded border-surface-border bg-background text-primary focus:ring-primary focus:ring-offset-background"
                    />
                    Resolved only
                  </label>
                )}

                {viewMode === 'infrastructure' && (
                  <div className="flex items-center gap-1.5">
                    <span className="eyebrow">Cluster by</span>
                    {(['ip', 'subnet', 'cname'] as GroupMode[]).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setGroupMode(mode)}
                        aria-pressed={groupMode === mode}
                        className={`px-2 py-1 rounded-md text-micro font-mono border transition-colors ${
                          groupMode === mode
                            ? 'bg-primary/12 text-primary border-primary/30'
                            : 'bg-background/60 text-slate-500 border-surface-border hover:text-slate-300'
                        }`}
                      >
                        {GROUP_LABELS[mode]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {visibleSubdomains.length === 0 ? (
              <EmptyState
                icon={Search}
                compact
                title="No matching hostnames"
                description={
                  searchQuery || resolvedOnly
                    ? 'Try clearing the filters to see the full result set.'
                    : 'This scan returned no subdomains.'
                }
                action={
                  (searchQuery || resolvedOnly) && (
                    <Button
                      size="sm"
                      onClick={() => {
                        setSearchQuery('');
                        setResolvedOnly(false);
                      }}
                    >
                      Clear filters
                    </Button>
                  )
                }
              />
            ) : viewMode === 'infrastructure' ? (
              <ul className="divide-y divide-surface-border/60 max-h-[40rem] overflow-y-auto">
                {groups.map((group) => (
                  <li key={group.key} className="p-4">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <span className="flex items-center gap-2 min-w-0">
                        <Network className="w-3.5 h-3.5 text-signal-alias shrink-0" aria-hidden="true" />
                        <code className="font-mono text-sm text-white truncate">{group.key}</code>
                      </span>
                      <span className="chip-neutral shrink-0">
                        {formatNumber(group.hosts.length)} host
                        {group.hosts.length === 1 ? '' : 's'}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1.5 pl-5">
                      {group.hosts.map((host) => (
                        <button
                          key={host.name}
                          onClick={() => copyText(host.name, host.name, 'Hostname copied')}
                          className="font-mono text-micro px-2 py-1 rounded bg-background/70 border border-surface-border text-slate-400 hover:text-white hover:border-primary/40 transition-colors"
                          title="Click to copy"
                        >
                          {host.name}
                        </button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th scope="col">
                          <button
                            onClick={() => toggleSort('name')}
                            className="inline-flex items-center gap-1 hover:text-primary transition-colors"
                          >
                            Hostname
                            <ArrowUpDown className="w-3 h-3" aria-hidden="true" />
                          </button>
                        </th>
                        <th scope="col">
                          <button
                            onClick={() => toggleSort('sources')}
                            className="inline-flex items-center gap-1 hover:text-primary transition-colors"
                          >
                            Sources
                            <ArrowUpDown className="w-3 h-3" aria-hidden="true" />
                          </button>
                        </th>
                        {report.resolved_enabled && (
                          <th scope="col">
                            <button
                              onClick={() => toggleSort('ips')}
                              className="inline-flex items-center gap-1 hover:text-primary transition-colors"
                            >
                              Addresses
                              <ArrowUpDown className="w-3 h-3" aria-hidden="true" />
                            </button>
                          </th>
                        )}
                        {report.resolved_enabled && <th scope="col">CNAME / Infra</th>}
                        <th scope="col" className="text-right" />
                      </tr>
                    </thead>
                    <tbody>
                      {pagedSubdomains.map((sub: Subdomain) => {
                        const marks = fingerprintHost(sub);
                        return (
                          <tr key={sub.name}>
                            <td className="font-mono font-medium text-white whitespace-nowrap pr-6">
                              {sub.name}
                            </td>
                            <td>
                              <ChipList values={sub.sources} className="chip-neutral" />
                            </td>
                            {report.resolved_enabled && (
                              <td>
                                <ChipList values={sub.ips ?? []} className="chip-intel" />
                              </td>
                            )}
                            {report.resolved_enabled && (
                              <td>
                                <div className="space-y-1">
                                  <ChipList values={sub.cnames ?? []} className="chip-alias" />
                                  {marks.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                      {marks.map((mark) => (
                                        <span key={mark} className="chip-verified">
                                          {mark}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </td>
                            )}
                            <td className="text-right">
                              <IconButton
                                label={`Copy ${sub.name}`}
                                icon={copiedItem === sub.name ? Check : Copy}
                                variant="ghost"
                                onClick={() => copyText(sub.name, sub.name, 'Hostname copied')}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <Pagination
                  page={page}
                  pageSize={pageSize}
                  totalItems={visibleSubdomains.length}
                  onPageChange={setPage}
                  onPageSizeChange={setPageSize}
                  itemLabel="hostnames"
                />
              </>
            )}
          </section>
        </>
      )}

      {!report && !isScanActive && scanStatus?.status === 'failed' && (
        <Alert tone="error" title="Scan failed">
          This reconnaissance run did not complete, so no results were stored. Re-run the scan to try
          again.
        </Alert>
      )}

      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDeleteScan}
        busy={deleting}
        title="Delete reconnaissance record"
        message={`Permanently delete the scan record for ${targetDomain}? All stored subdomains and telemetry for this run will be erased. This cannot be undone.`}
        confirmLabel={deleting ? 'Deleting…' : 'Delete scan'}
        isDestructive
      />
    </div>
  );
};
