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
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-emerald-200/60 bg-emerald-50 text-emerald-700 font-medium text-xs">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
        <span>PQ Adopted</span>
      </span>
    );
  }

  if (norm === 'shor_vulnerable') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-rose-200/60 bg-rose-50 text-rose-700 font-medium text-xs">
        <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
        <span>Shor Vulnerable</span>
      </span>
    );
  }

  if (norm === 'grover_affected') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-amber-200/60 bg-amber-50 text-amber-700 font-medium text-xs">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
        <span>Grover Affected</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-slate-600 font-medium text-xs">
      <Atom className="w-3.5 h-3.5 text-slate-400" />
      <span>{status || 'Classical'}</span>
    </span>
  );
};
