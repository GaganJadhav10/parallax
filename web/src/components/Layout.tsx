import React from 'react';
import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar';
import { Shield } from 'lucide-react';

export const Layout: React.FC = () => {
  return (
    <div className="min-h-screen bg-background flex flex-col font-sans selection:bg-primary/20 selection:text-primary">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <Outlet />
      </main>

      <footer className="border-t border-surface-border bg-surface/50 py-6 text-xs text-slate-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-slate-300">
            <Shield className="w-4 h-4 text-primary" />
            <span className="font-semibold text-white">ReconLens</span>
            <span>— Passive Reconnaissance &amp; OSINT Intelligence</span>
          </div>

          <div className="text-center sm:text-right text-[11px] text-slate-500">
            ReconLens is an extended passive reconnaissance and OSINT intelligence platform based on subscan by Mikael Nurminen.
          </div>
        </div>
      </footer>
    </div>
  );
};
