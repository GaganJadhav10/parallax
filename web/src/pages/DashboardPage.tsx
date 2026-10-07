import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Radar,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  PlusCircle,
  Activity,
  Globe,
  RefreshCw,
} from 'lucide-react';
import { api } from '../services/api';
import { ScanRecord } from '../types';
import { StatusBadge } from '../components/StatusBadge';

export const DashboardPage: React.FC = () => {
  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getScans({ limit: 20 });
      setScans(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard metrics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const totalScans = scans.length;
  const successfulScans = scans.filter((s) => s.status === 'completed').length;
  const failedScans = scans.filter((s) => s.status === 'failed').length;
  const totalSubdomains = scans.reduce((acc, s) => acc + (s.final_subdomains || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-surface border border-surface-border rounded-xl p-6 relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Intelligence Dashboard</h1>
            <span className="text-[10px] font-mono uppercase bg-primary/10 border border-primary/30 text-primary px-2 py-0.5 rounded-full font-semibold">
              Live Monitor
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 max-w-2xl">
            Real-time passive asset inventory and multi-source OSINT reconnaissance telemetry.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={fetchDashboardData}
            disabled={loading}
            className="p-2 text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-800 border border-surface-border rounded-lg text-xs transition-colors"
            title="Refresh metrics"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <Link
            to="/scans/new"
            className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-white text-xs font-semibold px-4 py-2 rounded-lg shadow transition-colors"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Launch New Scan</span>
          </Link>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-4 rounded-lg bg-rose-950/40 border border-rose-800/50 text-rose-300 text-xs flex items-center justify-between">
          <span>{error}</span>
          <button onClick={fetchDashboardData} className="underline hover:text-white font-medium">
            Retry
          </button>
        </div>
      )}

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface border border-surface-border rounded-xl p-4 relative">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Total Scans</span>
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <Radar className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-white font-mono">{totalScans}</div>
          <div className="mt-1 text-[11px] text-slate-500">Indexed in reconnaissance history</div>
        </div>

        <div className="bg-surface border border-surface-border rounded-xl p-4 relative">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Discovered Assets</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Globe className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-white font-mono">{totalSubdomains}</div>
          <div className="mt-1 text-[11px] text-slate-500">Unique hostname findings</div>
        </div>

        <div className="bg-surface border border-surface-border rounded-xl p-4 relative">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Completed</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-white font-mono">{successfulScans}</div>
          <div className="mt-1 text-[11px] text-slate-500">Successfully resolved investigations</div>
        </div>

        <div className="bg-surface border border-surface-border rounded-xl p-4 relative">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Failed / Interrupted</span>
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
              <XCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-white font-mono">{failedScans}</div>
          <div className="mt-1 text-[11px] text-slate-500">Unresolvable or provider failure</div>
        </div>
      </div>

      {/* Recent Investigations Table */}
      <div className="bg-surface border border-surface-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-surface-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-white">Recent Reconnaissance Scans</h2>
          </div>
          <Link
            to="/history"
            className="text-xs text-primary hover:text-primary-hover font-medium flex items-center gap-1 transition-colors"
          >
            <span>View All History</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/60 text-slate-400 uppercase font-medium tracking-wider text-[11px] border-b border-surface-border">
              <tr>
                <th className="py-3 px-4">Target Domain</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Subdomains</th>
                <th className="py-3 px-4">Duration</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-primary" />
                    Loading recent reconnaissance activity...
                  </td>
                </tr>
              ) : scans.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    No reconnaissance scans recorded yet.{' '}
                    <Link to="/scans/new" className="text-primary hover:underline">
                      Launch your first scan.
                    </Link>
                  </td>
                </tr>
              ) : (
                scans.slice(0, 8).map((scan) => (
                  <tr key={scan.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-4 font-mono font-medium text-white">
                      <Link to={`/scans/${scan.id}`} className="hover:text-primary transition-colors">
                        {scan.target}
                      </Link>
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={scan.status} size="sm" />
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-300">
                      {scan.final_subdomains || 0}
                    </td>
                    <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                      {scan.duration_ms ? `${scan.duration_ms}ms` : '-'}
                    </td>
                    <td className="py-3 px-4 text-slate-400 text-[11px] flex items-center gap-1.5">
                      <Clock className="w-3 h-3 text-slate-500" />
                      {new Date(scan.started_at).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Link
                        to={`/scans/${scan.id}`}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:text-primary-hover transition-colors"
                      >
                        <span>Details</span>
                        <ArrowRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
