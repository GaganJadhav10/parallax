import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Radar,
  LayoutDashboard,
  History,
  GitCompare,
  FileText,
  Database,
  Info,
  CornerDownLeft,
  ArrowUp,
  ArrowDown,
  Crosshair,
} from 'lucide-react';
import { api } from '../services/api';
import { ScanRecord } from '../types';
import { StatusBadge } from './StatusBadge';
import { isValidTarget, normalizeTarget } from '../lib/domain';
import { formatNumber, formatRelativeTime } from '../lib/format';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Item {
  id: string;
  group: 'Launch' | 'Targets' | 'Navigate';
  label: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  trailing?: React.ReactNode;
  run: () => void;
}

const ROUTES = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/scans/new', label: 'New Scan', icon: Radar },
  { path: '/history', label: 'Scan History', icon: History },
  { path: '/compare', label: 'Compare Scans', icon: GitCompare },
  { path: '/reports', label: 'Reports', icon: FileText },
  { path: '/sources', label: 'OSINT Sources', icon: Database },
  { path: '/about', label: 'About & API', icon: Info },
];

/**
 * Ctrl/Cmd+K entry point. Searches past targets, jumps between routes, and
 * launches a scan straight from the query when it parses as a domain.
 */
export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [launching, setLaunching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setActiveIndex(0);
    inputRef.current?.focus();

    api
      .getScans({ limit: 100 })
      .then(setScans)
      .catch(() => setScans([]));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  const launchScan = useCallback(
    async (rawTarget: string) => {
      const target = normalizeTarget(rawTarget);
      setLaunching(true);
      try {
        const response = await api.createScan({ target, resolve: true });
        onClose();
        navigate(`/scans/${response.id}`);
      } catch {
        // Fall back to the full form, where the error is surfaced properly.
        onClose();
        navigate(`/scans/new?target=${encodeURIComponent(target)}`);
      } finally {
        setLaunching(false);
      }
    },
    [navigate, onClose]
  );

  const items = useMemo<Item[]>(() => {
    const needle = query.trim().toLowerCase();
    const result: Item[] = [];

    if (needle && isValidTarget(needle)) {
      const target = normalizeTarget(needle);
      result.push({
        id: `launch-${target}`,
        group: 'Launch',
        label: `Start reconnaissance on ${target}`,
        hint: 'Runs every enabled provider with DNS verification',
        icon: Crosshair,
        run: () => void launchScan(target),
      });
    }

    const matchedScans = scans
      .filter((scan) => !needle || scan.target.toLowerCase().includes(needle))
      .slice(0, 6);

    for (const scan of matchedScans) {
      result.push({
        id: `scan-${scan.id}`,
        group: 'Targets',
        label: scan.target,
        hint: `${formatNumber(scan.final_subdomains)} assets · ${formatRelativeTime(scan.started_at)}`,
        icon: Radar,
        trailing: <StatusBadge status={scan.status} size="sm" />,
        run: () => {
          onClose();
          navigate(`/scans/${scan.id}`);
        },
      });
    }

    for (const route of ROUTES) {
      if (needle && !route.label.toLowerCase().includes(needle)) continue;
      result.push({
        id: `route-${route.path}`,
        group: 'Navigate',
        label: route.label,
        icon: route.icon,
        run: () => {
          onClose();
          navigate(route.path);
        },
      });
    }

    return result;
  }, [query, scans, navigate, onClose, launchScan]);

  // Keep the highlight in range as the result set shrinks.
  useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(0, items.length - 1)));
  }, [items.length]);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (!isOpen) return null;

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      onClose();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % Math.max(1, items.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => (current - 1 + items.length) % Math.max(1, items.length));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      items[activeIndex]?.run();
    }
  };

  let lastGroup = '';

  return (
    <div
      className="fixed inset-0 z-[65] bg-black/80 backdrop-blur-sm animate-fade-in px-4 pt-[12vh]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="card reticle bg-surface-raised max-w-2xl mx-auto overflow-hidden shadow-raised animate-slide-up"
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-3 px-4 border-b border-surface-border">
          <Search className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search targets, jump to a page, or type a domain to scan…"
            aria-label="Command palette search"
            spellCheck={false}
            autoComplete="off"
            className="flex-1 bg-transparent py-4 text-sm text-white placeholder-slate-600 focus:outline-none font-mono"
          />
          {launching && (
            <span className="text-micro font-mono text-primary animate-pulse">launching…</span>
          )}
          <kbd className="hidden sm:block text-micro font-mono text-slate-600 border border-surface-border rounded px-1.5 py-0.5">
            ESC
          </kbd>
        </div>

        <ul ref={listRef} className="max-h-[22rem] overflow-y-auto py-2" role="listbox">
          {items.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-slate-500">
              No matches. Type a full domain such as{' '}
              <code className="font-mono text-slate-400">example.com</code> to launch a scan.
            </li>
          ) : (
            items.map((item, index) => {
              const showGroup = item.group !== lastGroup;
              lastGroup = item.group;
              const isActive = index === activeIndex;
              const Icon = item.icon;

              return (
                <React.Fragment key={item.id}>
                  {showGroup && (
                    <li className="eyebrow px-4 pt-3 pb-1.5" aria-hidden="true">
                      {item.group}
                    </li>
                  )}
                  <li role="option" aria-selected={isActive} data-index={index}>
                    <button
                      onClick={item.run}
                      onMouseEnter={() => setActiveIndex(index)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        isActive ? 'bg-primary/10' : 'hover:bg-surface-card/60'
                      }`}
                    >
                      <Icon
                        className={`w-4 h-4 shrink-0 ${isActive ? 'text-primary' : 'text-slate-600'}`}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block text-sm truncate ${
                            isActive ? 'text-white' : 'text-slate-300'
                          } ${item.group === 'Targets' ? 'font-mono' : ''}`}
                        >
                          {item.label}
                        </span>
                        {item.hint && (
                          <span className="block text-micro font-mono text-slate-600 truncate">
                            {item.hint}
                          </span>
                        )}
                      </span>
                      {item.trailing}
                      {isActive && (
                        <CornerDownLeft className="w-3.5 h-3.5 text-primary shrink-0" aria-hidden="true" />
                      )}
                    </button>
                  </li>
                </React.Fragment>
              );
            })
          )}
        </ul>

        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-surface-border bg-background/40 text-micro font-mono text-slate-600">
          <span className="flex items-center gap-1">
            <ArrowUp className="w-3 h-3" aria-hidden="true" />
            <ArrowDown className="w-3 h-3" aria-hidden="true" />
            navigate
          </span>
          <span className="flex items-center gap-1">
            <CornerDownLeft className="w-3 h-3" aria-hidden="true" />
            select
          </span>
          <span className="ml-auto hidden sm:inline">
            {items.length} {items.length === 1 ? 'result' : 'results'}
          </span>
        </div>
      </div>
    </div>
  );
};
