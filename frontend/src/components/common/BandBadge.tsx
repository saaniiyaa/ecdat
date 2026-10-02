import React from 'react';
import { Band } from '../../types/api';

interface BandBadgeProps {
  band: Band | string;
  size?: 'sm' | 'md' | 'lg';
  showCount?: number;
}

export const BAND_COLORS: Record<string, { bg: string; text: string; border: string; dot: string; hex: string }> = {
  critical: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200/60', dot: 'bg-rose-500', hex: '#e11d48' },
  high: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200/60', dot: 'bg-amber-500', hex: '#d97706' },
  medium: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200/60', dot: 'bg-blue-500', hex: '#2563eb' },
  low: { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200', dot: 'bg-slate-400', hex: '#64748b' },
  informational: { bg: 'bg-slate-50', text: 'text-slate-500', border: 'border-slate-200', dot: 'bg-slate-400', hex: '#94a3b8' },
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
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${theme.bg} ${theme.text} ${theme.border} ${sizeClass}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${theme.dot}`} />
      <span>{band}</span>
      {showCount !== undefined && (
        <span className="ml-1 px-1.5 py-0.2 rounded-full bg-white font-semibold text-slate-700 text-[11px] border border-slate-200">
          {showCount}
        </span>
      )}
    </span>
  );
};
