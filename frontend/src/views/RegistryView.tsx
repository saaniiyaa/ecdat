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
      <div className="max-w-4xl mx-auto p-8 rounded-xl bg-rose-50 border border-rose-200/60 text-rose-700 font-mono text-xs">
        Failed to load algorithm registry: {error}
      </div>
    );
  }

  const algorithms = registry.algorithms || [];
  const libraries = Array.isArray(registry.libraries) ? registry.libraries : [];
  const protocols = Array.isArray(registry.protocols) ? registry.protocols : [];
  const snapshot = registry.snapshot;
  const policyPack = registry.policy_pack;

  // Derive unique OIDs from algorithms. Count what the server actually
  // returned - never substitute a hardcoded total, which silently lies as soon
  // as the registry grows.
  const oidsFound = Array.from(new Set(algorithms.map((a) => a.oid).filter(Boolean)));
  const totalOidsCount = oidsFound.length;

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
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Title */}
      <div className="border-b border-slate-200 pb-5">
        <div className="flex items-center gap-2.5">
          <BookOpen className="w-6 h-6 text-indigo-600" />
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Cryptographic Knowledge Base & Policy Pack
          </h1>
        </div>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          Authoritative enterprise catalogue ({algorithms.length} algorithms, {totalOidsCount} OIDs, {libraries.length} libraries, {protocols.length} protocol profiles)
        </p>
      </div>

      {/* Snapshot Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div
          onClick={() => setActiveTab('algorithms')}
          className={`p-5 rounded-2xl border cursor-pointer transition shadow-sm ${
            activeTab === 'algorithms'
              ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
              : 'bg-white border-slate-200/80 hover:border-slate-300 text-slate-700'
          }`}
        >
          <span className="text-slate-500 text-xs block font-medium">Cryptographic Algorithms</span>
          <span className="text-2xl font-bold text-indigo-600 mt-1 block tracking-tight font-mono">
            {snapshot?.algorithms ?? algorithms.length}
          </span>
          <span className="text-[11px] text-slate-500">{totalOidsCount} standard ASN.1 OIDs</span>
        </div>

        <div
          onClick={() => setActiveTab('libraries')}
          className={`p-5 rounded-2xl border cursor-pointer transition shadow-sm ${
            activeTab === 'libraries'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
              : 'bg-white border-slate-200/80 hover:border-slate-300 text-slate-700'
          }`}
        >
          <span className="text-slate-500 text-xs block font-medium">Monitored Libraries</span>
          <span className="text-2xl font-bold text-emerald-600 mt-1 block tracking-tight font-mono">
            {snapshot?.libraries ?? libraries.length}
          </span>
          <span className="text-[11px] text-slate-500">Cross-referenced manifests</span>
        </div>

        <div
          onClick={() => setActiveTab('protocols')}
          className={`p-5 rounded-2xl border cursor-pointer transition shadow-sm ${
            activeTab === 'protocols'
              ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
              : 'bg-white border-slate-200/80 hover:border-slate-300 text-slate-700'
          }`}
        >
          <span className="text-slate-500 text-xs block font-medium">Protocol Profiles</span>
          <span className="text-2xl font-bold text-indigo-600 mt-1 block tracking-tight font-mono">
            {snapshot?.protocols ?? protocols.length}
          </span>
          <span className="text-[11px] text-slate-500">SSL/TLS profiles</span>
        </div>

        <div
          onClick={() => setActiveTab('policypack')}
          className={`p-5 rounded-2xl border cursor-pointer transition shadow-sm ${
            activeTab === 'policypack'
              ? 'bg-amber-50 border-amber-300 text-amber-700'
              : 'bg-white border-slate-200/80 hover:border-slate-300 text-slate-700'
          }`}
        >
          <span className="text-slate-500 text-xs block font-medium">Active Policy Pack</span>
          <span className="text-base font-bold text-amber-600 mt-2 block truncate">
            {snapshot?.policy_pack_version || 'pp-2026.09'}
          </span>
          <span className="text-[10px] text-slate-500">Dual-track scoring weights</span>
        </div>
      </div>

      {/* View Switcher Bar */}
      <div className="flex border-b border-slate-200 gap-2">
        <button
          onClick={() => setActiveTab('algorithms')}
          className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition border-b-2 ${
            activeTab === 'algorithms'
              ? 'border-indigo-500 text-indigo-700 bg-indigo-50'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100'
          }`}
        >
          Algorithms ({algorithms.length})
        </button>
        <button
          onClick={() => setActiveTab('libraries')}
          className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition border-b-2 ${
            activeTab === 'libraries'
              ? 'border-emerald-500 text-emerald-700 bg-emerald-50'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100'
          }`}
        >
          Libraries ({libraries.length})
        </button>
        <button
          onClick={() => setActiveTab('protocols')}
          className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition border-b-2 ${
            activeTab === 'protocols'
              ? 'border-indigo-500 text-indigo-700 bg-indigo-50'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100'
          }`}
        >
          Protocols ({protocols.length})
        </button>
        <button
          onClick={() => setActiveTab('policypack')}
          className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition border-b-2 ${
            activeTab === 'policypack'
              ? 'border-amber-500 text-amber-700 bg-amber-50'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100'
          }`}
        >
          Policy Pack & Horizons
        </button>
      </div>

      {/* Tab 1: Algorithms Catalogue */}
      {activeTab === 'algorithms' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="p-4 rounded-xl bg-white border border-slate-200 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search canonical name, OID, purpose, or replacement hint..."
                className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <select
              value={filterFamily}
              onChange={(e) => setFilterFamily(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-700 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
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
                className="p-5 rounded-xl bg-white border border-slate-200 hover:border-slate-300 shadow-sm transition flex flex-col justify-between space-y-4"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">{alg.canonical_name}</h3>
                      <span className="text-[10px] text-slate-500 uppercase">{alg.family} · {alg.purpose}</span>
                    </div>
                    <QuantumBadge status={alg.quantum_status} isPostQuantum={alg.is_post_quantum} />
                  </div>

                  {alg.oid && (
                    <div className="text-[11px] text-slate-500">
                      OID: <span className="text-indigo-600 select-all">{alg.oid}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-100">
                    <div>
                      <span className="text-slate-500 text-[10px] block">Classical Bits:</span>
                      <span className="text-slate-700">{alg.classical_bits ?? 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] block">Quantum Bits:</span>
                      <span className="text-slate-700">{alg.quantum_bits ?? 0}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-500 text-[10px] block">NIST Deprecated:</span>
                      <span className="text-amber-600">{alg.nist_deprecated_after ?? 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] block">NIST Disallowed:</span>
                      <span className="text-rose-600">{alg.nist_disallowed_after ?? 'N/A'}</span>
                    </div>
                  </div>
                </div>

                {alg.replacement_hint && (
                  <div className="p-2.5 rounded bg-emerald-50 border border-emerald-200/60 text-[11px] text-emerald-700">
                    <span className="font-semibold block text-[10px] uppercase text-emerald-600 mb-0.5">
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
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search 42 monitored cryptographic libraries..."
              className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {filteredLibraries.map((lib, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-lg bg-white border border-slate-200 flex items-center gap-2.5"
              >
                <Package className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="text-xs font-semibold text-slate-800 truncate">{lib}</span>
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
              className="p-4 rounded-xl bg-white border border-slate-200 space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-900">{proto.canonical_name}</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-50 text-indigo-600 border border-indigo-200">
                  {proto.name}
                </span>
              </div>
              <p className="text-xs text-slate-500">
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
          <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-4">
            <h3 className="text-xs font-bold uppercase text-slate-800">
              Stored Mosca CRQC Arrival Scenarios (Z)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(snapshot?.scenarios || []).map((sc, i) => (
                <div key={i} className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-indigo-600 uppercase text-xs">{sc.name}</span>
                    <span className="text-xs font-bold text-slate-800">Z = {sc.z_years} years</span>
                  </div>
                  <div className="text-xs text-slate-700 font-semibold">{sc.label}</div>
                  <p className="text-[11px] text-slate-500 font-sans">{sc.source}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Evidence Class Baseline Thresholds */}
          <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-3">
            <h3 className="text-xs font-bold uppercase text-slate-800">
              Evidence Class Confidence Rules & Maximum Severity Ceilings
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              {Object.entries(snapshot?.evidence_classes || {}).map(([cls, maxBand]) => (
                <div key={cls} className="p-3 rounded bg-slate-50 border border-slate-200">
                  <span className="text-slate-500 block text-[10px]">{cls}</span>
                  <span className="font-bold uppercase text-slate-800 text-xs mt-1 block">
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
