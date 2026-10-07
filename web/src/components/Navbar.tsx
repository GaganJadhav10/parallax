import React, { useEffect, useState, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Radar,
  PlusCircle,
  History,
  GitCompare,
  Database,
  Info,
  RefreshCw,
  LayoutDashboard,
} from 'lucide-react';
import { api } from '../services/api';

export const Navbar: React.FC = () => {
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'checking'>('checking');
  const [version, setVersion] = useState<string>('');

  const checkConnection = useCallback(async () => {
    setConnectionStatus('checking');
    try {
      const health = await api.getHealth();
      if (health.status === 'ok') {
        setConnectionStatus('connected');
        setVersion(health.version);
      } else {
        setConnectionStatus('disconnected');
      }
    } catch {
      setConnectionStatus('disconnected');
    }
  }, []);

  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  const navItems = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/scans/new', label: 'New Scan', icon: PlusCircle },
    { to: '/history', label: 'History', icon: History },
    { to: '/compare', label: 'Compare', icon: GitCompare },
    { to: '/sources', label: 'OSINT Sources', icon: Database },
    { to: '/about', label: 'About & API', icon: Info },
  ];

  return (
    <header className="border-b border-surface-border bg-surface/90 backdrop-blur sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <NavLink to="/" className="flex items-center gap-2.5 group">
              <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center text-primary group-hover:border-primary transition-colors">
                <Radar className="w-5 h-5 text-primary" />
              </div>
              <div>
                <span className="text-lg font-bold tracking-tight text-white flex items-center gap-1">
                  RECON<span className="text-primary font-extrabold">LENS</span>
                </span>
                <span className="block text-[10px] tracking-wider uppercase text-slate-400 font-medium -mt-0.5">
                  OSINT Intelligence
                </span>
              </div>
            </NavLink>
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center space-x-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                      isActive
                        ? 'bg-primary/15 text-primary border border-primary/30'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/60 border border-transparent'
                    }`
                  }
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>

          {/* Connection Status & Actions */}
          <div className="flex items-center gap-3">
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono border ${
                connectionStatus === 'connected'
                  ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/40'
                  : connectionStatus === 'checking'
                  ? 'bg-amber-950/40 text-amber-400 border-amber-800/40'
                  : 'bg-rose-950/40 text-rose-400 border-rose-800/40'
              }`}
              title={`API Backend: ${api.getBaseURL()} (${version || 'v?'})`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  connectionStatus === 'connected'
                    ? 'bg-emerald-400'
                    : connectionStatus === 'checking'
                    ? 'bg-amber-400 animate-pulse'
                    : 'bg-rose-400'
                }`}
              />
              <span className="capitalize">{connectionStatus}</span>
              <button
                onClick={checkConnection}
                className="hover:text-white p-0.5 ml-0.5 transition-colors"
                title="Retry API Connection"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>

            <NavLink
              to="/scans/new"
              className="hidden sm:inline-flex items-center gap-1.5 bg-primary hover:bg-primary-hover text-white text-xs font-semibold px-3 py-1.5 rounded-md shadow-sm transition-colors"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Launch Scan</span>
            </NavLink>
          </div>
        </div>
      </div>
    </header>
  );
};
