import React, { useState, useEffect, useCallback } from 'react';
import { useScan } from '../context/ScanContext';
import { ecdatApi } from '../api/endpoints';
import { MoscaSimulateResponse } from '../types/api';
import { BandBadge } from '../components/common/BandBadge';
import {
  Clock,
  Sliders,
  AlertTriangle,
  CheckCircle,
  HelpCircle,
  RefreshCw,
  FileCode,
  ShieldX,
  ShieldAlert,
} from 'lucide-react';

export const MoscaSimulator: React.FC = () => {
  const { activeScanId } = useScan();

  // Inputs: X (secrecy lifetime), Y (migration years), Z (CRQC arrival horizon)
  const [xYears, setXYears] = useState<number>(15);
  const [yYears, setYYears] = useState<number>(4);
  const [zYears, setZYears] = useState<number>(10);
  const [scope, setScope] = useState<string>('all');

  const [result, setResult] = useState<MoscaSimulateResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const runSimulation = useCallback(async () => {
    if (!activeScanId) return;
    setLoading(true);
    setError(null);
    try {
      // RULE 1: Server computes all Mosca mathematics
      const res = await ecdatApi.simulateMosca(activeScanId, {
        x_years: xYears,
        y_years: yYears,
        z_years: zYears,
        scope: scope === 'all' ? undefined : scope,
      });
      setResult(res.data);
    } catch (err: any) {
      setError(err.message || 'Simulation query failed');
    } finally {
      setLoading(false);
    }
  }, [activeScanId, xYears, yYears, zYears, scope]);

  useEffect(() => {
    runSimulation();
  }, [runSimulation]);

  const applyPreset = (preset: 'baseline' | 'conservative' | 'accelerated' | 'banking') => {
    if (preset === 'baseline') {
      setXYears(15);
      setYYears(4);
      setZYears(10);
    } else if (preset === 'conservative') {
      setXYears(10);
      setYYears(3);
      setZYears(15);
    } else if (preset === 'accelerated') {
      setXYears(20);
      setYYears(5);
      setZYears(7);
    } else if (preset === 'banking') {
      setXYears(25);
      setYYears(6);
      setZYears(8);
    }
  };

  if (!activeScanId) {
    return (
      <div className="max-w-4xl mx-auto p-12 text-center space-y-4">
        <ShieldAlert className="w-12 h-12 text-slate-500 mx-auto" />
        <h2 className="text-xl font-bold font-mono text-slate-200">No Scan Selected</h2>
        <p className="text-sm text-slate-400 font-mono">
          Select or launch a scan to simulate Mosca harvest-now-decrypt-later horizons.
        </p>
      </div>
    );
  }

  const isBreached = result?.state === 'breached';

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
      {/* Title */}
      <div className="border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2">
          <Clock className="w-6 h-6 text-cyan-400" />
          <h1 className="text-2xl font-bold font-mono text-slate-100">
            Mosca's Theorem Simulator (X + Y &gt; Z)
          </h1>
        </div>
        <p className="text-xs sm:text-sm text-slate-400 font-mono mt-1">
          Server-side harvest-now-decrypt-later (HNDL) exposure analysis: If data shelf-life (X) plus migration duration (Y) exceeds quantum arrival (Z), confidentiality is breached.
        </p>
      </div>

      {/* Preset Pills */}
      <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
        <span className="text-slate-400 text-[11px] uppercase mr-1">Stored Scenarios:</span>
        <button
          onClick={() => applyPreset('baseline')}
          className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200"
        >
          Baseline (X=15y, Y=4y, Z=10y)
        </button>
        <button
          onClick={() => applyPreset('conservative')}
          className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200"
        >
          Conservative (X=10y, Y=3y, Z=15y)
        </button>
        <button
          onClick={() => applyPreset('accelerated')}
          className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200"
        >
          Accelerated CRQC (X=20y, Y=5y, Z=7y)
        </button>
        <button
          onClick={() => applyPreset('banking')}
          className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200"
        >
          Sovereign Banking (X=25y, Y=6y, Z=8y)
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Controls Column */}
        <div className="lg:col-span-5 p-6 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-slate-200 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-cyan-400" />
              What-If Parameter Controls
            </h3>
            {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />}
          </div>

          {/* Slider X */}
          <div className="space-y-2">
            <div className="flex items-center justify-between font-mono text-xs">
              <label className="text-slate-300 font-semibold">X: Data Secrecy Shelf-Life</label>
              <span className="text-cyan-400 font-bold bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                {xYears} Years
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="40"
              step="1"
              value={xYears}
              onChange={(e) => setXYears(Number(e.target.value))}
              className="w-full accent-cyan-500 cursor-pointer"
            />
            <p className="text-[11px] text-slate-500 font-sans">
              How many years must sensitive transaction, citizen, or proprietary data remain secure?
            </p>
          </div>

          {/* Slider Y */}
          <div className="space-y-2">
            <div className="flex items-center justify-between font-mono text-xs">
              <label className="text-slate-300 font-semibold">Y: Migration Timeline Duration</label>
              <span className="text-amber-400 font-bold bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                {yYears} Years
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="15"
              step="1"
              value={yYears}
              onChange={(e) => setYYears(Number(e.target.value))}
              className="w-full accent-amber-500 cursor-pointer"
            />
            <p className="text-[11px] text-slate-500 font-sans">
              Estimated engineering & governance duration to transition systems to PQC standards.
            </p>
          </div>

          {/* Slider Z */}
          <div className="space-y-2">
            <div className="flex items-center justify-between font-mono text-xs">
              <label className="text-slate-300 font-semibold">Z: Cryptanalytically Relevant Quantum Arrival (CRQC)</label>
              <span className="text-indigo-400 font-bold bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                {zYears} Years
              </span>
            </div>
            <input
              type="range"
              min="3"
              max="25"
              step="1"
              value={zYears}
              onChange={(e) => setZYears(Number(e.target.value))}
              className="w-full accent-indigo-500 cursor-pointer"
            />
            <p className="text-[11px] text-slate-500 font-sans">
              Years until an adversary possesses a CRQC capable of breaking RSA/ECC (Shor's algorithm).
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-400">
            <span className="font-semibold text-slate-300">Rule 1 Architecture Notice:</span>
            <p className="text-[11px] text-slate-500 mt-1">
              All inequalities, dates, margins, and affected findings are evaluated dynamically by the backend risk engine.
            </p>
          </div>
        </div>

        {/* Results Column */}
        <div className="lg:col-span-7 space-y-6">
          {error ? (
            <div className="p-6 rounded-2xl bg-rose-950/30 border border-rose-500/50 text-rose-300 font-mono text-xs">
              Simulation error: {error}
            </div>
          ) : !result ? (
            <div className="p-12 text-center text-slate-500 font-mono">
              Running simulation against scan inventory...
            </div>
          ) : (
            <div className="space-y-6">
              {/* Verdict Card */}
              <div
                className={`p-6 rounded-2xl border transition shadow-xl ${
                  isBreached
                    ? 'bg-rose-950/20 border-rose-500/50 shadow-rose-950/30'
                    : 'bg-emerald-950/20 border-emerald-500/50 shadow-emerald-950/30'
                }`}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    {isBreached ? (
                      <ShieldX className="w-7 h-7 text-rose-400" />
                    ) : (
                      <CheckCircle className="w-7 h-7 text-emerald-400" />
                    )}
                    <div>
                      <span className="text-xs uppercase font-mono tracking-wider text-slate-400">
                        Mosca Inequality Verdict
                      </span>
                      <h2
                        className={`text-2xl font-bold font-mono uppercase ${
                          isBreached ? 'text-rose-400' : 'text-emerald-400'
                        }`}
                      >
                        {result.state} (X + Y = {result.x_plus_y}y vs Z = {result.z_years}y)
                      </h2>
                    </div>
                  </div>

                  <div className="text-right font-mono">
                    <span className="text-xs text-slate-400 block">Margin</span>
                    <span
                      className={`text-2xl font-bold ${
                        isBreached ? 'text-rose-400' : 'text-emerald-400'
                      }`}
                    >
                      {result.margin_years > 0 ? `+${result.margin_years}` : result.margin_years}y
                    </span>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2 font-mono text-xs">
                  <div className="flex items-center justify-between text-slate-300">
                    <span>Migration Must Start By:</span>
                    <span className="text-base font-bold text-cyan-400">{result.must_start_by}</span>
                  </div>
                  <p className="text-slate-400 leading-relaxed font-sans text-xs">
                    {result.narrative}
                  </p>
                </div>
              </div>

              {/* Impact Breakdown Cards */}
              <div className="grid grid-cols-2 gap-4 font-mono text-xs">
                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                  <span className="text-slate-400 text-[11px] block">Affected Findings</span>
                  <span className="text-2xl font-bold text-slate-100 mt-1 block">
                    {result.affected_findings}
                  </span>
                  <span className="text-slate-500 text-[10px]">Shor-vulnerable artefacts</span>
                </div>

                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                  <span className="text-slate-400 text-[11px] block">Affected Assets</span>
                  <span className="text-2xl font-bold text-slate-100 mt-1 block">
                    {result.affected_assets}
                  </span>
                  <span className="text-slate-500 text-[10px]">Algorithms & Keys</span>
                </div>
              </div>

              {/* Affected Files List */}
              {result.affected_file_paths && result.affected_file_paths.length > 0 && (
                <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3 font-mono text-xs">
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="font-semibold uppercase tracking-wider text-[11px]">
                      Files Exposed to Harvest-Now-Decrypt-Later ({result.affected_file_paths.length})
                    </span>
                  </div>

                  <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                    {result.affected_file_paths.map((p, idx) => (
                      <div
                        key={idx}
                        className="px-3 py-2 rounded bg-slate-950 border border-slate-800/80 text-slate-300 flex items-center gap-2"
                      >
                        <FileCode className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                        <span className="truncate">{p}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
