import React, { useState, useEffect } from 'react';
import { RegistryProvider } from './context/RegistryContext';
import { ScanProvider, useScan } from './context/ScanContext';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { CommandPalette } from './components/common/CommandPalette';
import { HelpModal } from './components/common/HelpModal';
import { ScanLauncher } from './views/ScanLauncher';
import { ExecutiveDashboard } from './views/ExecutiveDashboard';
import { FindingsExplorer } from './views/FindingsExplorer';
import { MoscaSimulator } from './views/MoscaSimulator';
import { MigrationPlan } from './views/MigrationPlan';
import { EvidenceAndExport } from './views/EvidenceAndExport';
import { CertificatesView } from './views/CertificatesView';
import { RegistryView } from './views/RegistryView';
import { ScanDiffView } from './views/ScanDiffView';
import { Shield, AlertTriangle, X } from 'lucide-react';

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; errorCode?: string; errorMessage?: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: any) {
    return {
      hasError: true,
      errorCode: error?.code || 'UNEXPECTED_ERROR',
      errorMessage: error?.message || 'An unhandled exception occurred in the interactive GUI.',
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6 text-slate-900 font-sans">
          <div className="max-w-lg w-full p-8 rounded-2xl bg-white border border-rose-300 shadow-xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <AlertTriangle className="w-8 h-8 shrink-0" />
              <div>
                <span className="text-xs uppercase font-bold text-slate-500">ECDAT Error Envelope</span>
                <h2 className="text-lg font-bold text-slate-900">Error Code: {this.state.errorCode}</h2>
              </div>
            </div>
            <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-200 font-mono">
              {this.state.errorMessage}
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition cursor-pointer"
              >
                Reload Console
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const MainConsole: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [showLauncherModal, setShowLauncherModal] = useState<boolean>(false);
  const [showCommandPalette, setShowCommandPalette] = useState<boolean>(false);
  const [showHelpModal, setShowHelpModal] = useState<boolean>(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState<boolean>(false);
  const [targetBandFilter, setTargetBandFilter] = useState<string | undefined>(undefined);
  
  // Theme state: default to light, persist in localStorage
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('ecdat_theme');
    return saved === 'dark' ? 'dark' : 'light';
  });

  const { error, clearError } = useScan();

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.remove('dark');
      root.classList.add('light');
    } else {
      root.classList.remove('light');
      root.classList.add('dark');
    }
    localStorage.setItem('ecdat_theme', theme);
  }, [theme]);

  // Global Ctrl/Cmd + K shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowCommandPalette((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const handleNavigateToFindings = (band?: string) => {
    setTargetBandFilter(band);
    setActiveTab('findings');
  };

  return (
    <div className="min-h-screen flex bg-slate-100 text-slate-900 transition-colors duration-200">
      {/* Desktop Sidebar */}
      <div className="hidden md:block shrink-0">
        <Sidebar
          activeTab={activeTab}
          setActiveTab={(tab) => {
            setTargetBandFilter(undefined);
            setActiveTab(tab);
          }}
          isCollapsed={isSidebarCollapsed}
          setIsCollapsed={setIsSidebarCollapsed}
          onOpenLauncher={() => setShowLauncherModal(true)}
          onOpenHelp={() => setShowHelpModal(true)}
          onOpenSettings={() => {
            // Trigger header settings or modal
            const settingsBtn = document.querySelector('header button[title="API Configuration"]') as HTMLButtonElement;
            if (settingsBtn) settingsBtn.click();
          }}
        />
      </div>

      {/* Mobile Drawer Backdrop & Sidebar */}
      {showMobileSidebar && (
        <div className="fixed inset-0 z-50 md:hidden bg-black/60 backdrop-blur-sm flex">
          <div className="w-72 bg-surface h-full shadow-2xl flex flex-col">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <span className="font-bold text-sm text-text-main flex items-center gap-2">
                <Shield className="w-5 h-5 text-accent" />
                ECDAT Navigation
              </span>
              <button
                onClick={() => setShowMobileSidebar(false)}
                className="p-1.5 rounded-lg text-text-dim hover:text-text-main"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <Sidebar
                activeTab={activeTab}
                setActiveTab={(tab) => {
                  setTargetBandFilter(undefined);
                  setActiveTab(tab);
                  setShowMobileSidebar(false);
                }}
                isCollapsed={false}
                setIsCollapsed={() => {}}
                onOpenLauncher={() => {
                  setShowMobileSidebar(false);
                  setShowLauncherModal(true);
                }}
                onOpenHelp={() => {
                  setShowMobileSidebar(false);
                  setShowHelpModal(true);
                }}
                onOpenSettings={() => {
                  setShowMobileSidebar(false);
                  const settingsBtn = document.querySelector('header button[title="API Configuration"]') as HTMLButtonElement;
                  if (settingsBtn) settingsBtn.click();
                }}
              />
            </div>
          </div>
          <div className="flex-1" onClick={() => setShowMobileSidebar(false)} />
        </div>
      )}

      {/* Main Content Area */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-all duration-200 ${
          isSidebarCollapsed ? 'md:pl-20' : 'md:pl-64'
        }`}
      >
        <Header
          onOpenLauncher={() => setShowLauncherModal(true)}
          onOpenCommandPalette={() => setShowCommandPalette(true)}
          onOpenHelp={() => setShowHelpModal(true)}
          theme={theme}
          onToggleTheme={toggleTheme}
          onToggleMobileSidebar={() => setShowMobileSidebar(!showMobileSidebar)}
        />

        {/* Global Error Banner */}
        {error && (
          <div className="bg-danger-subtle border-b border-danger-border px-4 py-3 text-xs font-semibold flex items-center justify-between text-danger">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-danger shrink-0" />
              <span>{error}</span>
            </div>
            <button onClick={clearError} className="text-danger hover:text-text-main">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Main Tab Views */}
        <main className="flex-1 pb-16">
          {activeTab === 'dashboard' && (
            <ExecutiveDashboard
              onNavigateToFindings={handleNavigateToFindings}
              onNavigateToMosca={() => setActiveTab('mosca')}
              onNavigateToMigration={() => setActiveTab('migration')}
            />
          )}
          {activeTab === 'findings' && <FindingsExplorer initialBand={targetBandFilter} />}
          {activeTab === 'mosca' && <MoscaSimulator />}
          {activeTab === 'migration' && <MigrationPlan />}
          {activeTab === 'evidence' && <EvidenceAndExport />}
          {activeTab === 'certificates' && <CertificatesView />}
          {activeTab === 'registry' && <RegistryView />}
          {activeTab === 'diff' && <ScanDiffView />}
        </main>

        {/* Command Palette Modal (Ctrl+K) */}
        <CommandPalette
          isOpen={showCommandPalette}
          onClose={() => setShowCommandPalette(false)}
          onSelectTab={(tab) => {
            setTargetBandFilter(undefined);
            setActiveTab(tab);
          }}
          onOpenLauncher={() => setShowLauncherModal(true)}
          theme={theme}
          onToggleTheme={toggleTheme}
        />

        {/* Cryptographic Help & Guidance Modal */}
        <HelpModal isOpen={showHelpModal} onClose={() => setShowHelpModal(false)} />

        {/* Scan Orchestrator Modal */}
        {showLauncherModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150">
            <div className="w-full max-w-4xl bg-white border border-slate-300 rounded-2xl shadow-2xl overflow-hidden my-8">
              <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                <span className="font-bold text-xs uppercase tracking-wider text-slate-900 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-indigo-600" />
                  ECDAT Cryptographic Discovery Orchestrator
                </span>
                <button
                  onClick={() => setShowLauncherModal(false)}
                  className="text-slate-500 hover:text-slate-900 text-xs font-mono p-1 rounded-lg hover:bg-slate-200 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="max-h-[82vh] overflow-y-auto">
                <ScanLauncher
                  onScanCompleted={() => {
                    setShowLauncherModal(false);
                    setActiveTab('dashboard');
                  }}
                  onClose={() => setShowLauncherModal(false)}
                />
              </div>
            </div>
          </div>
        )}

        {/* Institutional NTRO Footer */}
        <footer className="border-t border-slate-200 bg-white/80 py-4 px-6 text-center text-xs text-slate-600 font-mono">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
            <span className="font-semibold text-slate-800">
              ECDAT — National Technical Research Organisation · SIH PS 26164
            </span>
            <span className="text-slate-600">
              Deterministic Cryptographic Discovery & Post-Quantum Risk Management Engine
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <RegistryProvider>
        <ScanProvider>
          <MainConsole />
        </ScanProvider>
      </RegistryProvider>
    </ErrorBoundary>
  );
}
