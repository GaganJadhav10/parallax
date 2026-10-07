import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Globe,
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
  Layers,
  Terminal,
  ArrowLeft,
  RefreshCw,
} from 'lucide-react';
import { api } from '../services/api';
import { Report, ScanStatusResponse } from '../types';
import { useScanEvents, ScanProgressState } from '../hooks/useScanEvents';
import { StatusBadge } from '../components/StatusBadge';
import { Modal } from '../components/Modal';

export const ScanDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [scanStatus, setScanStatus] = useState<ScanStatusResponse | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState<boolean>(false);
  const [copiedItem, setCopiedItem] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);

  // Fetch final results when scan completes
  const fetchResults = useCallback(async (scanId: string) => {
    try {
      const rep = await api.getScanResults(scanId);
      setReport(rep);
    } catch (err: unknown) {
      console.warn('Scan results not yet available:', err);
    }
  }, []);

  // Fetch initial scan state
  const loadScanData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
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

  // Hook up SSE live events stream
  const isScanActive = scanStatus?.status === 'running' || scanStatus?.status === 'pending';
  const {
    events,
    progressState,
    providers,
    rawCount,
    uniqueCount,
    liveCount,
    error: sseError,
  } = useScanEvents(id, isScanActive, () => {
    if (id) {
      loadScanData();
    }
  });

  // Handle hostname copy
  const handleCopyAll = () => {
    if (!report || report.subdomains.length === 0) return;
    const names = report.subdomains.map((s) => s.name).join('\n');
    navigator.clipboard.writeText(names);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const handleCopySingle = (name: string) => {
    navigator.clipboard.writeText(name);
    setCopiedItem(name);
    setTimeout(() => setCopiedItem(null), 1500);
  };

  // Filter subdomains
  const filteredSubdomains = useMemo(() => {
    if (!report) return [];
    if (!searchQuery.trim()) return report.subdomains;
    const q = searchQuery.toLowerCase().trim();
    return report.subdomains.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.sources.some((src) => src.toLowerCase().includes(q)) ||
        s.ips?.some((ip) => ip.includes(q)) ||
        s.cnames?.some((cn) => cn.toLowerCase().includes(q))
    );
  }, [report, searchQuery]);

  // Delete scan
  const handleDeleteScan = async () => {
    if (!id) return;
    setDeleting(true);
    try {
      await api.deleteScan(id);
      navigate('/history');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete scan');
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="py-24 text-center space-y-3">
        <RefreshCw className="w-8 h-8 animate-spin mx-auto text-primary" />
        <p className="text-sm text-slate-400">Loading reconnaissance investigation...</p>
      </div>
    );
  }

  if (error && !scanStatus) {
    return (
      <div className="p-8 rounded-xl bg-surface border border-surface-border text-center space-y-4 max-w-lg mx-auto">
        <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
          <XCircle className="w-6 h-6" />
        </div>
        <h2 className="text-base font-semibold text-white">Scan Not Found</h2>
        <p className="text-xs text-slate-400">{error}</p>
        <Link
          to="/history"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return to Scan History</span>
        </Link>
      </div>
    );
  }

  const effectiveStatus = (isScanActive ? progressState : scanStatus?.status) || 'unknown';
  const targetDomain = scanStatus?.target || report?.domain || '';

  return (
    <div className="space-y-6">
      {/* Top Bar Navigation & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/history')}
            className="p-1.5 rounded-lg border border-surface-border text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Back to History"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-bold font-mono text-white tracking-tight">
                {targetDomain}
              </h1>
              <StatusBadge status={effectiveStatus} />
            </div>
            <p className="text-[11px] font-mono text-slate-500 mt-0.5">ID: {id}</p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {id && (
            <>
              <a
                href={api.getReportURL(id, 'html')}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg border border-surface-border transition-colors"
                title="View Standalone HTML Report"
              >
                <FileText className="w-3.5 h-3.5 text-primary" />
                <span>View HTML</span>
                <ExternalLink className="w-3 h-3 text-slate-400" />
              </a>

              <a
                href={api.getReportURL(id, 'json')}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg border border-surface-border transition-colors"
                title="View Raw JSON Report"
              >
                <FileCode className="w-3.5 h-3.5 text-amber-400" />
                <span>JSON</span>
                <ExternalLink className="w-3 h-3 text-slate-400" />
              </a>

              <button
                onClick={() => setIsDeleteModalOpen(true)}
                className="p-1.5 rounded-lg border border-surface-border text-slate-400 hover:text-rose-400 hover:bg-rose-950/20 transition-colors"
                title="Delete Scan Record"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* SSE Error Alert */}
      {sseError && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/50 text-rose-300 text-xs flex items-center gap-2">
          <XCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{sseError}</span>
        </div>
      )}

      {/* Live Telemetry Progress Section (when running or recent events present) */}
      {isScanActive && (
        <div className="bg-surface border border-primary/30 rounded-xl p-5 space-y-4 shadow-lg animate-pulse-subtle">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary animate-spin" />
              <h2 className="text-sm font-semibold text-white">Live Reconnaissance Pipeline</h2>
            </div>
            <span className="text-xs font-mono uppercase text-primary font-bold">
              State: {progressState}
            </span>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            <div className="bg-slate-900/60 p-3 rounded-lg border border-surface-border">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Raw Findings</span>
              <span className="text-lg font-bold font-mono text-white">{rawCount}</span>
            </div>
            <div className="bg-slate-900/60 p-3 rounded-lg border border-surface-border">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Unique Candidates</span>
              <span className="text-lg font-bold font-mono text-white">{uniqueCount}</span>
            </div>
            <div className="bg-slate-900/60 p-3 rounded-lg border border-surface-border">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Verified Live Hosts</span>
              <span className="text-lg font-bold font-mono text-white">{liveCount}</span>
            </div>
            <div className="bg-slate-900/60 p-3 rounded-lg border border-surface-border">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Pipeline Phase</span>
              <span className="text-sm font-bold font-mono text-primary uppercase mt-1 block">
                {progressState}
              </span>
            </div>
          </div>

          {/* Provider Progress Status */}
          {Object.keys(providers).length > 0 && (
            <div className="space-y-2 pt-2">
              <span className="text-xs font-medium text-slate-300 block">Provider Queries:</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {Object.values(providers).map((prov) => (
                  <div
                    key={prov.name}
                    className="p-2.5 rounded-lg bg-slate-900/80 border border-surface-border flex items-center justify-between text-xs"
                  >
                    <span className="font-mono text-slate-200">{prov.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-slate-400 text-[11px]">
                        {prov.candidates} found
                      </span>
                      {prov.status === 'completed' ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      ) : prov.status === 'failed' ? (
                        <XCircle className="w-3.5 h-3.5 text-rose-400" />
                      ) : (
                        <div className="w-3 h-3 border border-primary border-t-transparent rounded-full animate-spin" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Event Stream Log */}
          {events.length > 0 && (
            <div className="space-y-1.5 pt-2">
              <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5" />
                <span>Live Event Stream</span>
              </span>
              <div className="bg-slate-950 rounded-lg p-3 max-h-40 overflow-y-auto font-mono text-[11px] text-slate-300 space-y-1 border border-surface-border/80">
                {events.map((ev, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <span className="text-slate-500 shrink-0">
                      [{new Date(ev.timestamp).toLocaleTimeString()}]
                    </span>
                    <span className="text-primary font-semibold shrink-0">{ev.type}</span>
                    <span className="text-slate-400 truncate">
                      {ev.source_name ? `${ev.source_name} ` : ''}
                      {ev.candidates !== undefined ? `(${ev.candidates} candidates) ` : ''}
                      {ev.error ? `Error: ${ev.error}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Completed Results Summary Stats */}
      {report && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-surface border border-surface-border rounded-xl p-4">
            <span className="text-xs text-slate-400 uppercase tracking-wider block font-medium">
              Subdomains Discovered
            </span>
            <span className="text-2xl font-bold font-mono text-white mt-1 block">
              {report.total_found}
            </span>
          </div>

          <div className="bg-surface border border-surface-border rounded-xl p-4">
            <span className="text-xs text-slate-400 uppercase tracking-wider block font-medium">
              DNS Verification
            </span>
            <span className="text-base font-bold font-mono text-emerald-400 mt-2 block">
              {report.resolved_enabled ? 'Enabled' : 'Passive Only'}
            </span>
          </div>

          <div className="bg-surface border border-surface-border rounded-xl p-4">
            <span className="text-xs text-slate-400 uppercase tracking-wider block font-medium">
              Duration
            </span>
            <span className="text-2xl font-bold font-mono text-white mt-1 block">
              {report.metadata.duration_ms}ms
            </span>
          </div>

          <div className="bg-surface border border-surface-border rounded-xl p-4">
            <span className="text-xs text-slate-400 uppercase tracking-wider block font-medium">
              Sources Queried
            </span>
            <span className="text-2xl font-bold font-mono text-white mt-1 block">
              {report.metadata.source_timings?.length || 0}
            </span>
          </div>
        </div>
      )}

      {/* Subdomain Findings Inventory */}
      {report && (
        <div className="bg-surface border border-surface-border rounded-xl overflow-hidden shadow-lg">
          <div className="p-4 border-b border-surface-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <span>Discovered Hostnames</span>
                <span className="text-xs font-mono text-slate-400">
                  ({filteredSubdomains.length} of {report.total_found})
                </span>
              </h2>
            </div>

            <div className="flex items-center gap-3">
              {/* Search Box */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter hostnames, IPs, sources..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 bg-slate-900 border border-surface-border rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary font-mono w-56 sm:w-64"
                />
              </div>

              {/* Copy All Button */}
              <button
                onClick={handleCopyAll}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-medium border border-surface-border transition-colors shrink-0"
                title="Copy all hostnames to clipboard"
              >
                {copiedAll ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedAll ? 'Copied' : 'Copy All'}</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/60 text-slate-400 uppercase font-medium tracking-wider text-[11px] border-b border-surface-border">
                <tr>
                  <th className="py-3 px-4">Hostname</th>
                  <th className="py-3 px-4">Attribution Sources</th>
                  {report.resolved_enabled && <th className="py-3 px-4">IP Addresses</th>}
                  {report.resolved_enabled && <th className="py-3 px-4">CNAME Aliases</th>}
                  <th className="py-3 px-4 text-right">Copy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {filteredSubdomains.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      No subdomains match your search criteria.
                    </td>
                  </tr>
                ) : (
                  filteredSubdomains.map((sub) => (
                    <tr key={sub.name} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-2.5 px-4 font-mono font-medium text-white">
                        {sub.name}
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="flex flex-wrap gap-1">
                          {sub.sources.map((src) => (
                            <span
                              key={src}
                              className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 font-mono border border-slate-700"
                            >
                              {src}
                            </span>
                          ))}
                        </div>
                      </td>
                      {report.resolved_enabled && (
                        <td className="py-2.5 px-4 font-mono text-[11px] text-slate-300">
                          {sub.ips && sub.ips.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {sub.ips.map((ip) => (
                                <span
                                  key={ip}
                                  className="px-1.5 py-0.5 rounded bg-sky-950/50 text-sky-300 border border-sky-800/50 text-[10px]"
                                >
                                  {ip}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-500">-</span>
                          )}
                        </td>
                      )}
                      {report.resolved_enabled && (
                        <td className="py-2.5 px-4 font-mono text-[11px] text-slate-300">
                          {sub.cnames && sub.cnames.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {sub.cnames.map((cn) => (
                                <span
                                  key={cn}
                                  className="px-1.5 py-0.5 rounded bg-amber-950/50 text-amber-300 border border-amber-800/50 text-[10px]"
                                >
                                  {cn}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-500">-</span>
                          )}
                        </td>
                      )}
                      <td className="py-2.5 px-4 text-right">
                        <button
                          onClick={() => handleCopySingle(sub.name)}
                          className="p-1 hover:text-white text-slate-400 transition-colors"
                          title="Copy hostname"
                        >
                          {copiedItem === sub.name ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDeleteScan}
        title="Delete Reconnaissance Record"
        message={`Are you sure you want to permanently delete the scan record for ${targetDomain}? This action cannot be undone.`}
        confirmLabel={deleting ? 'Deleting...' : 'Delete Scan'}
        isDestructive={true}
      />
    </div>
  );
};
