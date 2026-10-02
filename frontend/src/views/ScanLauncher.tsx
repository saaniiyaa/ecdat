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
  XCircle,
} from 'lucide-react';

interface ScanLauncherProps {
  onScanCompleted?: (scanId: string) => void;
  onClose?: () => void;
}

export const ScanLauncher: React.FC<ScanLauncherProps> = ({ onScanCompleted, onClose }) => {
  const { workspaces, startNewScan, cancelCurrentScan, activeScan } = useScan();

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
      // Prompt §3: wait_seconds=120 or queued
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold font-mono text-slate-900 flex items-center gap-2">
            <Play className="w-6 h-6 text-emerald-600" />
            Cryptographic Scan Launcher
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Initiate multi-tier discovery (Python AST, Java, Go, C/C++, Manifests, X.509, Binaries, Containers)
          </p>
        </div>

        <button
          onClick={handleFillDemo}
          className="px-3 py-1.5 rounded-lg border border-indigo-200/60 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-mono font-medium transition"
        >
          Load NTRO Demo Presets
        </button>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-3 text-xs font-mono text-rose-700">
          <AlertCircle className="w-5 h-5 text-rose-700 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-bold">Error:</span> {errorMsg}
          </div>
        </div>
      )}

      {/* Launcher Form */}
      <form onSubmit={handleLaunch} className="space-y-6">
        {/* Target Selector */}
        <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <span className="text-xs uppercase font-mono font-semibold text-slate-700 flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-indigo-600" />
              1. Scan Target Selection
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode('path')}
                className={`px-3 py-1 rounded text-xs font-mono transition ${
                  mode === 'path'
                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Local Path / URI
              </button>
              <button
                type="button"
                onClick={() => setMode('upload')}
                className={`px-3 py-1 rounded text-xs font-mono transition ${
                  mode === 'upload'
                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Upload Archive
              </button>
            </div>
          </div>

          {mode === 'path' ? (
            <div>
              <label className="block text-xs font-mono text-slate-500 mb-1">
                Target URI or Filesystem Path:
              </label>
              <input
                type="text"
                required
                value={targetUri}
                onChange={(e) => setTargetUri(e.target.value)}
                placeholder="fixtures/demo_repo or /path/to/repo"
                className="w-full px-3.5 py-2.5 rounded-lg bg-white border border-slate-300 font-mono text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
              />
              <span className="text-[11px] text-slate-400 mt-1 block font-mono">
                Tip: Use <code className="text-indigo-600">fixtures/demo_repo</code> for the official 22-file demo estate.
              </span>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-mono text-slate-500 mb-1">
                Upload Target (ZIP, TAR.GZ, or Certificate Bundle):
              </label>
              <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:border-indigo-400 transition">
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
                  <Upload className="w-8 h-8 text-indigo-500" />
                  <span className="text-xs font-mono text-slate-600">
                    {uploading
                      ? 'Uploading to ECDAT backend...'
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
              <label className="block text-xs font-mono text-slate-500 mb-1">Scan Name:</label>
              <input
                type="text"
                value={scanName}
                onChange={(e) => setScanName(e.target.value)}
                placeholder="e.g. vajra-payments"
                className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 font-mono text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-slate-500 mb-1">Workspace:</label>
              <select
                value={selectedWorkspace}
                onChange={(e) => setSelectedWorkspace(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 font-mono text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
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

        {/* Operational Context Form */}
        <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-4">
          <span className="text-xs uppercase font-mono font-semibold text-slate-700 flex items-center gap-2 border-b border-slate-200 pb-3">
            <Shield className="w-4 h-4 text-emerald-600" />
            2. Operational Risk Context (Feeds Server-Side Scoring)
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-mono text-slate-500 mb-1">Exposure:</label>
              <select
                value={exposure}
                onChange={(e) => setExposure(e.target.value as any)}
                className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 font-mono text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
              >
                <option value="internet_facing">internet_facing</option>
                <option value="internal">internal</option>
                <option value="air_gapped">air_gapped</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-mono text-slate-500 mb-1">Criticality:</label>
              <select
                value={criticality}
                onChange={(e) => setCriticality(e.target.value as any)}
                className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 font-mono text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
              >
                <option value="sovereign_critical">sovereign_critical</option>
                <option value="business_critical">business_critical</option>
                <option value="standard">standard</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-mono text-slate-500 mb-1">Classification:</label>
              <select
                value={classification}
                onChange={(e) => setClassification(e.target.value as any)}
                className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 font-mono text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
              >
                <option value="secret">secret</option>
                <option value="confidential">confidential</option>
                <option value="restricted">restricted</option>
                <option value="public">public</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-mono text-slate-500 mb-1">Data Lifetime (X yrs):</label>
              <input
                type="number"
                min="1"
                max="50"
                value={dataLifetimeYears}
                onChange={(e) => setDataLifetimeYears(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 font-mono text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* Mosca Horizon Setting */}
        <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-4">
          <span className="text-xs uppercase font-mono font-semibold text-slate-700 flex items-center gap-2 border-b border-slate-200 pb-3">
            <Clock className="w-4 h-4 text-indigo-600" />
            3. Mosca Inequality Horizon (X + Y &gt; Z)
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {(['baseline', 'conservative', 'accelerated'] as const).map((sc) => (
              <label
                key={sc}
                onClick={() => setMoscaScenario(sc)}
                className={`p-3.5 rounded-lg border cursor-pointer transition flex flex-col justify-between ${
                  moscaScenario === sc
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-800 shadow-sm'
                    : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-xs uppercase font-bold">{sc}</span>
                  <input
                    type="radio"
                    name="moscaScenario"
                    checked={moscaScenario === sc}
                    onChange={() => setMoscaScenario(sc)}
                    className="text-indigo-600"
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

        {/* Submit Button */}
        <div className="flex items-center justify-between pt-2">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs font-mono hover:bg-slate-50"
            >
              Cancel
            </button>
          )}

          <button
            type="submit"
            disabled={isLaunching}
            className="ml-auto inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs shadow-sm transition disabled:opacity-50 cursor-pointer"
          >
            {isLaunching ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-white" />
                <span>Scanning Estate (Deterministic Engine)...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current text-white" />
                <span>Execute Discovery Scan</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Live Event Progress Stream */}
      {(launchedScan || isLaunching || liveEvents.length > 0) && (
        <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-4 font-mono">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <span className="text-xs font-semibold uppercase text-slate-700 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-indigo-600" />
              Scan Progress Ledger ({launchedScan?.status || 'evaluating'})
            </span>
            {launchedScan?.progress_pct !== undefined && (
              <span className="text-xs text-indigo-600 font-bold">
                {launchedScan.progress_pct}%
              </span>
            )}
          </div>

          {/* Progress bar */}
          <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
            <div
              className={`h-2 rounded-full transition-all duration-300 ${
                launchedScan?.status === 'completed'
                  ? 'bg-emerald-500'
                  : launchedScan?.status === 'failed'
                  ? 'bg-rose-500'
                  : 'bg-indigo-500'
              }`}
              style={{ width: `${launchedScan?.progress_pct ?? (isLaunching ? 70 : 0)}%` }}
            />
          </div>

          {/* Events Log Console */}
          <div className="bg-slate-50 rounded-lg p-3 max-h-48 overflow-y-auto space-y-1.5 text-[11px] text-slate-700 border border-slate-200">
            {liveEvents.length === 0 ? (
              <div className="text-slate-400 italic">Waiting for scan runner event signals...</div>
            ) : (
              liveEvents.map((ev, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-slate-400 shrink-0">[{ev.phase}]</span>
                  <span className="text-slate-700">{ev.message}</span>
                </div>
              ))
            )}
          </div>

          {launchedScan?.status === 'completed' && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200/60 text-emerald-700 text-xs flex items-center justify-between">
              <span className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                Scan complete: {launchedScan.finding_count} findings, {launchedScan.file_count} files in {launchedScan.duration_ms} ms.
              </span>
              {onClose && (
                <button
                  onClick={onClose}
                  className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-bold font-mono text-[11px]"
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
