import React from 'react';
import { Atom, ShieldCheck, AlertTriangle, ShieldAlert } from 'lucide-react';

interface QuantumBadgeProps {
  status?: string | null;
  isPostQuantum?: boolean;
}

export const QuantumBadge: React.FC<QuantumBadgeProps> = ({ status, isPostQuantum }) => {
  const norm = (status || '').toLowerCase();

  if (isPostQuantum || norm === 'post_quantum_standard' || norm === 'quantum_resistant') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-medium text-xs">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
        <span>PQ Adopted</span>
      </span>
    );
  }

  if (norm === 'shor_vulnerable') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md border border-rose-500/30 bg-rose-500/10 text-rose-400 font-medium text-xs">
        <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
        <span>Shor Vulnerable</span>
      </span>
    );
  }

  if (norm === 'grover_affected') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-400 font-medium text-xs">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
        <span>Grover Affected</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-slate-700/60 bg-slate-800/50 text-slate-300 font-medium text-xs">
      <Atom className="w-3.5 h-3.5 text-slate-400" />
      <span>{status || 'Classical'}</span>
    </span>
  );
};

