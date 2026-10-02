import React, { useState, useEffect } from 'react';
import {
  Search,
  LayoutDashboard,
  ShieldAlert,
  Clock,
  GitPullRequest,
  Fingerprint,
  Award,
  BookOpen,
  GitCompare,
  PlusCircle,
  Sun,
  Moon,
  FileDown,
  X,
  ExternalLink,
} from 'lucide-react';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTab: (tab: string) => void;
  onOpenLauncher: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onSelectTab,
  onOpenLauncher,
  theme,
  onToggleTheme,
}) => {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) {
          onClose();
        } else {
          // Trigger open via parent or event
        }
      } else if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const commands = [
    {
      id: 'dashboard',
      title: 'Executive Dashboard',
      subtitle: 'Posture overview, KPI metrics, health score and risk distributions',
      icon: LayoutDashboard,
      action: () => { onSelectTab('dashboard'); onClose(); },
      category: 'Navigation',
    },
    {
      id: 'findings',
      title: 'Findings Explorer',
      subtitle: 'Investigate discovered algorithms, code files, and risk attribution',
      icon: ShieldAlert,
      action: () => { onSelectTab('findings'); onClose(); },
      category: 'Navigation',
    },
    {
      id: 'mosca',
      title: 'Mosca Simulator (X + Y > Z)',
      subtitle: 'Simulate data shelf-life vs quantum threat horizon',
      icon: Clock,
      action: () => { onSelectTab('mosca'); onClose(); },
      category: 'Navigation',
    },
    {
      id: 'migration',
      title: 'PQC Migration Roadmap',
      subtitle: 'FIPS 203/204/205 transitions and agile migration queue',
      icon: GitPullRequest,
      action: () => { onSelectTab('migration'); onClose(); },
      category: 'Navigation',
    },
    {
      id: 'evidence',
      title: 'Evidence Ledger & Exports',
      subtitle: 'CycloneDX CBOM 1.7, SARIF 2.1.0, and Ed25519 Merkle attestation',
      icon: Fingerprint,
      action: () => { onSelectTab('evidence'); onClose(); },
      category: 'Navigation',
    },
    {
      id: 'certificates',
      title: 'X.509 Certificate Inventory',
      subtitle: 'Parsed certificates, trust roots, and expiration horizons',
      icon: Award,
      action: () => { onSelectTab('certificates'); onClose(); },
      category: 'Navigation',
    },
    {
      id: 'registry',
      title: 'Cryptographic Knowledge Base',
      subtitle: 'Authoritative catalogue of algorithms, libraries, and policy packs',
      icon: BookOpen,
      action: () => { onSelectTab('registry'); onClose(); },
      category: 'Navigation',
    },
    {
      id: 'diff',
      title: 'Scan-over-Scan Diff',
      subtitle: 'Track cryptographic drift between baseline and recent scans',
      icon: GitCompare,
      action: () => { onSelectTab('diff'); onClose(); },
      category: 'Navigation',
    },
    {
      id: 'scan-launcher',
      title: 'Launch New Cryptographic Scan',
      subtitle: 'Execute discovery scan across local filesystem or uploaded archive',
      icon: PlusCircle,
      action: () => { onOpenLauncher(); onClose(); },
      category: 'Actions',
    },
    {
      id: 'theme-toggle',
      title: `Switch to ${theme === 'dark' ? 'Soft Light' : 'Secure Dark'} Mode`,
      subtitle: `Toggle application visual theme (currently: ${theme})`,
      icon: theme === 'dark' ? Sun : Moon,
      action: () => { onToggleTheme(); onClose(); },
      category: 'Preferences',
    },
  ];

  const filtered = commands.filter((cmd) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      cmd.title.toLowerCase().includes(q) ||
      cmd.subtitle.toLowerCase().includes(q) ||
      cmd.category.toLowerCase().includes(q)
    );
  });

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-start justify-center pt-20 p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-2xl bg-white border border-slate-300 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Search Input Bar */}
        <div className="p-4 border-b border-slate-200 flex items-center gap-3 bg-slate-50">
          <Search className="w-5 h-5 text-indigo-600 shrink-0" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command, navigate tabs, or launch scan (Ctrl+K)..."
            className="w-full bg-transparent text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
          <kbd className="px-2 py-0.5 rounded text-[11px] font-mono bg-white border border-slate-300 text-slate-500">
            ESC
          </kbd>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-[60vh] overflow-y-auto p-2 divide-y divide-slate-100">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-sm font-semibold text-slate-500">
              No actions found matching "{query}".
            </div>
          ) : (
            filtered.map((cmd) => {
              const Icon = cmd.icon;
              return (
                <button
                  key={cmd.id}
                  onClick={cmd.action}
                  className="w-full p-3 rounded-xl flex items-center justify-between text-left hover:bg-slate-50 transition-colors group cursor-pointer focus:bg-slate-50 focus:outline-none"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 group-hover:border-indigo-400 transition-colors">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-slate-900 truncate group-hover:text-indigo-600 transition-colors">
                        {cmd.title}
                      </div>
                      <div className="text-xs font-normal text-slate-600 truncate">
                        {cmd.subtitle}
                      </div>
                    </div>
                  </div>
                  <span className="text-[11px] font-mono font-semibold text-slate-500 px-2 py-0.5 rounded bg-slate-100 border border-slate-200 shrink-0 ml-3">
                    {cmd.category}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500 font-mono">
          <span>ECDAT Command Palette · NTRO PS 26164</span>
          <span>Use ↑ ↓ to navigate, ↵ to select</span>
        </div>
      </div>
    </div>
  );
};
