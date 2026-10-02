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
    bg: 'bg-danger-subtle',
    text: 'text-danger',
    border: 'border-danger-border',
    icon: ShieldAlert,
    label: 'Critical',
  },
  high: {
    bg: 'bg-warning-subtle',
    text: 'text-warning',
    border: 'border-warning-border',
    icon: AlertTriangle,
    label: 'High',
  },
  medium: {
    bg: 'bg-accent-2-subtle',
    text: 'text-accent-2',
    border: 'border-accent-2-border',
    icon: AlertCircle,
    label: 'Medium',
  },
  low: {
    bg: 'bg-surface-2',
    text: 'text-text-muted',
    border: 'border-border',
    icon: Info,
    label: 'Low',
  },
  informational: {
    bg: 'bg-surface-2',
    text: 'text-text-dim',
    border: 'border-border',
    icon: HelpCircle,
    label: 'Info',
  },
};

// Export backward compatibility for BAND_COLORS
export const BAND_COLORS: Record<string, { bg: string; text: string; border: string; dot: string; hex: string }> = {
  critical: { bg: 'bg-danger-subtle', text: 'text-danger', border: 'border-danger-border', dot: 'bg-danger', hex: '#FF5C6C' },
  high: { bg: 'bg-warning-subtle', text: 'text-warning', border: 'border-warning-border', dot: 'bg-warning', hex: '#FFB020' },
  medium: { bg: 'bg-accent-2-subtle', text: 'text-accent-2', border: 'border-accent-2-border', dot: 'bg-accent-2', hex: '#5B9DFF' },
  low: { bg: 'bg-surface-2', text: 'text-text-muted', border: 'border-border', dot: 'bg-text-dim', hex: '#8E9DB5' },
  informational: { bg: 'bg-surface-2', text: 'text-text-dim', border: 'border-border', dot: 'bg-text-dim', hex: '#B4C0D4' },
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
      className={`inline-flex items-center gap-1.5 rounded-full border ${config.bg} ${config.text} ${config.border} ${sizeClass} tracking-wide select-none`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span className="capitalize">{band || config.label}</span>
      {showCount !== undefined && (
        <span className="ml-1 px-1.5 py-0.2 rounded-full bg-surface border border-border text-text-main font-mono text-[10px] font-bold">
          {showCount}
        </span>
      )}
    </span>
  );
};
