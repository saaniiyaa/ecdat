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
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-emerald-300 bg-emerald-50 text-emerald-800 font-bold text-xs select-none shadow-sm">
        <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
        <span>PQ Adopted</span>
      </span>
    );
  }

  if (norm === 'shor_vulnerable') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-rose-300 bg-rose-50 text-rose-800 font-bold text-xs select-none shadow-sm">
        <ShieldAlert className="w-3.5 h-3.5 shrink-0 text-rose-600" />
        <span>Shor Vulnerable</span>
      </span>
    );
  }

  if (norm === 'grover_affected') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-amber-300 bg-amber-50 text-amber-800 font-bold text-xs select-none shadow-sm">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
        <span>Grover Affected</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-slate-300 bg-slate-100 text-slate-700 font-bold text-xs select-none shadow-sm">
      <Atom className="w-3.5 h-3.5 shrink-0 text-slate-500" />
      <span>{status || 'Classical'}</span>
    </span>
  );
};
