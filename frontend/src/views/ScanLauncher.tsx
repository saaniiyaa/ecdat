import React, { useState, useEffect } from 'react';
import { useScan } from '../context/ScanContext';
import { ecdatApi } from '../api/endpoints';
import { ScanCreate, ScanOut, ScanEventOut } from '../types/api';
import {
  Play,
  Upload,
  FolderOpen,
  Terminal,
  Clock,
  Shield,
  Layers,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Sparkles,
} from 'lucide-react';

interface ScanLauncherProps {
  onScanCompleted?: (scanId: string) => void;
  onClose?: () => void;
}

export const ScanLauncher: React.FC<ScanLauncherProps> = ({ onScanCompleted, onClose }) => {
  const { workspaces, startNewScan } = useScan();

  const [mode, setMode] = useState<'path' | 'upload'>('path');
  const [targetUri, setTargetUri] = useState('fixtures/demo_repo');
  const [scanName, setScanName] = useState('vajra-payments');
  const [selectedWorkspace, setSelectedWorkspace] = useState(
    workspaces.length > 0 ? workspaces[0].id : ''
  );

  // Context Form
  const [exposure, setExposure] = useState<'internet_facing' | 'internal' | 'air_gapped'>('internet_facing');
  const [criticality, setCriticality] = useState<'sovereign_critical' | 'business_critical' | 'standard'>('sovereign_critical');
  const [classification, setClassification] = useState<'secret' | 'confidential' | 'restricted' | 'public'>('confidential');
  const [dataLifetimeYears, setDataLifetimeYears] = useState<number>(15);
  const [systemName, setSystemName] = useState('VAJRA Core Payments');

  // Mosca Form
  const [moscaScenario, setMoscaScenario] = useState<'baseline' | 'conservative' | 'accelerated'>('baseline');

  // Execution & Progress State
  const [uploading, setUploading] = useState(false);
  const [uploadedPath, setUploadedPath] = useState<string | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchedScan, setLaunchedScan] = useState<ScanOut | null>(null);
  const [liveEvents, setLiveEvents] = useState<ScanEventOut[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Active step calculation
  const currentStep = launchedScan?.status === 'completed' ? 4 : isLaunching || launchedScan ? 3 : 1;

  // Poll progress if launched scan is running
  useEffect(() => {
    if (!launchedScan) return;
    if (launchedScan.status === 'completed' || launchedScan.status === 'failed') return;

    const timer = setInterval(async () => {
      try {
        const [scanRes, evRes] = await Promise.all([
          ecdatApi.getScan(launchedScan.id),
          ecdatApi.getScanEvents(launchedScan.id),
        ]);
        setLaunchedScan(scanRes.data);
        setLiveEvents(evRes.data || []);

        if (scanRes.data.status === 'completed') {
          if (onScanCompleted) onScanCompleted(scanRes.data.id);
        }
      } catch (err: any) {
        // error during polling
      }
    }, 800);

    return () => clearInterval(timer);
  }, [launchedScan, onScanCompleted]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setErrorMsg(null);
    try {
      const res = await ecdatApi.uploadTarget(file);
      setUploadedPath(res.data.path);
      setTargetUri(res.data.path);
      setScanName(file.name.replace(/\.[^/.]+$/, ''));
    } catch (err: any) {
      setErrorMsg(err.message || 'File upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleLaunch = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLaunching(true);
    setErrorMsg(null);
    setLiveEvents([]);

    const payload: ScanCreate = {
      target_uri: targetUri.trim(),
      name: scanName.trim() || 'scan-' + Date.now(),
      workspace_id: selectedWorkspace || undefined,
      context: {
        exposure,
        criticality,
        classification,
        data_lifetime_years: Number(dataLifetimeYears),
        system_name: systemName.trim() || undefined,
      },
      mosca: {
        scenario: moscaScenario,
      },
    };

    try {
      const scan = await startNewScan(payload, 120);
      setLaunchedScan(scan);
      if (scan.status === 'completed' && onScanCompleted) {
        onScanCompleted(scan.id);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to start scan');
    } finally {
      setIsLaunching(false);
    }
  };

  const handleFillDemo = () => {
    setMode('path');
    setTargetUri('fixtures/demo_repo');
    setScanName('vajra-payments');
    setExposure('internet_facing');
    setCriticality('sovereign_critical');
    setClassification('confidential');
    setDataLifetimeYears(15);
    setMoscaScenario('baseline');
    setSystemName('VAJRA Core Payments');
  };

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-text-main flex items-center gap-2">
            <Play className="w-6 h-6 text-accent" />
            Cryptographic Scan Orchestrator
          </h1>
          <p className="text-xs sm:text-sm text-text-muted mt-1">
            Deterministic discovery across AST, Manifests, X.509, Binaries, and Containers.
          </p>
        </div>

        <button
          onClick={handleFillDemo}
          className="self-start sm:self-auto px-3.5 py-1.5 rounded-xl border border-accent-border bg-accent-subtle text-accent hover:opacity-90 text-xs font-bold font-mono transition flex items-center gap-1.5 cursor-pointer shadow-sm"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Load NTRO Demo Presets</span>
        </button>
      </div>

      {/* Stepper (Select target → Configure → Scan → Results) */}
      <div className="grid grid-cols-4 gap-2 border-y border-border py-3 text-xs font-semibold">
        <div className={`flex items-center gap-2 ${currentStep >= 1 ? 'text-accent' : 'text-text-dim'}`}>
          <span className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[11px] ${currentStep >= 1 ? 'bg-accent text-bg' : 'bg-surface-2 text-text-dim'}`}>
            1
          </span>
          <span className="hidden sm:inline">Target</span>
        </div>
        <div className={`flex items-center gap-2 ${currentStep >= 2 ? 'text-accent' : 'text-text-dim'}`}>
          <span className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[11px] ${currentStep >= 2 ? 'bg-accent text-bg' : 'bg-surface-2 text-text-dim'}`}>
            2
          </span>
          <span className="hidden sm:inline">Configure</span>
        </div>
        <div className={`flex items-center gap-2 ${currentStep >= 3 ? 'text-accent' : 'text-text-dim'}`}>
          <span className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[11px] ${currentStep >= 3 ? 'bg-accent text-bg' : 'bg-surface-2 text-text-dim'}`}>
            3
          </span>
          <span className="hidden sm:inline">Execute</span>
        </div>
        <div className={`flex items-center gap-2 ${currentStep >= 4 ? 'text-accent' : 'text-text-dim'}`}>
          <span className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[11px] ${currentStep >= 4 ? 'bg-accent text-bg' : 'bg-surface-2 text-text-dim'}`}>
            4
          </span>
          <span className="hidden sm:inline">Results</span>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-danger-subtle border border-danger-border flex items-start gap-3 text-xs font-mono text-danger">
          <AlertCircle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
          <div className="flex-1">
            <strong>Error:</strong> {errorMsg}
          </div>
        </div>
      )}

      {/* Launcher Form */}
      <form onSubmit={handleLaunch} className="space-y-6">
        {/* Step 1: Target Selector */}
        <div className="p-5 rounded-card bg-surface border border-border shadow-card space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h2 className="text-xs uppercase font-bold text-text-main flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-accent" />
              1. Scan Target Selection
            </h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode('path')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  mode === 'path'
                    ? 'bg-surface-2 text-accent border border-accent-border'
                    : 'text-text-muted hover:text-text-main'
                }`}
              >
                Local Path / URI
              </button>
              <button
                type="button"
                onClick={() => setMode('upload')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  mode === 'upload'
                    ? 'bg-surface-2 text-accent border border-accent-border'
                    : 'text-text-muted hover:text-text-main'
                }`}
              >
                Upload Archive
              </button>
            </div>
          </div>

          {mode === 'path' ? (
            <div>
              <label className="block text-xs font-bold text-text-muted mb-1">
                Target URI or Filesystem Path:
              </label>
              <input
                type="text"
                required
                value={targetUri}
                onChange={(e) => setTargetUri(e.target.value)}
                placeholder="fixtures/demo_repo or /path/to/repo"
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface-2 border border-border font-mono text-xs text-text-main focus:outline-none focus:border-accent"
              />
              <span className="text-[11px] text-text-dim mt-1.5 block font-mono">
                Tip: Use <code className="text-accent font-bold">fixtures/demo_repo</code> for the official 22-file demo estate.
              </span>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-bold text-text-muted mb-1">
                Upload Target (ZIP, TAR.GZ, or Certificate Bundle):
              </label>
              <div className="border-2 border-dashed border-border rounded-xl p-6 text-center hover:border-accent transition bg-surface-2/40">
                <input
                  type="file"
                  id="target-upload"
                  onChange={handleFileUpload}
                  className="hidden"
                  accept=".zip,.tar,.gz,.tgz,.pem,.crt"
                />
                <label
                  htmlFor="target-upload"
                  className="cursor-pointer flex flex-col items-center gap-2"
                >
                  <Upload className="w-8 h-8 text-accent" />
                  <span className="text-xs font-semibold text-text-main">
                    {uploading
                      ? 'Uploading to ECDAT engine...'
                      : uploadedPath
                      ? `Uploaded: ${uploadedPath}`
                      : 'Click to select target bundle'}
                  </span>
                </label>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-xs font-bold text-text-muted mb-1">Scan Name:</label>
              <input
                type="text"
                value={scanName}
                onChange={(e) => setScanName(e.target.value)}
                placeholder="e.g. vajra-payments"
                className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-border font-mono text-xs text-text-main focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-text-muted mb-1">Workspace:</label>
              <select
                value={selectedWorkspace}
                onChange={(e) => setSelectedWorkspace(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-border font-semibold text-xs text-text-main focus:outline-none focus:border-accent cursor-pointer"
              >
                <option value="">Default Workspace</option>
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.slug})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Step 2: Operational Context Form */}
        <div className="p-5 rounded-card bg-surface border border-border shadow-card space-y-4">
          <h2 className="text-xs uppercase font-bold text-text-main flex items-center gap-2 border-b border-border pb-3">
            <Shield className="w-4 h-4 text-accent" />
            2. Operational Risk Context (Feeds Server-Side Scoring)
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-bold text-text-muted mb-1">Exposure:</label>
              <select
                value={exposure}
                onChange={(e) => setExposure(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-border font-semibold text-xs text-text-main focus:outline-none focus:border-accent cursor-pointer"
              >
                <option value="internet_facing">internet_facing</option>
                <option value="internal">internal</option>
                <option value="air_gapped">air_gapped</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-text-muted mb-1">Criticality:</label>
              <select
                value={criticality}
                onChange={(e) => setCriticality(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-border font-semibold text-xs text-text-main focus:outline-none focus:border-accent cursor-pointer"
              >
                <option value="sovereign_critical">sovereign_critical</option>
                <option value="business_critical">business_critical</option>
                <option value="standard">standard</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-text-muted mb-1">Classification:</label>
              <select
                value={classification}
                onChange={(e) => setClassification(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-border font-semibold text-xs text-text-main focus:outline-none focus:border-accent cursor-pointer"
              >
                <option value="secret">secret</option>
                <option value="confidential">confidential</option>
                <option value="restricted">restricted</option>
                <option value="public">public</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-text-muted mb-1">Data Lifetime (X yrs):</label>
              <input
                type="number"
                min="1"
                max="50"
                value={dataLifetimeYears}
                onChange={(e) => setDataLifetimeYears(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-border font-mono text-xs text-text-main focus:outline-none focus:border-accent"
              />
            </div>
          </div>
        </div>

        {/* Step 3: Mosca Horizon Scenario */}
        <div className="p-5 rounded-card bg-surface border border-border shadow-card space-y-4">
          <h2 className="text-xs uppercase font-bold text-text-main flex items-center gap-2 border-b border-border pb-3">
            <Clock className="w-4 h-4 text-accent" />
            3. Mosca Inequality Horizon (X + Y &gt; Z)
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {(['baseline', 'conservative', 'accelerated'] as const).map((sc) => (
              <label
                key={sc}
                onClick={() => setMoscaScenario(sc)}
                className={`p-3.5 rounded-xl border cursor-pointer transition flex flex-col justify-between ${
                  moscaScenario === sc
                    ? 'border-accent bg-accent-subtle text-text-main shadow-sm'
                    : 'border-border bg-surface-2 text-text-muted hover:border-border'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-xs uppercase font-bold">{sc}</span>
                  <input
                    type="radio"
                    name="moscaScenario"
                    checked={moscaScenario === sc}
                    onChange={() => setMoscaScenario(sc)}
                    className="accent-accent"
                  />
                </div>
                <p className="text-[11px] font-mono opacity-80">
                  {sc === 'baseline' && 'Z = 10y (2036 CRQC horizon)'}
                  {sc === 'conservative' && 'Z = 15y (2041 CRQC horizon)'}
                  {sc === 'accelerated' && 'Z = 7y (2033 CRQC horizon)'}
                </p>
              </label>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-2">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-border text-text-muted text-xs font-bold hover:bg-surface-2 cursor-pointer"
            >
              Cancel
            </button>
          )}

          <button
            type="submit"
            disabled={isLaunching}
            className="ml-auto inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-bg font-bold text-xs shadow-sm transition disabled:opacity-50 cursor-pointer"
          >
            {isLaunching ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-bg" />
                <span>Scanning Estate (Deterministic Engine)...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current text-bg" />
                <span>Execute Discovery Scan</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Live Event Progress Stream */}
      {(launchedScan || isLaunching || liveEvents.length > 0) && (
        <div className="p-5 rounded-card bg-surface border border-border space-y-4 font-mono shadow-card">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <span className="text-xs font-bold uppercase text-text-main flex items-center gap-2 font-sans">
              <Terminal className="w-4 h-4 text-accent" />
              Scan Progress Ledger ({launchedScan?.status || 'evaluating'})
            </span>
            {launchedScan?.progress_pct !== undefined && (
              <span className="text-xs text-accent font-bold font-mono">
                {launchedScan.progress_pct}%
              </span>
            )}
          </div>

          {/* Progress bar */}
          <div className="w-full bg-surface-2 rounded-full h-2.5 overflow-hidden border border-border/60">
            <div
              className={`h-2.5 rounded-full transition-all duration-300 ${
                launchedScan?.status === 'completed'
                  ? 'bg-accent'
                  : launchedScan?.status === 'failed'
                  ? 'bg-danger'
                  : 'bg-accent shimmer'
              }`}
              style={{ width: `${launchedScan?.progress_pct ?? (isLaunching ? 70 : 0)}%` }}
            />
          </div>

          {/* Events Log Console */}
          <div className="bg-surface-2 rounded-xl p-3.5 max-h-48 overflow-y-auto space-y-1.5 text-[11px] text-text-main border border-border">
            {liveEvents.length === 0 ? (
              <div className="text-text-dim italic">Waiting for scan runner event signals...</div>
            ) : (
              liveEvents.map((ev, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-accent shrink-0 font-bold">[{ev.phase}]</span>
                  <span className="text-text-muted">{ev.message}</span>
                </div>
              ))
            )}
          </div>

          {launchedScan?.status === 'completed' && (
            <div className="p-3.5 rounded-xl bg-accent-subtle border border-accent-border text-accent text-xs flex items-center justify-between font-sans">
              <span className="flex items-center gap-2 font-semibold">
                <CheckCircle className="w-4 h-4 shrink-0" />
                Scan complete: {launchedScan.finding_count} findings, {launchedScan.file_count} files in {launchedScan.duration_ms} ms.
              </span>
              {onClose && (
                <button
                  onClick={onClose}
                  className="px-3 py-1 rounded-lg bg-accent text-bg font-bold font-mono text-[11px] hover:bg-accent-hover cursor-pointer"
                >
                  View Dashboard
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
