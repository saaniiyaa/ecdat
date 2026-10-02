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
      <div className="max-w-7xl mx-auto p-12 text-center text-text-muted font-mono">
        Loading authoritative algorithm registry catalogue...
      </div>
    );
  }

  if (error || !registry) {
    return (
      <div className="max-w-4xl mx-auto p-8 rounded-card bg-danger-subtle border border-danger-border text-danger font-mono text-xs">
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
      <div className="border-b border-border pb-5">
        <div className="flex items-center gap-2.5">
          <BookOpen className="w-6 h-6 text-accent" />
          <h1 className="text-2xl font-bold text-text-main tracking-tight">
            Cryptographic Knowledge Base & Policy Pack
          </h1>
          <HelpTooltip
            title="Authoritative Crypto Registry"
            content="Built-in intelligence cataloging known algorithms, security bits, standard OIDs, NIST deprecation dates, and recommended post-quantum replacements."
          />
        </div>
        <p className="text-xs sm:text-sm text-text-muted mt-1">
          Authoritative enterprise catalogue ({algorithms.length} algorithms, {totalOidsCount} OIDs, {libraries.length} libraries, {protocols.length} protocol profiles).
        </p>
      </div>

      {/* Snapshot Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div
          onClick={() => setActiveTab('algorithms')}
          className={`p-5 rounded-card border cursor-pointer transition shadow-card ${
            activeTab === 'algorithms'
              ? 'bg-surface-2 border-accent text-accent'
              : 'bg-surface border-border hover:border-accent/40'
          }`}
        >
          <span className="text-text-muted text-xs block font-bold">Algorithms</span>
          <span className="text-2xl font-bold text-accent-2 mt-1 block tracking-tight font-mono">
            {snapshot?.algorithms ?? algorithms.length}
          </span>
          <span className="text-[11px] text-text-dim font-mono">{totalOidsCount} standard OIDs</span>
        </div>

        <div
          onClick={() => setActiveTab('libraries')}
          className={`p-5 rounded-card border cursor-pointer transition shadow-card ${
            activeTab === 'libraries'
              ? 'bg-surface-2 border-accent text-accent'
              : 'bg-surface border-border hover:border-accent/40'
          }`}
        >
          <span className="text-text-muted text-xs block font-bold">Monitored Libraries</span>
          <span className="text-2xl font-bold text-accent mt-1 block tracking-tight font-mono">
            {snapshot?.libraries ?? libraries.length}
          </span>
          <span className="text-[11px] text-text-dim">Cross-referenced manifests</span>
        </div>

        <div
          onClick={() => setActiveTab('protocols')}
          className={`p-5 rounded-card border cursor-pointer transition shadow-card ${
            activeTab === 'protocols'
              ? 'bg-surface-2 border-accent text-accent'
              : 'bg-surface border-border hover:border-accent/40'
          }`}
        >
          <span className="text-text-muted text-xs block font-bold">Protocol Profiles</span>
          <span className="text-2xl font-bold text-info mt-1 block tracking-tight font-mono">
            {snapshot?.protocols ?? protocols.length}
          </span>
          <span className="text-[11px] text-text-dim">SSL/TLS & IPsec</span>
        </div>

        <div
          onClick={() => setActiveTab('policypack')}
          className={`p-5 rounded-card border cursor-pointer transition shadow-card ${
            activeTab === 'policypack'
              ? 'bg-surface-2 border-accent text-accent'
              : 'bg-surface border-border hover:border-accent/40'
          }`}
        >
          <span className="text-text-muted text-xs block font-bold">Active Policy Pack</span>
          <span className="text-base font-bold text-warning mt-2 block truncate font-mono">
            {snapshot?.policy_pack_version || 'pp-2026.09'}
          </span>
          <span className="text-[10px] text-text-dim">Dual-track scoring weights</span>
        </div>
      </div>

      {/* View Switcher Tabs */}
      <div className="flex border-b border-border gap-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('algorithms')}
          className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition border-b-2 cursor-pointer ${
            activeTab === 'algorithms'
              ? 'border-accent text-accent bg-surface-2'
              : 'border-transparent text-text-muted hover:text-text-main'
          }`}
        >
          Algorithms ({algorithms.length})
        </button>
        <button
          onClick={() => setActiveTab('libraries')}
          className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition border-b-2 cursor-pointer ${
            activeTab === 'libraries'
              ? 'border-accent text-accent bg-surface-2'
              : 'border-transparent text-text-muted hover:text-text-main'
          }`}
        >
          Libraries ({libraries.length})
        </button>
        <button
          onClick={() => setActiveTab('protocols')}
          className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition border-b-2 cursor-pointer ${
            activeTab === 'protocols'
              ? 'border-accent text-accent bg-surface-2'
              : 'border-transparent text-text-muted hover:text-text-main'
          }`}
        >
          Protocols ({protocols.length})
        </button>
        <button
          onClick={() => setActiveTab('policypack')}
          className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition border-b-2 cursor-pointer ${
            activeTab === 'policypack'
              ? 'border-accent text-accent bg-surface-2'
              : 'border-transparent text-text-muted hover:text-text-main'
          }`}
        >
          Policy Pack & Horizons
        </button>
      </div>

      {/* Tab 1: Algorithms Catalogue */}
      {activeTab === 'algorithms' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="p-4 rounded-card bg-surface border border-border flex flex-col sm:flex-row gap-3 shadow-card">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-text-dim absolute left-3 top-3 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search canonical name, OID, purpose, or replacement hint..."
                className="w-full pl-9 pr-3 py-2 bg-surface-2 border border-border rounded-xl text-xs font-semibold text-text-main placeholder:text-text-dim focus:outline-none focus:border-accent"
              />
            </div>

            <select
              value={filterFamily}
              onChange={(e) => setFilterFamily(e.target.value)}
              className="px-3 py-2 bg-surface-2 border border-border rounded-xl text-xs font-semibold text-text-main focus:outline-none focus:border-accent cursor-pointer"
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
                className="p-5 rounded-card bg-surface border border-border hover:border-accent/40 transition flex flex-col justify-between space-y-4 shadow-card group"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-text-main group-hover:text-accent transition-colors">
                        {alg.canonical_name}
                      </h3>
                      <span className="text-[10px] text-text-dim uppercase font-mono font-semibold">
                        {alg.family} · {alg.purpose}
                      </span>
                    </div>
                    <QuantumBadge status={alg.quantum_status} isPostQuantum={alg.is_post_quantum} />
                  </div>

                  {alg.oid && (
                    <div className="text-[11px] text-text-muted font-mono">
                      OID: <span className="text-accent font-bold select-all">{alg.oid}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-border font-mono">
                    <div>
                      <span className="text-text-dim text-[10px] block font-sans font-semibold">Classical Bits:</span>
                      <span className="text-text-main font-semibold">{alg.classical_bits ?? 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-text-dim text-[10px] block font-sans font-semibold">Quantum Bits:</span>
                      <span className="text-accent-2 font-semibold">{alg.quantum_bits ?? 0}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                    <div>
                      <span className="text-text-dim text-[10px] block font-sans font-semibold">NIST Deprecated:</span>
                      <span className="text-warning font-semibold">{alg.nist_deprecated_after ?? 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-text-dim text-[10px] block font-sans font-semibold">NIST Disallowed:</span>
                      <span className="text-danger font-semibold">{alg.nist_disallowed_after ?? 'N/A'}</span>
                    </div>
                  </div>
                </div>

                {alg.replacement_hint && (
                  <div className="p-3 rounded-xl bg-accent-subtle border border-accent-border text-xs text-text-main space-y-1">
                    <span className="font-bold text-[10px] uppercase text-accent flex items-center gap-1 font-sans">
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
            <Search className="w-4 h-4 text-text-dim absolute left-3 top-3 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search 42 monitored cryptographic libraries..."
              className="w-full pl-9 pr-3 py-2 bg-surface border border-border rounded-xl text-xs font-semibold text-text-main focus:outline-none focus:border-accent"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {filteredLibraries.map((lib, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-xl bg-surface border border-border flex items-center gap-2.5 shadow-sm hover:border-accent/40 transition"
              >
                <Package className="w-4 h-4 text-accent shrink-0" />
                <span className="text-xs font-bold text-text-main truncate font-mono">{lib}</span>
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
              className="p-4 rounded-card bg-surface border border-border space-y-2 shadow-card"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-text-main">{proto.canonical_name}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent-2-subtle text-accent-2 border border-accent-2-border font-mono font-bold">
                  {proto.name}
                </span>
              </div>
              <p className="text-xs text-text-muted">
                Enumerated in configuration surfaces and live probes.
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Tab 4: Policy Pack & Scenarios */}
      {activeTab === 'policypack' && (
        <div className="space-y-6">
          <div className="p-6 rounded-card bg-surface border border-border shadow-card space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-text-main">
              Stored Mosca CRQC Arrival Scenarios (Z)
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(snapshot?.scenarios || []).map((sc, i) => (
                <div key={i} className="p-4 rounded-xl bg-surface-2 border border-border space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-accent uppercase text-xs">{sc.name}</span>
                    <span className="text-xs font-mono font-bold text-text-main">Z = {sc.z_years} years</span>
                  </div>
                  <div className="text-xs text-text-main font-semibold">{sc.label}</div>
                  <p className="text-[11px] text-text-muted">{sc.source}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="p-6 rounded-card bg-surface border border-border shadow-card space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-text-main">
              Evidence Class Confidence Rules & Severity Ceilings
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              {Object.entries(snapshot?.evidence_classes || {}).map(([cls, maxBand]) => (
                <div key={cls} className="p-3 rounded-xl bg-surface-2 border border-border">
                  <span className="text-text-dim block text-[10px] font-mono">{cls}</span>
                  <span className="font-bold uppercase text-text-main text-xs mt-1 block">
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
