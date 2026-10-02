import React from 'react';
import { EvidenceClass } from '../../types/api';
import { ShieldAlert, CheckCircle2, Search, Cpu } from 'lucide-react';

interface EvidenceBadgeProps {
  evidenceClass: EvidenceClass | string;
  confidence?: number;
  cappedByConfidence?: boolean;
}

export const EvidenceBadge: React.FC<EvidenceBadgeProps> = ({
  evidenceClass,
  confidence,
  cappedByConfidence,
}) => {
  const norm = (evidenceClass || '').toUpperCase();

  const getDetails = () => {
    switch (norm) {
      case 'PARSED_STRUCTURE':
        return {
          label: 'Parsed Structure',
          range: '0.94–0.98',
          icon: CheckCircle2,
          color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
          desc: 'AST / X.509 / Manifest structure (High confidence)',
        };
      case 'SYMBOL_INFERRED':
        return {
          label: 'Symbol Inferred',
          range: '0.70',
          icon: Cpu,
          color: 'text-sky-400 bg-sky-500/10 border-sky-500/25',
          desc: 'Binary symbol table linkage',
        };
      case 'INFERRED':
        return {
          label: 'Inferred',
          range: '0.55–0.70',
          icon: Search,
          color: 'text-violet-400 bg-violet-500/10 border-violet-500/25',
          desc: 'Constant / Parameter inference',
        };
      case 'PATTERN':
      default:
        return {
          label: 'Pattern Match',
          range: '0.50',
          icon: Search,
          color: 'text-amber-400 bg-amber-500/10 border-amber-500/25',
          desc: 'Conservative regex text match',
        };
    }
  };

  const info = getDetails();
  const Icon = info.icon;

  return (
    <div className="inline-flex items-center gap-1.5 flex-wrap">
      <span
        title={`${info.desc} (Expected confidence: ${info.range})`}
        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md border text-xs font-medium ${info.color}`}
      >
        <Icon className="w-3.5 h-3.5" />
        <span>{info.label}</span>
        {confidence !== undefined && (
          <span className="opacity-75 text-[11px]">({Math.round(confidence * 100)}%)</span>
        )}
      </span>

      {cappedByConfidence && (
        <span
          title="Pattern and inferred findings are capped below critical severity to prevent false positives"
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-300 text-[11px] font-medium"
        >
          <ShieldAlert className="w-3 h-3 text-amber-400" />
          <span>Capped By Confidence</span>
        </span>
      )}
    </div>
  );
};
