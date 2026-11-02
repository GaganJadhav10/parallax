import React, { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Radar,
  PlusCircle,
  History,
  GitCompare,
  Database,
  Info,
  LayoutDashboard,
  FileText,
  Menu,
  X,
  Search,
  Rows3,
  Rows4,
} from 'lucide-react';
import { EngineStatus } from '../hooks/useEngineStatus';
import { Density } from '../hooks/useDensity';
import { formatDuration } from '../lib/format';

interface NavbarProps {
  engine: EngineStatus;
  density: Density;
  onToggleDensity: () => void;
  onOpenPalette: () => void;
}

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/scans/new', label: 'New Scan', icon: PlusCircle },
  { to: '/history', label: 'History', icon: History },
  { to: '/compare', label: 'Compare', icon: GitCompare },
  { to: '/reports', label: 'Reports', icon: FileText },
  { to: '/sources', label: 'Sources', icon: Database },
  { to: '/about', label: 'About', icon: Info },
];

/** Logo mark with a slow radar sweep — the one piece of pure brand motion. */
const RadarMark: React.FC = () => (
  <span className="relative w-9 h-9 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center text-primary overflow-hidden shrink-0">
    <span
      className="absolute inset-0 animate-sweep"
      style={{
        background:
          'conic-gradient(from 0deg, transparent 0deg, transparent 300deg, rgba(0,229,255,0.35) 360deg)',
      }}
      aria-hidden="true"
    />
    <Radar className="w-5 h-5 relative" aria-hidden="true" />
  </span>
);

/** Live engine heartbeat: state, version and the measured round-trip time. */
const EngineHeartbeat: React.FC<{ engine: EngineStatus }> = ({ engine }) => {
  const styles = {
    online: { wrap: 'border-signal-verified/30 bg-signal-verified/8', dot: 'bg-signal-verified', text: 'text-signal-verified' },
    checking: { wrap: 'border-signal-attention/30 bg-signal-attention/8', dot: 'bg-signal-attention animate-pulse', text: 'text-signal-attention' },
    offline: { wrap: 'border-signal-anomaly/30 bg-signal-anomaly/8', dot: 'bg-signal-anomaly', text: 'text-signal-anomaly' },
  }[engine.state];

  return (
    <button
      onClick={engine.refresh}
      title={`Engine ${engine.state}${engine.version ? ` · ${engine.version}` : ''} — click to re-probe`}
      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border transition-colors hover:border-surface-border-strong ${styles.wrap}`}
    >
      <span className="relative flex h-1.5 w-1.5 shrink-0" aria-hidden="true">
        {engine.state === 'online' && (
          <span className={`absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping ${styles.dot}`} />
        )}
        <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${styles.dot}`} />
      </span>

      <span
        className={`text-micro font-mono uppercase tracking-wider ${styles.text}`}
        role="status"
        aria-live="polite"
      >
        {engine.state === 'online' ? 'engine' : engine.state}
      </span>

      {engine.state === 'online' && engine.latencyMs !== null && (
        <span className="text-micro font-mono text-slate-500 tabular-nums hidden sm:inline">
          {formatDuration(engine.latencyMs)}
        </span>
      )}
    </button>
  );
};

export const Navbar: React.FC<NavbarProps> = ({
  engine,
  density,
  onToggleDensity,
  onOpenPalette,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  return (
    <header className="border-b border-surface-border bg-surface/85 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-[100rem] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-3">
          <NavLink to="/" className="flex items-center gap-2.5 group shrink-0">
            <RadarMark />
            <span className="leading-none hidden sm:block">
              <span className="text-lg font-bold font-display tracking-tight text-white block">
                PARA<span className="text-primary">LLAX</span>
              </span>
              <span className="block text-[10px] tracking-[0.18em] uppercase text-slate-600 font-mono mt-1">
                Signals Intelligence
              </span>
            </span>
          </NavLink>

          {/* Full nav only once every label fits without wrapping. */}
          <nav aria-label="Main" className="hidden xl:flex items-center gap-0.5">
            {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors border ${
                    isActive
                      ? 'bg-primary/12 text-primary border-primary/30'
                      : 'text-slate-400 border-transparent hover:text-white hover:bg-surface-raised'
                  }`
                }
              >
                <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            {/* Command palette trigger. Doubles as the keyboard-shortcut hint. */}
            <button
              onClick={onOpenPalette}
              className="flex items-center gap-2 pl-2.5 pr-2 py-1.5 rounded-lg bg-background/70 border border-surface-border text-slate-500 hover:border-primary/40 hover:text-slate-300 transition-colors"
              aria-label="Open command palette"
            >
              <Search className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden md:inline text-xs">Search or scan…</span>
              <kbd className="hidden md:inline text-micro font-mono border border-surface-border rounded px-1 py-0.5 text-slate-600">
                ⌘K
              </kbd>
            </button>

            <button
              onClick={onToggleDensity}
              aria-label={`Switch to ${density === 'compact' ? 'comfortable' : 'compact'} row density`}
              title={`${density === 'compact' ? 'Comfortable' : 'Compact'} rows`}
              aria-pressed={density === 'compact'}
              className="hidden sm:inline-flex p-2 rounded-lg border border-surface-border text-slate-500 hover:text-primary hover:border-primary/40 transition-colors"
            >
              {density === 'compact' ? (
                <Rows3 className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Rows4 className="w-4 h-4" aria-hidden="true" />
              )}
            </button>

            <EngineHeartbeat engine={engine} />

            <button
              onClick={() => setMenuOpen((open) => !open)}
              aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
              className="xl:hidden p-2 rounded-lg border border-surface-border text-slate-400 hover:text-white hover:bg-surface-raised transition-colors"
            >
              {menuOpen ? (
                <X className="w-5 h-5" aria-hidden="true" />
              ) : (
                <Menu className="w-5 h-5" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Drawer: every route stays reachable below the xl breakpoint. */}
      {menuOpen && (
        <>
          <div
            className="xl:hidden fixed inset-0 top-16 bg-black/60 z-30"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
          <nav
            id="mobile-nav"
            aria-label="Main"
            className="xl:hidden relative z-40 border-t border-surface-border bg-surface px-4 py-3 space-y-1 shadow-raised animate-slide-up"
          >
            {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-primary/12 text-primary'
                      : 'text-slate-300 hover:text-white hover:bg-surface-raised'
                  }`
                }
              >
                <Icon className="w-4 h-4" aria-hidden="true" />
                {label}
              </NavLink>
            ))}

            <button
              onClick={onToggleDensity}
              className="sm:hidden w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-surface-raised transition-colors"
            >
              {density === 'compact' ? (
                <Rows3 className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Rows4 className="w-4 h-4" aria-hidden="true" />
              )}
              {density === 'compact' ? 'Comfortable rows' : 'Compact rows'}
            </button>
          </nav>
        </>
      )}
    </header>
  );
};
