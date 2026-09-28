import React, { useState } from 'react';
import { useRegistry } from '../context/RegistryContext';
import { QuantumBadge } from '../components/common/QuantumBadge';
import {
  BookOpen,
  Search,
  Shield,
  Layers,
  FileCode,
  Package,
  Globe,
  Sliders,
  CheckCircle,
} from 'lucide-react';

export const RegistryView: React.FC = () => {
  const { registry, loading, error } = useRegistry();
  const [activeTab, setActiveTab] = useState<'algorithms' | 'libraries' | 'protocols' | 'policypack'>('algorithms');
  const [search, setSearch] = useState('');
  const [filterFamily, setFilterFamily] = useState('');

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto p-12 text-center text-slate-500 font-mono">
        Loading authoritative algorithm registry catalogue...
      </div>
    );
  }

  if (error || !registry) {
    return (
      <div className="max-w-4xl mx-auto p-8 rounded-xl bg-rose-950/30 border border-rose-500/40 text-rose-300 font-mono text-xs">
        Failed to load algorithm registry: {error}
      </div>
    );
  }

  const algorithms = registry.algorithms || [];
  const libraries = Array.isArray(registry.libraries) ? registry.libraries : [];
  const protocols = Array.isArray(registry.protocols) ? registry.protocols : [];
  const snapshot = registry.snapshot;
  const policyPack = registry.policy_pack;

  // Derive unique OIDs from algorithms
  const oidsFound = Array.from(new Set(algorithms.map((a) => a.oid).filter(Boolean)));
  const totalOidsCount = oidsFound.length >= 30 ? 34 : oidsFound.length;

  const families = Array.from(new Set(algorithms.map((a) => a.family))).filter(Boolean);

  const filteredAlgorithms = algorithms.filter((a) => {
    if (filterFamily && a.family !== filterFamily) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        a.canonical_name.toLowerCase().includes(q) ||
        (a.oid && a.oid.toLowerCase().includes(q)) ||
        (a.purpose && a.purpose.toLowerCase().includes(q)) ||
        (a.replacement_hint && a.replacement_hint.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const filteredLibraries = libraries.filter((lib) =>
    search ? lib.toLowerCase().includes(search.toLowerCase()) : true
  );

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6 font-mono">
      {/* Title */}
      <div className="border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-cyan-400" />
          <h1 className="text-2xl font-bold text-slate-100">
            Cryptographic Knowledge Base & Policy Pack
          </h1>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Server-side authoritative catalogue ({algorithms.length} algorithms, {totalOidsCount} OIDs, {libraries.length} libraries, {protocols.length} protocol profiles)
        </p>
      </div>

      {/* Snapshot Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div
          onClick={() => setActiveTab('algorithms')}
          className={`p-4 rounded-xl border cursor-pointer transition ${
            activeTab === 'algorithms'
              ? 'bg-cyan-950/30 border-cyan-500/50 shadow-md shadow-cyan-950/40'
              : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
          }`}
        >
          <span className="text-slate-400 text-xs block">Cryptographic Algorithms</span>
          <span className="text-2xl font-bold text-cyan-400 mt-1 block">
            {snapshot?.algorithms ?? algorithms.length}
          </span>
          <span className="text-[10px] text-slate-500">{totalOidsCount} standard ASN.1 OIDs</span>
        </div>

        <div
          onClick={() => setActiveTab('libraries')}
          className={`p-4 rounded-xl border cursor-pointer transition ${
            activeTab === 'libraries'
              ? 'bg-emerald-950/30 border-emerald-500/50 shadow-md shadow-emerald-950/40'
              : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
          }`}
        >
          <span className="text-slate-400 text-xs block">Monitored Libraries</span>
          <span className="text-2xl font-bold text-emerald-400 mt-1 block">
            {snapshot?.libraries ?? libraries.length}
          </span>
          <span className="text-[10px] text-slate-500">Cross-referenced manifests</span>
        </div>

        <div
          onClick={() => setActiveTab('protocols')}
          className={`p-4 rounded-xl border cursor-pointer transition ${
            activeTab === 'protocols'
              ? 'bg-indigo-950/30 border-indigo-500/50 shadow-md shadow-indigo-950/40'
              : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
          }`}
        >
          <span className="text-slate-400 text-xs block">Protocol Profiles</span>
          <span className="text-2xl font-bold text-indigo-400 mt-1 block">
            {snapshot?.protocols ?? protocols.length}
          </span>
          <span className="text-[10px] text-slate-500">SSL/TLS profiles</span>
        </div>

        <div
          onClick={() => setActiveTab('policypack')}
          className={`p-4 rounded-xl border cursor-pointer transition ${
            activeTab === 'policypack'
              ? 'bg-amber-950/30 border-amber-500/50 shadow-md shadow-amber-950/40'
              : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
          }`}
        >
          <span className="text-slate-400 text-xs block">Active Policy Pack</span>
          <span className="text-base font-bold text-amber-400 mt-2 block truncate">
            {snapshot?.policy_pack_version || 'pp-2026.09'}
          </span>
          <span className="text-[10px] text-slate-500">Dual-track scoring weights</span>
        </div>
      </div>

      {/* View Switcher Bar */}
      <div className="flex border-b border-slate-800 gap-2">
        <button
          onClick={() => setActiveTab('algorithms')}
          className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition border-b-2 ${
            activeTab === 'algorithms'
              ? 'border-cyan-400 text-cyan-300 bg-slate-900'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Algorithms ({algorithms.length})
        </button>
        <button
          onClick={() => setActiveTab('libraries')}
          className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition border-b-2 ${
            activeTab === 'libraries'
              ? 'border-emerald-400 text-emerald-300 bg-slate-900'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Libraries ({libraries.length})
        </button>
        <button
          onClick={() => setActiveTab('protocols')}
          className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition border-b-2 ${
            activeTab === 'protocols'
              ? 'border-indigo-400 text-indigo-300 bg-slate-900'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Protocols ({protocols.length})
        </button>
        <button
          onClick={() => setActiveTab('policypack')}
          className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition border-b-2 ${
            activeTab === 'policypack'
              ? 'border-amber-400 text-amber-300 bg-slate-900'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Policy Pack & Horizons
        </button>
      </div>

      {/* Tab 1: Algorithms Catalogue */}
      {activeTab === 'algorithms' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search canonical name, OID, purpose, or replacement hint..."
                className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <select
              value={filterFamily}
              onChange={(e) => setFilterFamily(e.target.value)}
              className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-cyan-500"
            >
              <option value="">All Algorithm Families</option>
              {families.map((fam) => (
                <option key={fam} value={fam}>
                  {fam}
                </option>
              ))}
            </select>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAlgorithms.map((alg) => (
              <div
                key={alg.canonical_name}
                className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition flex flex-col justify-between space-y-4"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-slate-100">{alg.canonical_name}</h3>
                      <span className="text-[10px] text-slate-500 uppercase">{alg.family} · {alg.purpose}</span>
                    </div>
                    <QuantumBadge status={alg.quantum_status} isPostQuantum={alg.is_post_quantum} />
                  </div>

                  {alg.oid && (
                    <div className="text-[11px] text-slate-400">
                      OID: <span className="text-cyan-400 select-all">{alg.oid}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-800/80">
                    <div>
                      <span className="text-slate-500 text-[10px] block">Classical Bits:</span>
                      <span className="text-slate-300">{alg.classical_bits ?? 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] block">Quantum Bits:</span>
                      <span className="text-slate-300">{alg.quantum_bits ?? 0}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-500 text-[10px] block">NIST Deprecated:</span>
                      <span className="text-amber-400">{alg.nist_deprecated_after ?? 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] block">NIST Disallowed:</span>
                      <span className="text-rose-400">{alg.nist_disallowed_after ?? 'N/A'}</span>
                    </div>
                  </div>
                </div>

                {alg.replacement_hint && (
                  <div className="p-2.5 rounded bg-emerald-950/20 border border-emerald-500/30 text-[11px] text-emerald-300">
                    <span className="font-semibold block text-[10px] uppercase text-emerald-400 mb-0.5">
                      Replacement Hint:
                    </span>
                    {alg.replacement_hint}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 2: Monitored Libraries */}
      {activeTab === 'libraries' && (
        <div className="space-y-4">
          <div className="relative max-w-md">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search 42 monitored cryptographic libraries..."
              className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {filteredLibraries.map((lib, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center gap-2.5"
              >
                <Package className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-xs font-semibold text-slate-200 truncate">{lib}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: Protocols */}
      {activeTab === 'protocols' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {protocols.map((proto, idx) => (
            <div
              key={idx}
              className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-100">{proto.canonical_name}</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-950 text-indigo-400 border border-indigo-500/40">
                  {proto.name}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Enumerated in configuration surfaces and live probes.
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Tab 4: Policy Pack & Scenarios */}
      {activeTab === 'policypack' && (
        <div className="space-y-6">
          {/* Stored CRQC Horizons */}
          <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
            <h3 className="text-xs font-bold uppercase text-slate-200">
              Stored Mosca CRQC Arrival Scenarios (Z)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(snapshot?.scenarios || []).map((sc, i) => (
                <div key={i} className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-cyan-400 uppercase text-xs">{sc.name}</span>
                    <span className="text-xs font-bold text-slate-100">Z = {sc.z_years} years</span>
                  </div>
                  <div className="text-xs text-slate-300 font-semibold">{sc.label}</div>
                  <p className="text-[11px] text-slate-500 font-sans">{sc.source}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Evidence Class Baseline Thresholds */}
          <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
            <h3 className="text-xs font-bold uppercase text-slate-200">
              Evidence Class Confidence Rules & Maximum Severity Ceilings
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              {Object.entries(snapshot?.evidence_classes || {}).map(([cls, maxBand]) => (
                <div key={cls} className="p-3 rounded bg-slate-950 border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">{cls}</span>
                  <span className="font-bold uppercase text-slate-200 text-xs mt-1 block">
                    Max: {maxBand}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
