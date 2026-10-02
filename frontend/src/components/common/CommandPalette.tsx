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
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-20 p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-2xl bg-surface border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Search Input Bar */}
        <div className="p-4 border-b border-border flex items-center gap-3 bg-surface-2/40">
          <Search className="w-5 h-5 text-accent shrink-0" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command, navigate tabs, or launch scan (Ctrl+K)..."
            className="w-full bg-transparent text-sm font-semibold text-text-main placeholder:text-text-dim focus:outline-none"
          />
          <kbd className="px-2 py-0.5 rounded text-[11px] font-mono bg-surface border border-border text-text-dim">
            ESC
          </kbd>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-text-dim hover:text-text-main hover:bg-surface transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-[60vh] overflow-y-auto p-2 divide-y divide-border/40">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-sm font-semibold text-text-muted">
              No actions found matching "{query}".
            </div>
          ) : (
            filtered.map((cmd) => {
              const Icon = cmd.icon;
              return (
                <button
                  key={cmd.id}
                  onClick={cmd.action}
                  className="w-full p-3 rounded-lg flex items-center justify-between text-left hover:bg-surface-2/80 transition-colors group cursor-pointer focus:bg-surface-2 focus:outline-none"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-surface-3 border border-border/80 flex items-center justify-center text-accent group-hover:border-accent/40 transition-colors">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-text-main truncate group-hover:text-accent transition-colors">
                        {cmd.title}
                      </div>
                      <div className="text-xs font-normal text-text-muted truncate">
                        {cmd.subtitle}
                      </div>
                    </div>
                  </div>
                  <span className="text-[11px] font-mono font-semibold text-text-dim px-2 py-0.5 rounded bg-surface border border-border shrink-0 ml-3">
                    {cmd.category}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-border bg-surface-2/30 flex items-center justify-between text-xs text-text-dim font-mono">
          <span>ECDAT Command Palette · NTRO PS 26164</span>
          <span>Use ↑ ↓ to navigate, ↵ to select</span>
        </div>
      </div>
    </div>
  );
};
