import React, { useEffect, useState } from 'react';
import { Outlet, Link } from 'react-router-dom';
import { Radar, Github } from 'lucide-react';
import { Navbar } from './Navbar';
import { CommandPalette } from './CommandPalette';
import { useEngineStatus } from '../hooks/useEngineStatus';
import { useDensity } from '../hooks/useDensity';
import { api } from '../services/api';
import { formatTime } from '../lib/format';

export const Layout: React.FC = () => {
  const engine = useEngineStatus();
  const { density, toggle } = useDensity();
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Global shortcut: Ctrl/Cmd+K anywhere, and "/" when not already typing.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k';
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable;

      if (isShortcut || (event.key === '/' && !isTyping)) {
        event.preventDefault();
        setPaletteOpen(true);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans selection:bg-primary/30 selection:text-white">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-[80] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-primary focus:text-background focus:text-sm focus:font-semibold"
      >
        Skip to main content
      </a>

      <Navbar
        engine={engine}
        density={density}
        onToggleDensity={toggle}
        onOpenPalette={() => setPaletteOpen(true)}
      />

      <main
        id="main-content"
        tabIndex={-1}
        className="flex-1 w-full max-w-[100rem] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 focus:outline-none"
      >
        <Outlet />
      </main>

      <footer className="border-t border-surface-border bg-surface/40 mt-10">
        <div className="max-w-[100rem] mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm">
            <Radar className="w-4 h-4 text-primary" aria-hidden="true" />
            <span className="font-semibold font-display text-white">Parallax</span>
            <span className="text-slate-600 hidden sm:inline">
              — Open-Source Signals Intelligence
            </span>
          </div>

          <div className="flex items-center gap-4 text-micro font-mono text-slate-600">
            <span className="hidden md:inline" title="API base URL">
              {api.getBaseURL()}
            </span>
            {engine.checkedAt && (
              <span className="hidden lg:inline">probe {formatTime(engine.checkedAt)}</span>
            )}
            <Link to="/about" className="hover:text-slate-300 transition-colors">
              attribution
            </Link>
            <a
              href="https://github.com/lumiaurora/subscan"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 hover:text-slate-300 transition-colors"
            >
              <Github className="w-3.5 h-3.5" aria-hidden="true" />
              subscan
            </a>
          </div>
        </div>
      </footer>

      <CommandPalette isOpen={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
};
