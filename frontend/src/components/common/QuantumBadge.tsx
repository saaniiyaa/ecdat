import React from 'react';
import { Atom, ShieldCheck, AlertTriangle, ShieldX } from 'lucide-react';

interface QuantumBadgeProps {
  status?: string | null;
  isPostQuantum?: boolean;
}

export const QuantumBadge: React.FC<QuantumBadgeProps> = ({ status, isPostQuantum }) => {
  const norm = (status || '').toLowerCase();

  if (isPostQuantum || norm === 'post_quantum_standard' || norm === 'quantum_resistant') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded border border-emerald-500/40 bg-emerald-950/30 text-emerald-400 font-mono text-xs">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
        <span>PQ Adopted</span>
      </span>
    );
  }

  if (norm === 'shor_vulnerable') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded border border-rose-500/50 bg-rose-950/40 text-rose-400 font-mono text-xs font-semibold animate-pulse">
        <ShieldX className="w-3.5 h-3.5 text-rose-400" />
        <span>Shor Vulnerable</span>
      </span>
    );
  }

  if (norm === 'grover_affected') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded border border-amber-500/40 bg-amber-950/30 text-amber-400 font-mono text-xs">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
        <span>Grover Affected</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-slate-700 bg-slate-900/40 text-slate-400 font-mono text-xs">
      <Atom className="w-3.5 h-3.5" />
      <span>{status || 'Classical'}</span>
    </span>
  );
};
