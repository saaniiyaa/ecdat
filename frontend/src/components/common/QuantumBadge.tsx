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
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-accent-border bg-accent-subtle text-accent font-semibold text-xs select-none">
        <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
        <span>PQ Adopted</span>
      </span>
    );
  }

  if (norm === 'shor_vulnerable') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-danger-border bg-danger-subtle text-danger font-semibold text-xs select-none">
        <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
        <span>Shor Vulnerable</span>
      </span>
    );
  }

  if (norm === 'grover_affected') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-warning-border bg-warning-subtle text-warning font-semibold text-xs select-none">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        <span>Grover Affected</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-border bg-surface-2 text-text-muted font-semibold text-xs select-none">
      <Atom className="w-3.5 h-3.5 shrink-0" />
      <span>{status || 'Classical'}</span>
    </span>
  );
};
