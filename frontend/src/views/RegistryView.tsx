import React, { useState } from 'react';
import { useRegistry } from '../context/RegistryContext';
import { QuantumBadge } from '../components/common/QuantumBadge';
import {
  BookOpen,
  Search,
  Shield,
  Layers,
  FileText,
  Calendar,
  Sparkles,
} from 'lucide-react';

export const RegistryView: React.FC = () => {
  const { registry, loading, error } = useRegistry();
  const [search, setSearch] = useState('');
  const [filterFamily, setFilterFamily] = useState('');

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto p-12 text-center text-slate-500 font-mono">
        Loading algorithm registry catalogue...
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
  const families = Array.from(new Set(algorithms.map((a) => a.family))).filter(Boolean);

  const filtered = algorithms.filter((a) => {
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
          Server-side authoritative catalogue ({algorithms.length} algorithms, {Object.keys(registry.oids || {}).length} OIDs, {Object.keys(registry.libraries || {}).length} libraries)
        </p>
      </div>

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
        {filtered.map((alg) => (
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
  );
};
