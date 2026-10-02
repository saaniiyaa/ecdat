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
          color: 'text-accent bg-accent-subtle border-accent-border',
          desc: 'AST / X.509 / Manifest structure (High confidence)',
        };
      case 'SYMBOL_INFERRED':
        return {
          label: 'Symbol Inferred',
          range: '0.70',
          icon: Cpu,
          color: 'text-accent-2 bg-accent-2-subtle border-accent-2-border',
          desc: 'Binary symbol table linkage',
        };
      case 'INFERRED':
        return {
          label: 'Inferred',
          range: '0.55–0.70',
          icon: Search,
          color: 'text-info bg-info-subtle border-info-border',
          desc: 'Constant / Parameter inference',
        };
      case 'PATTERN':
      default:
        return {
          label: 'Pattern Match',
          range: '0.50',
          icon: Search,
          color: 'text-warning bg-warning-subtle border-warning-border',
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
        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-xs font-semibold ${info.color}`}
      >
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span>{info.label}</span>
        {confidence !== undefined && (
          <span className="font-mono text-[10px] opacity-90 font-bold">
            ({Math.round(confidence * 100)}%)
          </span>
        )}
      </span>

      {cappedByConfidence && (
        <span
          title="Pattern and inferred findings are capped below critical severity to prevent false positives"
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-warning-border bg-warning-subtle text-warning text-[10px] font-bold font-mono"
        >
          <ShieldAlert className="w-3 h-3 shrink-0" />
          <span>Capped</span>
        </span>
      )}
    </div>
  );
};
