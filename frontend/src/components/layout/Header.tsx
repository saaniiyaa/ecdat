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
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200">
      {/* Top Bar: Brand, Health, Scan Selector, Quick Actions */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-indigo-600 flex items-center justify-center shadow-sm">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold tracking-tight text-slate-900">ECDAT</span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-700">
                  NTRO PS 26164
                </span>
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 border border-slate-200 hidden sm:inline-block">
                  v1.0.0
                </span>
              </div>
              <p className="text-[11px] text-slate-500 hidden md:block">
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
                className="w-full pl-3 pr-8 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 appearance-none cursor-pointer truncate shadow-sm transition"
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
              <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-3 top-3 pointer-events-none" />
            </div>

            <button
              onClick={() => refreshScans()}
              title="Refresh scans"
              disabled={loadingScans}
              className="p-2 rounded-xl border border-slate-300 bg-white text-slate-500 hover:text-slate-700 hover:bg-slate-50 shadow-sm transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingScans ? 'animate-spin text-indigo-600' : ''}`} />
            </button>
          </div>

          {/* Right Actions: System Health & New Scan */}
          <div className="flex items-center gap-3">
            {/* System Health */}
            <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
              <span
                className={`w-2 h-2 rounded-full ${
                  systemOnline ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50' : 'bg-rose-500'
                }`}
              />
              <span className="text-slate-600 font-medium">
                {systemOnline ? 'API Online' : 'API Offline'}
              </span>
              {health?.dialect && (
                <span className="text-[10px] text-slate-400 uppercase">({health.dialect})</span>
              )}
            </div>

            {/* Launch Scan Button */}
            <button
              onClick={onOpenLauncher}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs shadow-sm transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Launch Scan</span>
            </button>

            {/* Settings */}
            <button
              onClick={() => setShowSettings(!showSettings)}
              title="API Configuration"
              className="p-2 rounded-xl border border-slate-300 bg-white text-slate-500 hover:text-slate-700 hover:bg-slate-50 shadow-sm transition"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex space-x-1.5 overflow-x-auto py-2 scrollbar-none border-t border-slate-200/60">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-all duration-150 ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700 font-medium border border-indigo-100 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
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
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-mono font-bold text-slate-900 flex items-center gap-2 text-sm">
                <Settings className="w-4 h-4 text-indigo-600" />
                ECDAT Console Configuration
              </h3>
              <button
                onClick={() => setShowSettings(false)}
                className="text-slate-500 hover:text-slate-900 text-xs font-mono"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-4 font-mono text-xs">
              <div>
                <label className="block text-slate-600 mb-1">Backend Base URL:</label>
                <input
                  type="text"
                  value={baseUrlInput}
                  onChange={(e) => setBaseUrlInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-indigo-500"
                  placeholder="http://127.0.0.1:8000/api/v1"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">Default: http://127.0.0.1:8000/api/v1</span>
              </div>

              <div>
                <label className="block text-slate-600 mb-1">X-API-Key:</label>
                <input
                  type="text"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-indigo-500"
                  placeholder="dev-ecdat-key"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">Default: dev-ecdat-key</span>
              </div>

              {saveMessage && (
                <div className="p-2 rounded bg-emerald-50 border border-emerald-200/60 text-emerald-700 text-center">
                  {saveMessage}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSettings(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
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
