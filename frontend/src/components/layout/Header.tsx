import React, { useState } from 'react';
import { useScan } from '../../context/ScanContext';
import { getApiKey, setApiKey, getBaseUrl, setBaseUrl } from '../../api/client';
import {
  Shield,
  Activity,
  Settings,
  RefreshCw,
  Plus,
  Search,
  Sun,
  Moon,
  HelpCircle,
  Menu,
  ChevronDown,
  Layers,
  Lock,
} from 'lucide-react';

interface HeaderProps {
  onOpenLauncher: () => void;
  onOpenCommandPalette: () => void;
  onOpenHelp: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onToggleMobileSidebar: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenLauncher,
  onOpenCommandPalette,
  onOpenHelp,
  theme,
  onToggleTheme,
  onToggleMobileSidebar,
}) => {
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
    setSaveMessage('Settings saved. Refreshing engine connection...');
    setTimeout(() => {
      window.location.reload();
    }, 600);
  };

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm">
      <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        {/* Mobile menu trigger */}
        <div className="flex items-center gap-3 md:hidden">
          <button
            onClick={onToggleMobileSidebar}
            className="p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition"
            aria-label="Toggle navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-bold text-sm text-slate-900">ECDAT</span>
        </div>

        {/* Global Search / Command Palette Bar */}
        <div className="hidden sm:flex items-center flex-1 max-w-md">
          <button
            type="button"
            onClick={onOpenCommandPalette}
            className="w-full flex items-center justify-between px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-600 hover:border-indigo-500 hover:text-slate-900 transition shadow-sm group cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <Search className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 transition-colors" />
              <span className="font-medium">Search findings, algorithms, tabs...</span>
            </div>
            <kbd className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-white border border-slate-300 text-slate-600">
              Ctrl+K
            </kbd>
          </button>
        </div>

        {/* Center: Active Scan Selector */}
        <div className="flex items-center gap-2 max-w-xs sm:max-w-sm flex-1 sm:flex-none justify-end sm:justify-start">
          <div className="relative w-full min-w-[180px]">
            <select
              value={activeScanId || ''}
              onChange={(e) => setActiveScanId(e.target.value || null)}
              disabled={loadingScans || scans.length === 0}
              aria-label="Active Scan Target"
              className="w-full pl-3 pr-8 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-indigo-600 appearance-none cursor-pointer truncate shadow-sm transition"
            >
              {scans.length === 0 ? (
                <option value="">No scans registered</option>
              ) : (
                scans.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name || s.id.substring(0, 8)} ({s.finding_count} findings · {s.status})
                  </option>
                ))
              )}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-3 top-2.5 pointer-events-none" />
          </div>

          <button
            onClick={() => refreshScans()}
            title="Refresh active scans list"
            disabled={loadingScans}
            className="p-2 rounded-xl border border-slate-300 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 shadow-sm transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingScans ? 'animate-spin text-indigo-600' : ''}`} />
          </button>
        </div>

        {/* Right Action Icons: Status, Theme Toggle, Help, Settings */}
        <div className="flex items-center gap-2">
          {/* Engine Status indicator */}
          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
            <span
              className={`w-2 h-2 rounded-full ${
                systemOnline ? 'bg-emerald-500' : 'bg-rose-500'
              }`}
            />
            <span className="text-slate-900 font-semibold">
              {systemOnline ? 'Engine Online' : 'Engine Offline'}
            </span>
            {health?.dialect && (
              <span className="text-[10px] text-slate-500 uppercase font-mono">({health.dialect})</span>
            )}
          </div>

          {/* Theme Toggle Button */}
          <button
            onClick={onToggleTheme}
            title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
            className="p-2 rounded-xl border border-slate-300 bg-white text-slate-600 hover:text-indigo-600 hover:bg-slate-50 shadow-sm transition cursor-pointer"
            aria-label="Toggle visual theme"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-indigo-600" />}
          </button>

          {/* Help Button */}
          <button
            onClick={onOpenHelp}
            title="Cryptographic Guidelines & Jargon Reference"
            className="p-2 rounded-xl border border-slate-300 bg-white text-slate-600 hover:text-indigo-600 hover:bg-slate-50 shadow-sm transition cursor-pointer"
            aria-label="Help reference"
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          {/* Settings Button */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            title="API Configuration"
            className="p-2 rounded-xl border border-slate-300 bg-white text-slate-600 hover:text-indigo-600 hover:bg-slate-50 shadow-sm transition cursor-pointer"
            aria-label="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white border border-slate-300 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-bold text-slate-900 flex items-center gap-2 text-sm">
                <Settings className="w-4 h-4 text-indigo-600" />
                ECDAT Console Configuration
              </h3>
              <button
                onClick={() => setShowSettings(false)}
                className="text-slate-500 hover:text-slate-900 text-xs font-mono p-1 rounded hover:bg-slate-100"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 mb-1 font-semibold">Backend Base URL:</label>
                <input
                  type="text"
                  value={baseUrlInput}
                  onChange={(e) => setBaseUrlInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 font-mono text-xs focus:outline-none focus:border-indigo-600"
                  placeholder="http://127.0.0.1:8000/api/v1"
                />
                <span className="text-[10px] text-slate-500 mt-1 block font-mono">
                  Default: http://127.0.0.1:8000/api/v1
                </span>
              </div>

              <div>
                <label className="block text-slate-700 mb-1 font-semibold">X-API-Key:</label>
                <input
                  type="text"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 font-mono text-xs focus:outline-none focus:border-indigo-600"
                  placeholder="dev-ecdat-key"
                />
                <span className="text-[10px] text-slate-500 mt-1 block font-mono">
                  Default: dev-ecdat-key
                </span>
              </div>

              {saveMessage && (
                <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-800 text-center font-semibold">
                  {saveMessage}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSettings(false)}
                  className="px-3.5 py-2 rounded-lg border border-slate-300 text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition shadow-sm"
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
