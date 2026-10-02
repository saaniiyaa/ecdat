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
    <header className="sticky top-0 z-30 bg-surface/90 backdrop-blur-md border-b border-border cipher-grid">
      <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        {/* Mobile menu trigger */}
        <div className="flex items-center gap-3 md:hidden">
          <button
            onClick={onToggleMobileSidebar}
            className="p-2 rounded-lg text-text-muted hover:text-text-main hover:bg-surface-2 transition"
            aria-label="Toggle navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-bold text-sm text-text-main">ECDAT</span>
        </div>

        {/* Global Search / Command Palette Bar */}
        <div className="hidden sm:flex items-center flex-1 max-w-md">
          <button
            type="button"
            onClick={onOpenCommandPalette}
            className="w-full flex items-center justify-between px-3.5 py-2 rounded-xl bg-surface-2 border border-border text-xs text-text-muted hover:border-accent/40 hover:text-text-main transition shadow-sm group cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <Search className="w-4 h-4 text-text-dim group-hover:text-accent transition-colors" />
              <span className="font-medium">Search findings, algorithms, tabs...</span>
            </div>
            <kbd className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-surface border border-border text-text-dim">
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
              className="w-full pl-3 pr-8 py-1.5 bg-surface-2 border border-border rounded-xl text-xs font-semibold text-text-main focus:outline-none focus:border-accent appearance-none cursor-pointer truncate shadow-sm transition"
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
            <ChevronDown className="w-3.5 h-3.5 text-text-dim absolute right-3 top-2.5 pointer-events-none" />
          </div>

          <button
            onClick={() => refreshScans()}
            title="Refresh active scans list"
            disabled={loadingScans}
            className="p-2 rounded-xl border border-border bg-surface-2 text-text-muted hover:text-text-main hover:bg-surface-3 shadow-sm transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingScans ? 'animate-spin text-accent' : ''}`} />
          </button>
        </div>

        {/* Right Action Icons: Status, Theme Toggle, Help, Settings */}
        <div className="flex items-center gap-2">
          {/* Engine Status indicator */}
          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface-2 border border-border text-xs">
            <span
              className={`w-2 h-2 rounded-full ${
                systemOnline ? 'bg-accent shadow-glow-accent' : 'bg-danger'
              }`}
            />
            <span className="text-text-main font-semibold">
              {systemOnline ? 'Engine Online' : 'Engine Offline'}
            </span>
            {health?.dialect && (
              <span className="text-[10px] text-text-dim uppercase font-mono">({health.dialect})</span>
            )}
          </div>

          {/* Theme Toggle Button */}
          <button
            onClick={onToggleTheme}
            title={theme === 'dark' ? 'Switch to Soft Light Theme' : 'Switch to Secure Dark Theme'}
            className="p-2 rounded-xl border border-border bg-surface-2 text-text-muted hover:text-accent hover:bg-surface-3 shadow-sm transition cursor-pointer"
            aria-label="Toggle visual theme"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-warning" /> : <Moon className="w-4 h-4 text-accent-2" />}
          </button>

          {/* Help Button */}
          <button
            onClick={onOpenHelp}
            title="Cryptographic Guidelines & Jargon Reference"
            className="p-2 rounded-xl border border-border bg-surface-2 text-text-muted hover:text-accent hover:bg-surface-3 shadow-sm transition cursor-pointer"
            aria-label="Help reference"
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          {/* Settings Button */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            title="API Configuration"
            className="p-2 rounded-xl border border-border bg-surface-2 text-text-muted hover:text-accent hover:bg-surface-3 shadow-sm transition cursor-pointer"
            aria-label="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-surface border border-border rounded-xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-bold text-text-main flex items-center gap-2 text-sm">
                <Settings className="w-4 h-4 text-accent" />
                ECDAT Console Configuration
              </h3>
              <button
                onClick={() => setShowSettings(false)}
                className="text-text-dim hover:text-text-main text-xs font-mono"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-4 text-xs">
              <div>
                <label className="block text-text-muted mb-1 font-semibold">Backend Base URL:</label>
                <input
                  type="text"
                  value={baseUrlInput}
                  onChange={(e) => setBaseUrlInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-border text-text-main font-mono text-xs focus:outline-none focus:border-accent"
                  placeholder="http://127.0.0.1:8000/api/v1"
                />
                <span className="text-[10px] text-text-dim mt-1 block font-mono">
                  Default: http://127.0.0.1:8000/api/v1
                </span>
              </div>

              <div>
                <label className="block text-text-muted mb-1 font-semibold">X-API-Key:</label>
                <input
                  type="text"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-border text-text-main font-mono text-xs focus:outline-none focus:border-accent"
                  placeholder="dev-ecdat-key"
                />
                <span className="text-[10px] text-text-dim mt-1 block font-mono">
                  Default: dev-ecdat-key
                </span>
              </div>

              {saveMessage && (
                <div className="p-2.5 rounded-lg bg-success-subtle border border-success-border text-success text-center font-semibold">
                  {saveMessage}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSettings(false)}
                  className="px-3.5 py-2 rounded-lg border border-border text-text-muted hover:text-text-main hover:bg-surface-2 transition font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-bg font-bold transition shadow-sm"
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
