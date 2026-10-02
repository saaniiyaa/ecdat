import React from 'react';
import { Band } from '../../types/api';

interface BandBadgeProps {
  band: Band | string;
  size?: 'sm' | 'md' | 'lg';
  showCount?: number;
}

export const BAND_COLORS: Record<string, { bg: string; text: string; border: string; dot: string; hex: string }> = {
  critical: { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/30', dot: 'bg-rose-500', hex: '#f43f5e' },
  high: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30', dot: 'bg-amber-500', hex: '#f59e0b' },
  medium: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30', dot: 'bg-blue-500', hex: '#3b82f6' },
  low: { bg: 'bg-slate-500/15', text: 'text-slate-300', border: 'border-slate-600/40', dot: 'bg-slate-400', hex: '#64748b' },
  informational: { bg: 'bg-slate-500/10', text: 'text-slate-400', border: 'border-slate-700/50', dot: 'bg-slate-500', hex: '#94a3b8' },
};

export const BandBadge: React.FC<BandBadgeProps> = ({ band, size = 'md', showCount }) => {
  const norm = (band || 'informational').toLowerCase();
  const theme = BAND_COLORS[norm] || BAND_COLORS.informational;

  const sizeClass =
    size === 'sm'
      ? 'text-[11px] px-2 py-0.5'
      : size === 'lg'
      ? 'text-xs px-3 py-1 font-semibold'
      : 'text-xs px-2.5 py-0.5 font-medium';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border font-medium ${theme.bg} ${theme.text} ${theme.border} ${sizeClass}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${theme.dot}`} />
      <span>{band}</span>
      {showCount !== undefined && (
        <span className="ml-1 px-1.5 py-0.2 rounded bg-slate-900/70 font-semibold text-slate-200 text-[11px]">
          {showCount}
        </span>
      )}
    </span>
  );
};

