import React, { useState } from 'react';
import { useRegistry } from '../context/RegistryContext';
import { QuantumBadge } from '../components/common/QuantumBadge';
import { HelpTooltip } from '../components/common/HelpTooltip';
import {
  BookOpen,
  Search,
  Layers,
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
      <div className="max-w-4xl mx-auto p-8 rounded-2xl bg-rose-50 border border-rose-300 text-rose-800 font-mono text-xs">
        Failed to load algorithm registry: {error}
      </div>
    );
  }

  const algorithms = registry.algorithms || [];
  const libraries = Array.isArray(registry.libraries) ? registry.libraries : [];
  const protocols = Array.isArray(registry.protocols) ? registry.protocols : [];
  const snapshot = registry.snapshot;

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
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6 animate-in fade-in duration-200">
      {/* Title */}
      <div className="border-b border-slate-200 pb-5">
        <div className="flex items-center gap-2.5">
          <BookOpen className="w-6 h-6 text-indigo-600" />
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Cryptographic Knowledge Base & Policy Pack
          </h1>
          <HelpTooltip
            title="Authoritative Crypto Registry"
            content="Built-in intelligence cataloging known algorithms, security bits, standard OIDs, NIST deprecation dates, and recommended post-quantum replacements."
          />
        </div>
        <p className="text-xs sm:text-sm text-slate-600 mt-1">
          Authoritative enterprise catalogue ({algorithms.length} algorithms, {totalOidsCount} OIDs, {libraries.length} libraries, {protocols.length} protocol profiles).
        </p>
      </div>

      {/* Snapshot Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div
          onClick={() => setActiveTab('algorithms')}
          className={`p-5 rounded-2xl border cursor-pointer transition shadow-sm ${
            activeTab === 'algorithms'
              ? 'bg-indigo-50/60 border-indigo-600 text-indigo-700'
              : 'bg-white border-slate-300 hover:border-indigo-300 text-slate-800'
          }`}
        >
          <span className="text-slate-600 text-xs block font-bold">Algorithms</span>
          <span className="text-2xl font-bold text-indigo-700 mt-1 block tracking-tight font-mono">
            {snapshot?.algorithms ?? algorithms.length}
          </span>
          <span className="text-[11px] text-slate-500 font-mono">{totalOidsCount} standard OIDs</span>
        </div>

        <div
          onClick={() => setActiveTab('libraries')}
          className={`p-5 rounded-2xl border cursor-pointer transition shadow-sm ${
            activeTab === 'libraries'
              ? 'bg-indigo-50/60 border-indigo-600 text-indigo-700'
              : 'bg-white border-slate-300 hover:border-indigo-300 text-slate-800'
          }`}
        >
          <span className="text-slate-600 text-xs block font-bold">Monitored Libraries</span>
          <span className="text-2xl font-bold text-emerald-700 mt-1 block tracking-tight font-mono">
            {snapshot?.libraries ?? libraries.length}
          </span>
          <span className="text-[11px] text-slate-500">Cross-referenced manifests</span>
        </div>

        <div
          onClick={() => setActiveTab('protocols')}
          className={`p-5 rounded-2xl border cursor-pointer transition shadow-sm ${
            activeTab === 'protocols'
              ? 'bg-indigo-50/60 border-indigo-600 text-indigo-700'
              : 'bg-white border-slate-300 hover:border-indigo-300 text-slate-800'
          }`}
        >
          <span className="text-slate-600 text-xs block font-bold">Protocol Profiles</span>
          <span className="text-2xl font-bold text-blue-700 mt-1 block tracking-tight font-mono">
            {snapshot?.protocols ?? protocols.length}
          </span>
          <span className="text-[11px] text-slate-500">SSL/TLS & IPsec</span>
        </div>

        <div
          onClick={() => setActiveTab('policypack')}
          className={`p-5 rounded-2xl border cursor-pointer transition shadow-sm ${
            activeTab === 'policypack'
              ? 'bg-indigo-50/60 border-indigo-600 text-indigo-700'
              : 'bg-white border-slate-300 hover:border-indigo-300 text-slate-800'
          }`}
        >
          <span className="text-slate-600 text-xs block font-bold">Active Policy Pack</span>
          <span className="text-base font-bold text-amber-700 mt-2 block truncate font-mono">
            {snapshot?.policy_pack_version || 'pp-2026.09'}
          </span>
          <span className="text-[10px] text-slate-500">Dual-track scoring weights</span>
        </div>
      </div>

      {/* View Switcher Tabs */}
      <div className="flex border-b border-slate-200 gap-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('algorithms')}
          className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition border-b-2 cursor-pointer ${
            activeTab === 'algorithms'
              ? 'border-indigo-600 text-indigo-700 bg-white shadow-sm'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          Algorithms ({algorithms.length})
        </button>
        <button
          onClick={() => setActiveTab('libraries')}
          className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition border-b-2 cursor-pointer ${
            activeTab === 'libraries'
              ? 'border-indigo-600 text-indigo-700 bg-white shadow-sm'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          Libraries ({libraries.length})
        </button>
        <button
          onClick={() => setActiveTab('protocols')}
          className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition border-b-2 cursor-pointer ${
            activeTab === 'protocols'
              ? 'border-indigo-600 text-indigo-700 bg-white shadow-sm'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          Protocols ({protocols.length})
        </button>
        <button
          onClick={() => setActiveTab('policypack')}
          className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition border-b-2 cursor-pointer ${
            activeTab === 'policypack'
              ? 'border-indigo-600 text-indigo-700 bg-white shadow-sm'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          Policy Pack & Horizons
        </button>
      </div>

      {/* Tab 1: Algorithms Catalogue */}
      {activeTab === 'algorithms' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="p-4 rounded-2xl bg-white border border-slate-300 flex flex-col sm:flex-row gap-3 shadow-sm">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search canonical name, OID, purpose, or replacement hint..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-600 focus:bg-white"
              />
            </div>

            <select
              value={filterFamily}
              onChange={(e) => setFilterFamily(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-indigo-600 focus:bg-white cursor-pointer"
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
                className="p-5 rounded-2xl bg-white border border-slate-300 hover:border-indigo-400 transition flex flex-col justify-between space-y-4 shadow-sm group"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                        {alg.canonical_name}
                      </h3>
                      <span className="text-[10px] text-slate-500 uppercase font-mono font-semibold">
                        {alg.family} · {alg.purpose}
                      </span>
                    </div>
                    <QuantumBadge status={alg.quantum_status} isPostQuantum={alg.is_post_quantum} />
                  </div>

                  {alg.oid && (
                    <div className="text-[11px] text-slate-600 font-mono">
                      OID: <span className="text-indigo-700 font-bold select-all">{alg.oid}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-200 font-mono">
                    <div>
                      <span className="text-slate-500 text-[10px] block font-sans font-semibold">Classical Bits:</span>
                      <span className="text-slate-900 font-semibold">{alg.classical_bits ?? 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] block font-sans font-semibold">Quantum Bits:</span>
                      <span className="text-blue-700 font-semibold">{alg.quantum_bits ?? 0}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                    <div>
                      <span className="text-slate-500 text-[10px] block font-sans font-semibold">NIST Deprecated:</span>
                      <span className="text-amber-700 font-semibold">{alg.nist_deprecated_after ?? 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] block font-sans font-semibold">NIST Disallowed:</span>
                      <span className="text-rose-700 font-semibold">{alg.nist_disallowed_after ?? 'N/A'}</span>
                    </div>
                  </div>
                </div>

                {alg.replacement_hint && (
                  <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-xs text-indigo-950 space-y-1">
                    <span className="font-bold text-[10px] uppercase text-indigo-700 flex items-center gap-1 font-sans">
                      <CheckCircle className="w-3.5 h-3.5" /> Replacement Hint:
                    </span>
                    <p className="font-mono text-xs">{alg.replacement_hint}</p>
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
              className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-indigo-600 placeholder:text-slate-400"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {filteredLibraries.map((lib, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-xl bg-white border border-slate-300 flex items-center gap-2.5 shadow-sm hover:border-indigo-400 transition"
              >
                <Package className="w-4 h-4 text-indigo-600 shrink-0" />
                <span className="text-xs font-bold text-slate-900 truncate font-mono">{lib}</span>
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
              className="p-4 rounded-2xl bg-white border border-slate-300 space-y-2 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-900">{proto.canonical_name}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-mono font-bold">
                  {proto.name}
                </span>
              </div>
              <p className="text-xs text-slate-600">
                Enumerated in configuration surfaces and live probes.
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Tab 4: Policy Pack & Scenarios */}
      {activeTab === 'policypack' && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-white border border-slate-300 shadow-sm space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900">
              Stored Mosca CRQC Arrival Scenarios (Z)
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(snapshot?.scenarios || []).map((sc, i) => (
                <div key={i} className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-indigo-700 uppercase text-xs">{sc.name}</span>
                    <span className="text-xs font-mono font-bold text-slate-900">Z = {sc.z_years} years</span>
                  </div>
                  <div className="text-xs text-slate-900 font-semibold">{sc.label}</div>
                  <p className="text-[11px] text-slate-500">{sc.source}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-white border border-slate-300 shadow-sm space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900">
              Evidence Class Confidence Rules & Severity Ceilings
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              {Object.entries(snapshot?.evidence_classes || {}).map(([cls, maxBand]) => (
                <div key={cls} className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-slate-500 block text-[10px] font-mono">{cls}</span>
                  <span className="font-bold uppercase text-slate-900 text-xs mt-1 block">
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
