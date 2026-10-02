import React, { useState, useEffect, useCallback } from 'react';
import { useScan } from '../context/ScanContext';
import { ecdatApi } from '../api/endpoints';
import { MoscaSimulateResponse } from '../types/api';
import { HelpTooltip } from '../components/common/HelpTooltip';
import {
  Clock,
  Sliders,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  ShieldAlert,
  FileCode,
  Calendar,
  Layers,
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
        <div className="w-16 h-16 rounded-2xl bg-white border border-slate-300 flex items-center justify-center mx-auto text-indigo-600 shadow-sm">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">No Scan Target Selected</h2>
        <p className="text-sm text-slate-600">
          Select or launch a scan to simulate Mosca harvest-now-decrypt-later horizons.
        </p>
      </div>
    );
  }

  const isBreached = result?.state === 'breached';

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8 animate-in fade-in duration-200">
      {/* Title */}
      <div className="border-b border-slate-200 pb-5">
        <div className="flex items-center gap-2.5">
          <Clock className="w-6 h-6 text-indigo-600" />
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Mosca's Theorem Simulator (X + Y &gt; Z)
          </h1>
          <HelpTooltip
            title="Mosca's Inequality"
            content="Models whether data secrecy shelf-life (X) plus migration duration (Y) exceeds quantum arrival (Z). If X + Y > Z, Harvest-Now-Decrypt-Later threats apply."
          />
        </div>
        <p className="text-xs sm:text-sm text-slate-600 mt-1">
          Strategic horizon modeling calculating whether your encrypted data remains protected before quantum computers arrive.
        </p>
      </div>

      {/* Preset Pills */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-500 text-[11px] uppercase font-bold mr-1">Stored Scenarios:</span>
        <button
          onClick={() => applyPreset('baseline')}
          className="px-3.5 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 hover:text-slate-950 transition font-semibold shadow-sm cursor-pointer"
        >
          Baseline (X=15y, Y=4y, Z=10y)
        </button>
        <button
          onClick={() => applyPreset('conservative')}
          className="px-3.5 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 hover:text-slate-950 transition font-semibold shadow-sm cursor-pointer"
        >
          Conservative (X=10y, Y=3y, Z=15y)
        </button>
        <button
          onClick={() => applyPreset('accelerated')}
          className="px-3.5 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 hover:text-slate-950 transition font-semibold shadow-sm cursor-pointer"
        >
          Accelerated CRQC (X=20y, Y=5y, Z=7y)
        </button>
        <button
          onClick={() => applyPreset('banking')}
          className="px-3.5 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 hover:text-slate-950 transition font-semibold shadow-sm cursor-pointer"
        >
          Sovereign Banking (X=25y, Y=6y, Z=8y)
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Controls Column */}
        <div className="lg:col-span-5 p-6 rounded-2xl bg-white border border-slate-300 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-indigo-600" />
              What-If Parameter Controls
            </h2>
            {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600" />}
          </div>

          {/* Slider X */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label className="text-slate-700 font-bold">X: Data Secrecy Shelf-Life</label>
              <span className="text-indigo-700 font-bold bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200 font-mono">
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
              className="w-full cursor-pointer accent-indigo-600"
            />
            <p className="text-[11px] text-slate-500 font-medium">
              How many years must sensitive transaction, citizen, or proprietary data remain confidential?
            </p>
          </div>

          {/* Slider Y */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label className="text-slate-700 font-bold">Y: Migration Timeline Duration</label>
              <span className="text-amber-800 font-bold bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200 font-mono">
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
              className="w-full cursor-pointer accent-indigo-600"
            />
            <p className="text-[11px] text-slate-500 font-medium">
              Estimated engineering & governance duration to transition systems to PQC standards.
            </p>
          </div>

          {/* Slider Z */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label className="text-slate-700 font-bold">Z: Quantum Computer Arrival (CRQC)</label>
              <span className="text-emerald-800 font-bold bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 font-mono">
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
              className="w-full cursor-pointer accent-indigo-600"
            />
            <p className="text-[11px] text-slate-500 font-medium">
              Years until an adversary possesses a CRQC capable of breaking RSA/ECC (Shor's algorithm).
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1">
            <span className="font-bold text-slate-900">Rule 1 Engine Guarantee:</span>
            <p className="text-[11px] leading-relaxed">
              All inequalities, dates, margins, and affected findings are evaluated dynamically by the backend risk engine.
            </p>
          </div>
        </div>

        {/* Results Column */}
        <div className="lg:col-span-7 space-y-6">
          {error ? (
            <div className="p-6 rounded-2xl bg-rose-50 border border-rose-300 text-rose-800 text-xs font-mono">
              Simulation error: {error}
            </div>
          ) : !result ? (
            <div className="p-12 text-center text-slate-500">
              Running simulation against scan inventory...
            </div>
          ) : (
            <div className="space-y-6">
              {/* Verdict Callout Banner (Non-alarmist modern enterprise styling) */}
              <div
                className={`p-6 rounded-2xl border transition shadow-sm ${
                  isBreached
                    ? 'bg-amber-50/90 border-amber-300 text-amber-950'
                    : 'bg-emerald-50/90 border-emerald-300 text-emerald-950'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                  <div className="flex items-start gap-3">
                    {isBreached ? (
                      <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
                    ) : (
                      <CheckCircle className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <span className="text-xs uppercase font-bold tracking-wider text-slate-500">
                        Strategic Mosca Verdict
                      </span>
                      <h2
                        className={`text-lg font-bold ${
                          isBreached ? 'text-amber-950' : 'text-emerald-950'
                        }`}
                      >
                        {isBreached
                          ? 'Post-Quantum Migration Advisory (Action Window Open)'
                          : 'Within Safe Horizon: System Protected'}
                      </h2>
                      <p className="text-xs text-slate-700 mt-1 leading-relaxed">
                        {isBreached
                          ? 'Data shelf-life requirement extends past the projected quantum arrival date. Remediation roadmap generated below.'
                          : 'Migration timeline finishes comfortably before projected quantum capability arrival.'}
                      </p>
                      <div className="text-[11px] font-mono text-slate-900 mt-2 font-semibold">
                        Equation State: <span className="uppercase">{result.state}</span> (X + Y = {result.x_plus_y}y vs Z = {result.z_years}y)
                      </div>
                    </div>
                  </div>

                  <div className="text-left sm:text-right font-mono bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
                    <span className="text-xs text-slate-500 block font-sans font-semibold">Margin</span>
                    <span
                      className={`text-2xl font-bold ${
                        isBreached ? 'text-amber-700' : 'text-emerald-700'
                      }`}
                    >
                      {result.margin_years > 0 ? `+${result.margin_years}y` : `${result.margin_years}y`}
                    </span>
                  </div>
                </div>

                {isBreached && (
                  <div className="mt-3 pt-3 border-t border-amber-200/80 text-xs font-mono text-amber-950 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-amber-600" />
                    <span>
                      Must start migration by: <strong>{result.must_start_by}</strong>
                    </span>
                  </div>
                )}
              </div>

              {/* Narrative Breakdown */}
              <div className="p-6 rounded-2xl bg-white border border-slate-300 shadow-sm space-y-3">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">
                  Analytical Narrative & Exposure Scope
                </h3>
                <p className="text-xs text-slate-700 leading-relaxed font-mono bg-slate-50 p-4 rounded-xl border border-slate-200">
                  {result.narrative}
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-2">
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
                    <span className="text-[11px] text-slate-500 block font-semibold">Affected Findings</span>
                    <span className="text-xl font-bold font-mono text-slate-900 mt-1 block">
                      {result.affected_findings}
                    </span>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
                    <span className="text-[11px] text-slate-500 block font-semibold">Affected Assets</span>
                    <span className="text-xl font-bold font-mono text-indigo-600 mt-1 block">
                      {result.affected_assets}
                    </span>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-center col-span-2 sm:col-span-1">
                    <span className="text-[11px] text-slate-500 block font-semibold">Execution Deadline</span>
                    <span className="text-base font-bold font-mono text-amber-700 mt-1 block">
                      {result.must_start_by}
                    </span>
                  </div>
                </div>
              </div>

              {/* Affected File Surfaces */}
              {result.affected_file_paths && result.affected_file_paths.length > 0 && (
                <div className="p-5 rounded-2xl bg-white border border-slate-300 shadow-sm space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span className="font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                      <FileCode className="w-4 h-4 text-indigo-600" />
                      Affected Code Surfaces ({result.affected_file_paths.length})
                    </span>
                    <span>Confidentiality shelf-life breached</span>
                  </div>

                  <div className="max-h-48 overflow-y-auto space-y-1.5 font-mono text-xs pr-1">
                    {result.affected_file_paths.map((path, idx) => (
                      <div
                        key={idx}
                        className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 truncate hover:bg-slate-100 transition"
                      >
                        {path}
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
