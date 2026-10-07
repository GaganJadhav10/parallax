import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  GitCompare,
  Plus,
  Minus,
  Check,
  AlertCircle,
  Copy,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import { api } from '../services/api';
import { ScanRecord, ScanComparison } from '../types';

export const ScanComparisonPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [selectedScanA, setSelectedScanA] = useState<string>(searchParams.get('a') || '');
  const [selectedScanB, setSelectedScanB] = useState<string>(searchParams.get('b') || '');
  const [comparison, setComparison] = useState<ScanComparison | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'added' | 'removed' | 'common'>('added');
  const [copiedItem, setCopiedItem] = useState<string | null>(null);

  useEffect(() => {
    const loadScans = async () => {
      try {
        const records = await api.getScans({ limit: 100 });
        setScans(records);
      } catch (err: unknown) {
        console.error('Failed to load scans for comparison:', err);
      }
    };
    loadScans();
  }, []);

  const runComparison = async (id1: string, id2: string) => {
    if (!id1 || !id2) return;
    setLoading(true);
    setError(null);
    setComparison(null);

    try {
      const data = await api.compareScans(id1, id2);
      setComparison(data);
      setSearchParams({ a: id1, b: id2 });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Comparison failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const a = searchParams.get('a');
    const b = searchParams.get('b');
    if (a && b) {
      setSelectedScanA(a);
      setSelectedScanB(b);
      runComparison(a, b);
    }
  }, []);

  const handleCompareClick = () => {
    if (!selectedScanA || !selectedScanB) {
      setError('Please select two scans to compare.');
      return;
    }
    runComparison(selectedScanA, selectedScanB);
  };

  const handleCopy = (name: string) => {
    navigator.clipboard.writeText(name);
    setCopiedItem(name);
    setTimeout(() => setCopiedItem(null), 1500);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <GitCompare className="w-6 h-6 text-primary" />
          <span>Historical Scan Comparison</span>
        </h1>
        <p className="mt-1 text-xs sm:text-sm text-slate-400">
          Analyze infrastructure delta between two reconnaissance points in time.
        </p>
      </div>

      {/* Scan Selector Card */}
      <div className="bg-surface border border-surface-border rounded-xl p-6 shadow-xl space-y-4">
        <h2 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
          Select Scans to Compare
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Scan A */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Scan A (Reference)</label>
            <select
              value={selectedScanA}
              onChange={(e) => setSelectedScanA(e.target.value)}
              className="w-full bg-slate-900 border border-surface-border rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">-- Choose first scan --</option>
              {scans.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.target} ({s.id.slice(0, 8)}...) • {new Date(s.started_at).toLocaleDateString()}
                </option>
              ))}
            </select>
          </div>

          {/* Scan B */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Scan B (Target Comparison)</label>
            <select
              value={selectedScanB}
              onChange={(e) => setSelectedScanB(e.target.value)}
              className="w-full bg-slate-900 border border-surface-border rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">-- Choose second scan --</option>
              {scans.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.target} ({s.id.slice(0, 8)}...) • {new Date(s.started_at).toLocaleDateString()}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            onClick={handleCompareClick}
            disabled={loading || !selectedScanA || !selectedScanB}
            className="inline-flex items-center gap-2 bg-primary hover:bg-primary-hover disabled:opacity-50 text-white text-xs font-semibold px-4 py-2 rounded-lg shadow transition-colors"
          >
            {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <GitCompare className="w-3.5 h-3.5" />}
            <span>Compare Scans</span>
          </button>
        </div>
      </div>

      {/* Error alert */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/50 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Comparison Results */}
      {comparison && (
        <div className="space-y-6">
          {/* Header Summary */}
          <div className="bg-surface border border-surface-border rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <span className="text-[10px] font-mono uppercase text-slate-400 tracking-wider">Target Domain</span>
              <h2 className="text-xl font-bold font-mono text-white mt-0.5">{comparison.target}</h2>
              <div className="mt-2 text-xs text-slate-400 flex flex-wrap items-center gap-x-4 gap-y-1">
                <span>
                  Older: <code className="text-slate-300 font-mono">{comparison.older_scan_id.slice(0, 8)}...</code> ({new Date(comparison.older_scan_date).toLocaleString()})
                </span>
                <span className="text-slate-600">→</span>
                <span>
                  Newer: <code className="text-slate-300 font-mono">{comparison.newer_scan_id.slice(0, 8)}...</code> ({new Date(comparison.newer_scan_date).toLocaleString()})
                </span>
              </div>
            </div>

            {/* Counts badges */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setActiveTab('added')}
                className={`p-3 rounded-lg border text-center transition-all ${
                  activeTab === 'added'
                    ? 'bg-emerald-950/50 border-emerald-500/50 text-emerald-300'
                    : 'bg-slate-900 border-surface-border text-slate-400 hover:text-white'
                }`}
              >
                <span className="text-[10px] uppercase font-bold block">Added</span>
                <span className="text-lg font-bold font-mono text-emerald-400">+{comparison.counts.added}</span>
              </button>

              <button
                onClick={() => setActiveTab('removed')}
                className={`p-3 rounded-lg border text-center transition-all ${
                  activeTab === 'removed'
                    ? 'bg-rose-950/50 border-rose-500/50 text-rose-300'
                    : 'bg-slate-900 border-surface-border text-slate-400 hover:text-white'
                }`}
              >
                <span className="text-[10px] uppercase font-bold block">Removed</span>
                <span className="text-lg font-bold font-mono text-rose-400">-{comparison.counts.removed}</span>
              </button>

              <button
                onClick={() => setActiveTab('common')}
                className={`p-3 rounded-lg border text-center transition-all ${
                  activeTab === 'common'
                    ? 'bg-sky-950/50 border-sky-500/50 text-sky-300'
                    : 'bg-slate-900 border-surface-border text-slate-400 hover:text-white'
                }`}
              >
                <span className="text-[10px] uppercase font-bold block">Unchanged</span>
                <span className="text-lg font-bold font-mono text-slate-200">{comparison.counts.common}</span>
              </button>
            </div>
          </div>

          {/* Diff list container */}
          <div className="bg-surface border border-surface-border rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-surface-border pb-3">
              <h3 className="text-sm font-semibold text-white capitalize flex items-center gap-2">
                {activeTab === 'added' && <Plus className="w-4 h-4 text-emerald-400" />}
                {activeTab === 'removed' && <Minus className="w-4 h-4 text-rose-400" />}
                {activeTab === 'common' && <Check className="w-4 h-4 text-slate-400" />}
                <span>
                  {activeTab === 'added' && `New Subdomains Discovered (${comparison.added.length})`}
                  {activeTab === 'removed' && `Subdomains Disappeared (${comparison.removed.length})`}
                  {activeTab === 'common' && `Unchanged Subdomains (${comparison.common.length})`}
                </span>
              </h3>
            </div>

            <div className="max-h-96 overflow-y-auto space-y-1.5 font-mono text-xs">
              {activeTab === 'added' &&
                (comparison.added.length === 0 ? (
                  <p className="text-slate-500 py-4 text-center">No new subdomains added in newer scan.</p>
                ) : (
                  comparison.added.map((name) => (
                    <div
                      key={name}
                      className="flex items-center justify-between p-2 rounded bg-emerald-950/20 border border-emerald-900/30 text-emerald-300 hover:bg-emerald-950/30 transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <Plus className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>{name}</span>
                      </span>
                      <button
                        onClick={() => handleCopy(name)}
                        className="p-1 text-slate-400 hover:text-white"
                        title="Copy domain"
                      >
                        {copiedItem === name ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  ))
                ))}

              {activeTab === 'removed' &&
                (comparison.removed.length === 0 ? (
                  <p className="text-slate-500 py-4 text-center">No subdomains removed between scans.</p>
                ) : (
                  comparison.removed.map((name) => (
                    <div
                      key={name}
                      className="flex items-center justify-between p-2 rounded bg-rose-950/20 border border-rose-900/30 text-rose-300 hover:bg-rose-950/30 transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <Minus className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                        <span>{name}</span>
                      </span>
                      <button
                        onClick={() => handleCopy(name)}
                        className="p-1 text-slate-400 hover:text-white"
                        title="Copy domain"
                      >
                        {copiedItem === name ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  ))
                ))}

              {activeTab === 'common' &&
                (comparison.common.length === 0 ? (
                  <p className="text-slate-500 py-4 text-center">No common subdomains between scans.</p>
                ) : (
                  comparison.common.map((name) => (
                    <div
                      key={name}
                      className="flex items-center justify-between p-2 rounded bg-slate-900/60 border border-surface-border text-slate-300 hover:bg-slate-900 transition-colors"
                    >
                      <span>{name}</span>
                      <button
                        onClick={() => handleCopy(name)}
                        className="p-1 text-slate-400 hover:text-white"
                        title="Copy domain"
                      >
                        {copiedItem === name ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  ))
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
