import React, { useEffect, useState } from 'react';
import {
  Database,
  ShieldCheck,
  KeyRound,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Info,
} from 'lucide-react';
import { api } from '../services/api';
import { SourceInfo } from '../types';

export const SourcesPage: React.FC = () => {
  const [sources, setSources] = useState<SourceInfo[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadSources = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getSources();
      setSources(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch OSINT provider catalog');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSources();
  }, []);

  // Descriptions for known built-in passive OSINT providers
  const descriptions: Record<string, { desc: string; category: string }> = {
    crtsh: { desc: 'Public Certificate Transparency (CT) log query engine maintained by Sectigo.', category: 'Certificate Transparency' },
    certspotter: { desc: 'Real-time Certificate Transparency monitoring logs provided by SSLMate.', category: 'Certificate Transparency' },
    hackertarget: { desc: 'HackerTarget open internet attack surface and DNS host intelligence.', category: 'DNS / Search' },
    rapiddns: { desc: 'RapidDNS domain, sub-domain, and DNS query platform.', category: 'DNS Database' },
    anubis: { desc: 'Subdomain collector intelligence aggregator analyzing passive signals.', category: 'Aggregator' },
    urlscan: { desc: 'URLScan.io public website submission and crawl telemetry database.', category: 'Web Telemetry' },
    bufferover: { desc: 'BufferOver passive DNS index of publicly recorded domain names.', category: 'Passive DNS' },
    otx: { desc: 'AlienVault Open Threat Exchange crowdsourced asset threat indicator database.', category: 'Threat Intelligence' },
    virustotal: { desc: 'VirusTotal historical DNS resolution and malware analysis telemetry.', category: 'Threat Intelligence' },
    shodan: { desc: 'Shodan internet-connected device, IP, and hostname crawler index.', category: 'Internet Census' },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Database className="w-6 h-6 text-primary" />
            <span>Passive OSINT Intelligence Providers</span>
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-400">
            Non-intrusive public intelligence catalogs queried concurrently during reconnaissance.
          </p>
        </div>

        <button
          onClick={loadSources}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 border border-surface-border rounded-lg text-xs text-slate-300 hover:text-white transition-colors self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Providers</span>
        </button>
      </div>

      {/* Passive Disclaimer Banner */}
      <div className="p-4 rounded-xl bg-surface border border-surface-border flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-300 space-y-1">
          <p className="font-semibold text-white">Passive Reconnaissance Philosophy</p>
          <p className="text-slate-400 leading-relaxed">
            ReconLens never performs active port scanning, brute force wordlist enumeration, or exploitation against target infrastructure. All queries are conducted exclusively against public third-party Certificate Transparency logs, historical passive DNS repositories, and intelligence search engines.
          </p>
        </div>
      </div>

      {/* Error alert */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/50 text-rose-300 text-xs flex items-center justify-between">
          <span>{error}</span>
          <button onClick={loadSources} className="underline hover:text-white">Retry</button>
        </div>
      )}

      {/* Sources Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {loading ? (
          <div className="col-span-2 py-12 text-center text-xs text-slate-400">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
            Loading provider telemetry...
          </div>
        ) : (
          sources.map((src) => {
            const meta = descriptions[src.id] || { desc: 'Passive OSINT intelligence source.', category: 'Public Intel' };
            return (
              <div
                key={src.id}
                className="bg-surface border border-surface-border rounded-xl p-5 flex flex-col justify-between space-y-4 hover:border-slate-700 transition-colors shadow-sm"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-base font-bold text-white">{src.name}</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-surface-border text-slate-400">
                        {src.id}
                      </span>
                    </div>

                    {src.auth_required ? (
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-full border ${
                          src.enabled
                            ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/40'
                            : 'bg-amber-950/40 text-amber-400 border-amber-800/40'
                        }`}
                      >
                        <KeyRound className="w-3 h-3" />
                        <span>{src.enabled ? 'API Key Configured' : 'API Key Required'}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-950/40 text-emerald-400 border border-emerald-800/40">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Free / No Auth</span>
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-400 mt-2.5 leading-relaxed">{meta.desc}</p>
                </div>

                <div className="pt-3 border-t border-surface-border flex items-center justify-between text-[11px] text-slate-500 font-mono">
                  <span>Category: {meta.category}</span>
                  <span className="text-slate-400">Mode: Passive</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
