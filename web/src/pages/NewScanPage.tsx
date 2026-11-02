import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  Radar,
  KeyRound,
  ShieldCheck,
  Info,
  Zap,
  Layers,
  EyeOff,
  CheckCircle2,
  GitCompare,
  History,
} from 'lucide-react';
import { api } from '../services/api';
import { ScanRecord, SourceInfo } from '../types';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { Skeleton } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';
import { apexOf, isSubdomain, isValidTarget, normalizeTarget, tldOf } from '../lib/domain';
import { CATEGORY_CHIP, SCAN_PROFILES, ScanProfile, metaFor } from '../lib/sources';
import { formatNumber, formatRelativeTime } from '../lib/format';

const PROFILE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  fast: Zap,
  full: Layers,
  stealth: EyeOff,
};

/** Live read-out of what the typed target parses to and whether it is known. */
const TargetInspector: React.FC<{ target: string; priorScans: ScanRecord[] }> = ({
  target,
  priorScans,
}) => {
  const normalized = normalizeTarget(target);
  const valid = isValidTarget(target);

  if (!normalized) return null;

  if (!valid) {
    return (
      <Alert tone="warning">
        <span className="font-mono text-slate-300">{normalized}</span> is not a valid hostname. Use a
        full domain such as <code className="font-mono text-slate-300">example.com</code>.
      </Alert>
    );
  }

  const latest = priorScans[0];

  return (
    <div className="rounded-lg border border-surface-border bg-background/50 p-3.5 space-y-3 animate-fade-in">
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="min-w-0">
          <dt className="eyebrow">Apex</dt>
          <dd className="font-mono text-sm text-white mt-1 truncate">{apexOf(normalized)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="eyebrow">TLD</dt>
          <dd className="font-mono text-sm text-slate-300 mt-1">.{tldOf(normalized)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="eyebrow">Scope</dt>
          <dd className="font-mono text-sm text-slate-300 mt-1">
            {isSubdomain(normalized) ? 'subdomain' : 'apex'}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="eyebrow">Syntax</dt>
          <dd className="mt-1">
            <span className="chip-verified">
              <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
              valid
            </span>
          </dd>
        </div>
      </dl>

      {latest && (
        <div className="pt-3 border-t border-surface-border flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
          <span className="flex items-center gap-1.5 text-slate-400">
            <History className="w-3.5 h-3.5 text-slate-600" aria-hidden="true" />
            Scanned {formatRelativeTime(latest.started_at)} —{' '}
            <span className="font-mono text-slate-300">
              {formatNumber(latest.final_subdomains)} assets
            </span>
          </span>

          <Link
            to={`/scans/${latest.id}`}
            className="text-primary hover:text-primary-light font-medium transition-colors"
          >
            View last run
          </Link>

          {priorScans.length > 1 && (
            <Link
              to={`/compare?a=${priorScans[1].id}&b=${latest.id}`}
              className="flex items-center gap-1 text-primary hover:text-primary-light font-medium transition-colors"
            >
              <GitCompare className="w-3.5 h-3.5" aria-hidden="true" />
              View delta
            </Link>
          )}
        </div>
      )}
    </div>
  );
};

export const NewScanPage: React.FC = () => {
  const navigate = useNavigate();
  const { notify } = useToast();
  const [searchParams] = useSearchParams();

  const [target, setTarget] = useState(searchParams.get('target') ?? '');
  const [resolve, setResolve] = useState(true);
  const [availableSources, setAvailableSources] = useState<SourceInfo[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [activeProfile, setActiveProfile] = useState<string | null>('full');
  const [history, setHistory] = useState<ScanRecord[]>([]);
  const [loadingSources, setLoadingSources] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [sources, scans] = await Promise.all([
          api.getSources(),
          api.getScans({ limit: 200 }).catch(() => [] as ScanRecord[]),
        ]);
        setAvailableSources(sources);
        setSelectedSources(sources.filter((source) => source.enabled).map((source) => source.id));
        setHistory(scans);
      } catch (err: unknown) {
        setError(
          err instanceof Error
            ? `Could not load the provider catalog: ${err.message}`
            : 'Could not load the provider catalog'
        );
      } finally {
        setLoadingSources(false);
      }
    };
    load();
  }, []);

  const normalized = useMemo(() => normalizeTarget(target), [target]);
  const valid = isValidTarget(target);

  const priorScans = useMemo(
    () =>
      normalized
        ? history
            .filter((scan) => scan.target === normalized && scan.status === 'completed')
            .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
        : [],
    [history, normalized]
  );

  const selectable = availableSources.filter((source) => source.enabled);

  const applyProfile = (profile: ScanProfile) => {
    const ids =
      profile.sourceIds.length > 0
        ? profile.sourceIds.filter((id) => selectable.some((source) => source.id === id))
        : selectable.map((source) => source.id);

    setSelectedSources(ids);
    setResolve(profile.resolve);
    setActiveProfile(profile.id);
  };

  const toggleSource = (id: string) => {
    setActiveProfile(null);
    setSelectedSources((previous) =>
      previous.includes(id) ? previous.filter((value) => value !== id) : [...previous, id]
    );
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!valid) {
      setError('Enter a valid target domain, for example example.com');
      return;
    }
    if (selectedSources.length === 0) {
      setError('Select at least one OSINT provider to query.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await api.createScan({
        target: normalized,
        resolve,
        sources: selectedSources,
      });
      notify(`Reconnaissance started for ${normalized}`, 'success');
      navigate(`/scans/${response.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to initiate reconnaissance scan');
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <PageHeader
        eyebrow="Target acquisition"
        title="Launch Reconnaissance"
        description="Choose a profile or hand-pick providers, then commit the scan."
        icon={Radar}
      />

      {error && <Alert tone="error">{error}</Alert>}

      <form onSubmit={handleSubmit} className="card p-5 sm:p-6 space-y-6">
        <div className="space-y-3">
          <label htmlFor="target" className="block text-sm font-semibold text-slate-200">
            Target domain <span className="text-primary">*</span>
          </label>

          <div className="relative">
            <span
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-primary/60 font-mono text-sm select-none"
              aria-hidden="true"
            >
              &gt;
            </span>
            <input
              type="text"
              id="target"
              name="target"
              inputMode="url"
              autoComplete="off"
              autoFocus
              spellCheck={false}
              placeholder="example.com"
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              disabled={submitting}
              aria-invalid={Boolean(target) && !valid}
              className="input-mono pl-8 text-base"
              required
            />
          </div>

          <TargetInspector target={target} priorScans={priorScans} />
        </div>

        <fieldset className="pt-5 border-t border-surface-border">
          <legend className="text-sm font-semibold text-slate-200 mb-1">Scan profile</legend>
          <p className="text-xs text-slate-500 mb-3">
            A starting point — every provider stays individually toggleable below.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {SCAN_PROFILES.map((profile) => {
              const Icon = PROFILE_ICONS[profile.id] ?? Layers;
              const isActive = activeProfile === profile.id;
              return (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => applyProfile(profile)}
                  aria-pressed={isActive}
                  className={`text-left p-3.5 rounded-lg border transition-colors ${
                    isActive
                      ? 'bg-primary/10 border-primary/50 shadow-glow-primary'
                      : 'bg-background/50 border-surface-border hover:border-surface-border-strong'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Icon
                      className={`w-4 h-4 shrink-0 ${isActive ? 'text-primary' : 'text-slate-500'}`}
                      aria-hidden="true"
                    />
                    <span
                      className={`text-sm font-semibold ${isActive ? 'text-white' : 'text-slate-300'}`}
                    >
                      {profile.name}
                    </span>
                  </span>
                  <span className="block mt-1.5 text-micro font-mono text-slate-500 leading-relaxed">
                    {profile.tagline}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="pt-5 border-t border-surface-border">
          <label htmlFor="resolve" className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              id="resolve"
              checked={resolve}
              onChange={(event) => {
                setResolve(event.target.checked);
                setActiveProfile(null);
              }}
              disabled={submitting}
              className="w-4 h-4 mt-0.5 rounded border-surface-border bg-background text-primary focus:ring-primary focus:ring-offset-background cursor-pointer shrink-0"
            />
            <span className="min-w-0">
              <span className="text-sm font-medium text-white">DNS verification &amp; resolution</span>
              <span className="block text-xs text-slate-500 mt-1 leading-relaxed">
                Resolves hostnames to A/AAAA records, follows CNAME aliases and filters wildcard DNS
                noise. This is the only step that sends packets from your host to a resolver.
              </span>
            </span>
          </label>
        </div>

        <fieldset className="pt-5 border-t border-surface-border">
          <div className="flex items-end justify-between gap-3 mb-3">
            <div>
              <legend className="text-sm font-semibold text-slate-200">
                Provider matrix
                <span className="ml-2 font-mono text-xs text-slate-500">
                  {selectedSources.length}/{selectable.length} engaged
                </span>
              </legend>
              <p className="text-xs text-slate-500 mt-1">
                Queried concurrently. A provider failure never aborts the scan.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setActiveProfile(null);
                setSelectedSources(
                  selectedSources.length === selectable.length
                    ? []
                    : selectable.map((source) => source.id)
                );
              }}
              className="text-xs text-primary hover:text-primary-light font-medium transition-colors shrink-0"
            >
              {selectedSources.length === selectable.length ? 'Disengage all' : 'Engage all'}
            </button>
          </div>

          {loadingSources ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {Array.from({ length: 8 }).map((_, index) => (
                <Skeleton key={index} className="h-[74px] w-full rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {availableSources.map((source) => {
                const isSelected = selectedSources.includes(source.id);
                const isLocked = !source.enabled;
                const meta = metaFor(source.id);

                return (
                  <label
                    key={source.id}
                    className={`flex items-start gap-2.5 p-3 rounded-lg border transition-colors ${
                      isLocked
                        ? 'bg-background/40 border-surface-border opacity-55 cursor-not-allowed'
                        : isSelected
                        ? 'bg-primary/8 border-primary/40 cursor-pointer'
                        : 'bg-background/50 border-surface-border hover:border-surface-border-strong cursor-pointer'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSource(source.id)}
                      disabled={isLocked || submitting}
                      className="w-4 h-4 mt-0.5 rounded border-surface-border bg-background text-primary focus:ring-primary focus:ring-offset-background shrink-0"
                    />

                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span
                          className={`font-mono text-sm truncate ${
                            isSelected ? 'text-white' : 'text-slate-300'
                          }`}
                        >
                          {source.name}
                        </span>
                        {source.auth_required && (
                          <span className={isLocked ? 'chip-attention' : 'chip-verified'}>
                            <KeyRound className="w-3 h-3" aria-hidden="true" />
                            {isLocked ? 'key req' : 'keyed'}
                          </span>
                        )}
                      </span>

                      <span className="flex items-center gap-2 mt-1.5">
                        <span className={CATEGORY_CHIP[meta.category]}>{meta.category}</span>
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </fieldset>

        <Alert tone="info">
          <span className="flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-signal-verified shrink-0 mt-0.5" aria-hidden="true" />
            <span className="text-xs leading-relaxed">
              Strictly passive: no port scanning, brute force or probing traffic reaches the target.
              Only public third-party datasets are queried.
            </span>
          </span>
        </Alert>

        <div className="pt-5 border-t border-surface-border flex items-center justify-between gap-3 flex-wrap">
          <p className="text-micro font-mono text-slate-600">
            {selectedSources.length} provider{selectedSources.length === 1 ? '' : 's'} ·{' '}
            {resolve ? 'DNS on' : 'DNS off'}
          </p>

          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={() => navigate('/')} disabled={submitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              icon={Radar}
              loading={submitting}
              disabled={!valid || selectedSources.length === 0}
            >
              {submitting ? 'Launching…' : 'Commit scan'}
            </Button>
          </div>
        </div>
      </form>

      <p className="flex items-start gap-2 text-xs text-slate-600 leading-relaxed">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
        Only scan domains you own or are authorized to assess. You remain responsible for complying
        with applicable laws and third-party terms of service.
      </p>
    </div>
  );
};
