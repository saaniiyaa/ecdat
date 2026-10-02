import React from 'react';
import { Band } from '../../types/api';
import { ShieldAlert, AlertTriangle, AlertCircle, Info, HelpCircle } from 'lucide-react';

interface BandBadgeProps {
  band: Band | string;
  size?: 'sm' | 'md' | 'lg';
  showCount?: number;
}

export const BAND_CONFIG: Record<
  string,
  { bg: string; text: string; border: string; icon: React.FC<{ className?: string }>; label: string }
> = {
  critical: {
    bg: 'bg-rose-50',
    text: 'text-rose-800',
    border: 'border-rose-300',
    icon: ShieldAlert,
    label: 'Critical',
  },
  high: {
    bg: 'bg-amber-50',
    text: 'text-amber-800',
    border: 'border-amber-300',
    icon: AlertTriangle,
    label: 'High',
  },
  medium: {
    bg: 'bg-blue-50',
    text: 'text-blue-800',
    border: 'border-blue-300',
    icon: AlertCircle,
    label: 'Medium',
  },
  low: {
    bg: 'bg-slate-100',
    text: 'text-slate-700',
    border: 'border-slate-300',
    icon: Info,
    label: 'Low',
  },
  informational: {
    bg: 'bg-slate-100',
    text: 'text-slate-600',
    border: 'border-slate-300',
    icon: HelpCircle,
    label: 'Info',
  },
};

// Export backward compatibility for BAND_COLORS
export const BAND_COLORS: Record<string, { bg: string; text: string; border: string; dot: string; hex: string }> = {
  critical: { bg: 'bg-rose-50', text: 'text-rose-800', border: 'border-rose-300', dot: 'bg-rose-600', hex: '#E11D48' },
  high: { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-300', dot: 'bg-amber-600', hex: '#D97706' },
  medium: { bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-300', dot: 'bg-blue-600', hex: '#2563EB' },
  low: { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-300', dot: 'bg-slate-500', hex: '#64748B' },
  informational: { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-300', dot: 'bg-slate-400', hex: '#94A3B8' },
};

export const BandBadge: React.FC<BandBadgeProps> = ({ band, size = 'md', showCount }) => {
  const norm = (band || 'informational').toLowerCase();
  const config = BAND_CONFIG[norm] || BAND_CONFIG.informational;
  const Icon = config.icon;

  const sizeClass =
    size === 'sm'
      ? 'text-[11px] px-2 py-0.5'
      : size === 'lg'
      ? 'text-xs px-3 py-1 font-bold'
      : 'text-xs px-2.5 py-0.5 font-semibold';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border ${config.bg} ${config.text} ${config.border} ${sizeClass} tracking-wide select-none shadow-sm`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span className="capitalize">{band || config.label}</span>
      {showCount !== undefined && (
        <span className="ml-1 px-1.5 py-0.2 rounded-full bg-white border border-slate-300 text-slate-900 font-mono text-[10px] font-bold">
          {showCount}
        </span>
      )}
    </span>
  );
};
