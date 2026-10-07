import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Radar,
  Globe,
  Layers,
  KeyRound,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { api } from '../services/api';
import { SourceInfo } from '../types';

export const NewScanPage: React.FC = () => {
  const navigate = useNavigate();

  const [target, setTarget] = useState<string>('');
  const [resolve, setResolve] = useState<boolean>(true);
  const [availableSources, setAvailableSources] = useState<SourceInfo[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [loadingSources, setLoadingSources] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSources = async () => {
      try {
        const sources = await api.getSources();
        setAvailableSources(sources);
        // Pre-select all available and enabled sources
        setSelectedSources(sources.filter((s) => s.enabled).map((s) => s.id));
      } catch (err: unknown) {
        console.error('Failed to fetch sources:', err);
      } finally {
        setLoadingSources(false);
      }
    };
    fetchSources();
  }, []);

  const handleSourceToggle = (id: string) => {
    setSelectedSources((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const handleSelectAllSources = () => {
    if (selectedSources.length === availableSources.length) {
      setSelectedSources([]);
    } else {
      setSelectedSources(availableSources.map((s) => s.id));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTarget = target.trim();
    if (!cleanTarget) {
      setError('Please provide a target domain (e.g. example.com)');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const resp = await api.createScan({
        target: cleanTarget,
        resolve,
        sources: selectedSources.length > 0 ? selectedSources : undefined,
      });

      // Navigate immediately to the scan details page
      navigate(`/scans/${resp.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to initiate reconnaissance scan');
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <Radar className="w-6 h-6 text-primary" />
          <span>Launch Passive Reconnaissance</span>
        </h1>
        <p className="mt-1 text-xs sm:text-sm text-slate-400">
          Configure passive OSINT intelligence providers and target domain parameters.
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/50 text-rose-300 text-xs flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Scan Form Card */}
      <form onSubmit={handleSubmit} className="bg-surface border border-surface-border rounded-xl p-6 space-y-6 shadow-xl">
        {/* Target Domain Input */}
        <div>
          <label htmlFor="target" className="block text-xs font-semibold text-slate-200 uppercase tracking-wider mb-2">
            Target Domain <span className="text-primary">*</span>
          </label>
          <div className="relative rounded-lg shadow-sm">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Globe className="w-4 h-4" />
            </div>
            <input
              type="text"
              id="target"
              placeholder="e.g. example.com"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              disabled={submitting}
              className="block w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-surface-border rounded-lg text-sm text-white font-mono placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
              required
            />
          </div>
          <p className="mt-1.5 text-[11px] text-slate-400">
            Provide a fully qualified apex domain or subdomain. No protocols (<code className="text-slate-300 font-mono">https://</code>) or slashes.
          </p>
        </div>

        {/* DNS Resolution Option */}
        <div className="pt-4 border-t border-surface-border">
          <div className="flex items-start justify-between">
            <div className="space-y-0.5">
              <label htmlFor="resolve" className="text-sm font-medium text-white flex items-center gap-2 cursor-pointer">
                <span>DNS Verification &amp; Resolution</span>
                <span className="text-[10px] bg-primary/10 border border-primary/20 text-primary px-1.5 py-0.2 rounded font-mono">
                  Recommended
                </span>
              </label>
              <p className="text-xs text-slate-400">
                Resolve discovered subdomains to active IP addresses and identify CNAME aliases.
              </p>
            </div>
            <input
              type="checkbox"
              id="resolve"
              checked={resolve}
              onChange={(e) => setResolve(e.target.checked)}
              disabled={submitting}
              className="w-4 h-4 rounded text-primary bg-slate-900 border-surface-border focus:ring-primary focus:ring-offset-slate-900 cursor-pointer mt-1"
            />
          </div>
        </div>

        {/* OSINT Sources Selection */}
        <div className="pt-4 border-t border-surface-border space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-xs font-semibold text-slate-200 uppercase tracking-wider block">
                Passive OSINT Providers ({selectedSources.length}/{availableSources.length})
              </label>
              <p className="text-xs text-slate-400 mt-0.5">
                Select public intelligence sources to query without active host probing.
              </p>
            </div>
            <button
              type="button"
              onClick={handleSelectAllSources}
              className="text-xs text-primary hover:text-primary-hover font-medium transition-colors"
            >
              {selectedSources.length === availableSources.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>

          {loadingSources ? (
            <div className="py-6 text-center text-xs text-slate-500">Loading provider catalog...</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {availableSources.map((source) => {
                const isSelected = selectedSources.includes(source.id);
                return (
                  <div
                    key={source.id}
                    onClick={() => handleSourceToggle(source.id)}
                    className={`p-3 rounded-lg border text-xs cursor-pointer transition-all flex items-center justify-between ${
                      isSelected
                        ? 'bg-primary/10 border-primary/40 text-white'
                        : 'bg-slate-900/60 border-surface-border text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        className="w-3.5 h-3.5 rounded text-primary bg-slate-800 border-surface-border pointer-events-none"
                      />
                      <span className="font-medium font-mono">{source.name}</span>
                    </div>

                    {source.auth_required && (
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-mono border ${
                          source.enabled
                            ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/40'
                            : 'bg-amber-950/40 text-amber-400 border-amber-800/40'
                        }`}
                        title={source.enabled ? 'API Key Configured' : 'API Key Required'}
                      >
                        <KeyRound className="w-2.5 h-2.5" />
                        <span>{source.enabled ? 'Configured' : 'Key Req'}</span>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Action Button */}
        <div className="pt-4 border-t border-surface-border flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="px-4 py-2 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !target.trim()}
            className="inline-flex items-center gap-2 bg-primary hover:bg-primary-hover disabled:opacity-50 text-white text-xs font-semibold px-5 py-2.5 rounded-lg shadow-md transition-all"
          >
            {submitting ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Launching...</span>
              </>
            ) : (
              <>
                <Radar className="w-4 h-4" />
                <span>Start Reconnaissance</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
