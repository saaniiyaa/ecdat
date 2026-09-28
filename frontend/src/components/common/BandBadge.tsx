import React from 'react';
import { Band } from '../../types/api';

interface BandBadgeProps {
  band: Band | string;
  size?: 'sm' | 'md' | 'lg';
  showCount?: number;
}

export const BAND_COLORS: Record<string, { bg: string; text: string; border: string; hex: string }> = {
  critical: { bg: 'bg-[#b4232c]/15', text: 'text-red-400', border: 'border-[#b4232c]/50', hex: '#b4232c' },
  high: { bg: 'bg-[#d97706]/15', text: 'text-amber-400', border: 'border-[#d97706]/50', hex: '#d97706' },
  medium: { bg: 'bg-[#2563eb]/15', text: 'text-blue-400', border: 'border-[#2563eb]/50', hex: '#2563eb' },
  low: { bg: 'bg-[#64748b]/15', text: 'text-slate-400', border: 'border-[#64748b]/50', hex: '#64748b' },
  informational: { bg: 'bg-[#94a3b8]/15', text: 'text-slate-300', border: 'border-[#94a3b8]/50', hex: '#94a3b8' },
};

export const BandBadge: React.FC<BandBadgeProps> = ({ band, size = 'md', showCount }) => {
  const norm = (band || 'informational').toLowerCase();
  const theme = BAND_COLORS[norm] || BAND_COLORS.informational;

  const sizeClass =
    size === 'sm'
      ? 'text-xs px-2 py-0.5'
      : size === 'lg'
      ? 'text-sm px-3 py-1 font-semibold'
      : 'text-xs px-2.5 py-1 font-medium';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border uppercase tracking-wider font-mono ${theme.bg} ${theme.text} ${theme.border} ${sizeClass}`}
      style={{ boxShadow: `0 0 10px ${theme.hex}20` }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: theme.hex }} />
      <span>{band}</span>
      {showCount !== undefined && (
        <span className="ml-1 px-1.5 py-0.2 rounded bg-slate-900/60 font-bold text-white text-[11px]">
          {showCount}
        </span>
      )}
    </span>
  );
};
