import React, { useState } from 'react';
import { useScan } from '../../context/ScanContext';
import { getApiKey, setApiKey, getBaseUrl, setBaseUrl } from '../../api/client';
import {
  Shield,
  Activity,
  Layers,
  Settings,
  RefreshCw,
  Plus,
  Server,
  AlertTriangle,
  ChevronDown,
} from 'lucide-react';

interface HeaderProps {
  onOpenLauncher: () => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenLauncher, activeTab, setActiveTab }) => {
  const {
    health,
    systemOnline,
    scans,
    activeScanId,
    activeScan,
    setActiveScanId,
    refreshScans,
    loadingScans,
  } = useScan();

  const [showSettings, setShowSettings] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState(getApiKey());
  const [baseUrlInput, setBaseUrlInput] = useState(getBaseUrl());
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    setApiKey(apiKeyInput.trim());
    setBaseUrl(baseUrlInput.trim());
    setSaveMessage('Settings saved. Refreshing...');
    setTimeout(() => {
      window.location.reload();
    }, 600);
  };

  const navItems = [
    { id: 'dashboard', label: 'Executive Dashboard' },
    { id: 'findings', label: 'Findings Explorer' },
    { id: 'mosca', label: 'Mosca Simulator' },
    { id: 'migration', label: 'Migration Plan' },
    { id: 'evidence', label: 'Evidence & Exports' },
    { id: 'certificates', label: 'Certificates' },
    { id: 'registry', label: 'Registry Catalogue' },
    { id: 'diff', label: 'Scan Diff' },
  ];

  return (
    <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-md border-b border-slate-800/80">
      {/* Top Bar: Brand, Health, Scan Selector, Quick Actions */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shadow-md shadow-sky-500/10">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold tracking-tight text-white">ECDAT</span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/25 text-emerald-400">
                  NTRO PS 26164
                </span>
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-800/70 text-slate-400 border border-slate-700/50 hidden sm:inline-block">
                  v1.0.0
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden md:block">
                Enterprise Cryptographic Discovery & Quantum Risk Engine
              </p>
            </div>
          </div>

          {/* Active Scan Selector */}
          <div className="flex items-center gap-2 flex-1 max-w-md justify-center">
            <div className="relative w-full max-w-xs">
              <select
                value={activeScanId || ''}
                onChange={(e) => setActiveScanId(e.target.value || null)}
                disabled={loadingScans || scans.length === 0}
                className="w-full pl-3 pr-8 py-2 bg-slate-800/60 border border-slate-700/70 rounded-xl text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 appearance-none cursor-pointer truncate shadow-sm transition"
              >
                {scans.length === 0 ? (
                  <option value="">No scans available</option>
                ) : (
                  scans.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name || s.id.substring(0, 8)} ({s.finding_count} findings · {s.status})
                    </option>
                  ))
                )}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-3 pointer-events-none" />
            </div>

            <button
              onClick={() => refreshScans()}
              title="Refresh scans"
              disabled={loadingScans}
              className="p-2 rounded-xl border border-slate-700/70 bg-slate-800/60 text-slate-300 hover:text-white hover:bg-slate-700/60 shadow-sm transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingScans ? 'animate-spin text-sky-400' : ''}`} />
            </button>
          </div>

          {/* Right Actions: System Health & New Scan */}
          <div className="flex items-center gap-3">
            {/* System Health */}
            <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/50 border border-slate-700/60 text-xs">
              <span
                className={`w-2 h-2 rounded-full ${
                  systemOnline ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50' : 'bg-rose-500'
                }`}
              />
              <span className="text-slate-300 font-medium">
                {systemOnline ? 'API Online' : 'API Offline'}
              </span>
              {health?.dialect && (
                <span className="text-[10px] text-slate-500 uppercase">({health.dialect})</span>
              )}
            </div>

            {/* Launch Scan Button */}
            <button
              onClick={onOpenLauncher}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-medium text-xs shadow-md shadow-sky-500/20 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Launch Scan</span>
            </button>

            {/* Settings */}
            <button
              onClick={() => setShowSettings(!showSettings)}
              title="API Configuration"
              className="p-2 rounded-xl border border-slate-700/70 bg-slate-800/60 text-slate-300 hover:text-white hover:bg-slate-700/60 shadow-sm transition"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex space-x-1.5 overflow-x-auto py-2 scrollbar-none border-t border-slate-800/60">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-all duration-150 ${
                  isActive
                    ? 'bg-slate-800 text-sky-300 border border-slate-700/80 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-mono font-bold text-slate-100 flex items-center gap-2 text-sm">
                <Settings className="w-4 h-4 text-cyan-400" />
                ECDAT Console Configuration
              </h3>
              <button
                onClick={() => setShowSettings(false)}
                className="text-slate-400 hover:text-white text-xs font-mono"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-4 font-mono text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Backend Base URL:</label>
                <input
                  type="text"
                  value={baseUrlInput}
                  onChange={(e) => setBaseUrlInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-cyan-500"
                  placeholder="http://127.0.0.1:8000/api/v1"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">Default: http://127.0.0.1:8000/api/v1</span>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">X-API-Key:</label>
                <input
                  type="text"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-cyan-500"
                  placeholder="dev-ecdat-key"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">Default: dev-ecdat-key</span>
              </div>

              {saveMessage && (
                <div className="p-2 rounded bg-emerald-950/60 border border-emerald-500/40 text-emerald-400 text-center">
                  {saveMessage}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSettings(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold"
                >
                  Save & Reload
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </header>
  );
};
