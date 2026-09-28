import React, { useState } from 'react';
import { RegistryProvider } from './context/RegistryContext';
import { ScanProvider, useScan } from './context/ScanContext';
import { Header } from './components/layout/Header';
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

// Typed Error Boundary driven by error.code (Rule 5.1 & DoD requirement)
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
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-slate-100 font-mono">
          <div className="max-w-lg w-full p-8 rounded-2xl bg-slate-900 border border-rose-500/40 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <AlertTriangle className="w-8 h-8" />
              <div>
                <span className="text-xs uppercase text-slate-500">ECDAT Error Envelope</span>
                <h2 className="text-lg font-bold">Error Code: {this.state.errorCode}</h2>
              </div>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed bg-slate-950 p-4 rounded-lg border border-slate-800">
              {this.state.errorMessage}
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs"
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
  const [targetBandFilter, setTargetBandFilter] = useState<string | undefined>(undefined);
  const { error, clearError } = useScan();

  const handleNavigateToFindings = (band?: string) => {
    setTargetBandFilter(band);
    setActiveTab('findings');
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <Header
        onOpenLauncher={() => setShowLauncherModal(true)}
        activeTab={activeTab}
        setActiveTab={(tab) => {
          setTargetBandFilter(undefined);
          setActiveTab(tab);
        }}
      />

      {/* Global Error Banner */}
      {error && (
        <div className="bg-rose-950/80 border-b border-rose-500/40 px-4 py-3 text-xs font-mono flex items-center justify-between text-rose-300">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={clearError} className="text-rose-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Tab View */}
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

      {/* Modal Launcher */}
      {showLauncherModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-8">
            <div className="p-4 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between">
              <span className="font-mono font-bold text-xs uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-400" />
                ECDAT Scan Orchestrator
              </span>
              <button
                onClick={() => setShowLauncherModal(false)}
                className="text-slate-400 hover:text-white text-xs font-mono"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="max-h-[80vh] overflow-y-auto">
              <ScanLauncher
                onScanCompleted={(id) => {
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
      <footer className="border-t border-slate-800/80 bg-slate-950/90 py-4 px-6 text-center text-xs font-mono text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>ECDAT — National Technical Research Organisation · SIH PS 26164</span>
          <span>Deterministic Cryptographic Discovery & Post-Quantum Risk Management Engine</span>
        </div>
      </footer>
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
