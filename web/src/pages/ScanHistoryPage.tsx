import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  History,
  Search,
  Trash2,
  ArrowRight,
  RefreshCw,
  Clock,
  Layers,
  Filter,
} from 'lucide-react';
import { api } from '../services/api';
import { ScanRecord } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { Modal } from '../components/Modal';

export const ScanHistoryPage: React.FC = () => {
  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [targetFilter, setTargetFilter] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);

  const fetchScans = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const records = await api.getScans({
        target: targetFilter.trim() || undefined,
        limit: 100,
      });
      setScans(records);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to retrieve scan history');
    } finally {
      setLoading(false);
    }
  }, [targetFilter]);

  useEffect(() => {
    fetchScans();
  }, [fetchScans]);

  const handleConfirmDelete = async () => {
    if (!deleteTargetId) return;
    setDeleting(true);
    try {
      await api.deleteScan(deleteTargetId);
      setScans((prev) => prev.filter((s) => s.id !== deleteTargetId));
      setDeleteTargetId(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete scan record');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <History className="w-6 h-6 text-primary" />
            <span>Reconnaissance History</span>
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-400">
            Historical passive OSINT investigations persisted in local SQLite storage.
          </p>
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Filter by target..."
              value={targetFilter}
              onChange={(e) => setTargetFilter(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-slate-900 border border-surface-border rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary font-mono w-48 sm:w-56"
            />
          </div>
          <button
            onClick={() => fetchScans()}
            className="p-2 text-slate-400 hover:text-white bg-slate-900 border border-surface-border rounded-lg text-xs transition-colors"
            title="Refresh history"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/50 text-rose-300 text-xs flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => fetchScans()} className="underline hover:text-white font-medium">
            Retry
          </button>
        </div>
      )}

      {/* Table Card */}
      <div className="bg-surface border border-surface-border rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/60 text-slate-400 uppercase font-medium tracking-wider text-[11px] border-b border-surface-border">
              <tr>
                <th className="py-3 px-4">Scan ID</th>
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
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-primary" />
                    Loading historical scan records...
                  </td>
                </tr>
              ) : scans.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    No historical scans matching criteria.
                  </td>
                </tr>
              ) : (
                scans.map((scan) => (
                  <tr key={scan.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                      <span title={scan.id}>{scan.id.slice(0, 8)}...</span>
                    </td>
                    <td className="py-3 px-4 font-mono font-medium text-white">
                      <Link to={`/scans/${scan.id}`} className="hover:text-primary transition-colors">
                        {scan.target}
                      </Link>
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={scan.status} size="sm" />
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-300 font-semibold">
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
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          to={`/scans/${scan.id}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium border border-surface-border transition-colors"
                        >
                          <span>View</span>
                          <ArrowRight className="w-3 h-3" />
                        </Link>
                        <button
                          onClick={() => setDeleteTargetId(scan.id)}
                          className="p-1 text-slate-400 hover:text-rose-400 transition-colors"
                          title="Delete Scan"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={Boolean(deleteTargetId)}
        onClose={() => setDeleteTargetId(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Scan Record"
        message={`Are you sure you want to permanently delete this scan record (${deleteTargetId?.slice(0, 8)}...)? All associated subdomain and telemetry data will be erased.`}
        confirmLabel={deleting ? 'Deleting...' : 'Delete'}
        isDestructive={true}
      />
    </div>
  );
};
