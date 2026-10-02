import React from 'react';
import {
  LayoutDashboard,
  ShieldAlert,
  Clock,
  GitPullRequest,
  Fingerprint,
  Award,
  BookOpen,
  GitCompare,
  PlusCircle,
  ChevronLeft,
  ChevronRight,
  Shield,
  Activity,
  Settings,
  HelpCircle,
} from 'lucide-react';
import { useScan } from '../../context/ScanContext';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
  onOpenLauncher: () => void;
  onOpenHelp: () => void;
  onOpenSettings: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  isCollapsed,
  setIsCollapsed,
  onOpenLauncher,
  onOpenHelp,
  onOpenSettings,
}) => {
  const { systemOnline, activeScan } = useScan();

  const navigationItems = [
    {
      id: 'dashboard',
      label: 'Executive Dashboard',
      shortLabel: 'Dashboard',
      icon: LayoutDashboard,
      badge: activeScan ? `${activeScan.finding_count || 0}` : undefined,
    },
    {
      id: 'findings',
      label: 'Findings Explorer',
      shortLabel: 'Findings',
      icon: ShieldAlert,
    },
    {
      id: 'mosca',
      label: 'Mosca Simulator',
      shortLabel: 'Mosca',
      icon: Clock,
    },
    {
      id: 'migration',
      label: 'Migration Plan',
      shortLabel: 'Migration',
      icon: GitPullRequest,
    },
    {
      id: 'evidence',
      label: 'Evidence & Exports',
      shortLabel: 'Exports',
      icon: Fingerprint,
    },
    {
      id: 'certificates',
      label: 'Certificates Inventory',
      shortLabel: 'Certificates',
      icon: Award,
    },
    {
      id: 'registry',
      label: 'Registry Catalogue',
      shortLabel: 'Registry',
      icon: BookOpen,
    },
    {
      id: 'diff',
      label: 'Scan-over-Scan Diff',
      shortLabel: 'Scan Diff',
      icon: GitCompare,
    },
  ];

  return (
    <aside
      className={`fixed top-0 left-0 bottom-0 z-40 bg-white border-r border-slate-200 flex flex-col transition-all duration-200 select-none ${
        isCollapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Brand Header */}
      <div className="h-16 px-4 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center shrink-0 shadow-sm relative group">
            <Shield className="w-5 h-5 text-indigo-600" />
            <span
              className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
                systemOnline ? 'bg-emerald-500' : 'bg-rose-500'
              }`}
            />
          </div>
          {!isCollapsed && (
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-base tracking-tight text-slate-900">ECDAT</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase">
                  NTRO
                </span>
              </div>
              <p className="text-[11px] font-normal text-slate-500 truncate">
                Crypto Discovery & PQC
              </p>
            </div>
          )}
        </div>

        {/* Collapse Toggle */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition border border-transparent hover:border-slate-200"
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Quick Launch Button */}
      <div className="p-3">
        <button
          onClick={onOpenLauncher}
          className={`w-full py-2.5 px-3 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-sm group ${
            isCollapsed ? 'px-0' : ''
          }`}
          title="Launch Discovery Scan"
        >
          <PlusCircle className="w-4 h-4 shrink-0" />
          {!isCollapsed && <span>Launch Scan</span>}
        </button>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        {navigationItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <div key={item.id} className="relative group">
              <button
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs transition-all cursor-pointer ${
                  isActive
                    ? 'bg-indigo-600 text-white font-bold shadow-sm'
                    : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100 font-semibold border border-transparent'
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 transition-colors ${
                    isActive ? 'text-white' : 'text-slate-500 group-hover:text-slate-800'
                  }`}
                />
                {!isCollapsed && (
                  <span className="truncate flex-1 text-left">{item.label}</span>
                )}
                {!isCollapsed && item.badge && (
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                      isActive
                        ? 'bg-white/20 text-white border border-white/30'
                        : 'bg-slate-100 text-slate-700 border border-slate-200'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>

              {/* Tooltip on hover when collapsed */}
              {isCollapsed && (
                <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-bold text-white shadow-xl whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                  {item.label}
                  {item.badge && (
                    <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-mono bg-indigo-500/30 text-indigo-300">
                      {item.badge}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer Info & Quick Utilities */}
      <div className="p-3 border-t border-slate-200 space-y-2 bg-slate-50/80">
        <div className="flex items-center justify-between">
          <button
            onClick={onOpenHelp}
            className="p-2 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-slate-200/60 transition"
            title="Cryptographic Reference Guide"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
          <button
            onClick={onOpenSettings}
            className="p-2 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-slate-200/60 transition"
            title="API Configuration"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>

        {!isCollapsed && (
          <div className="px-2 py-1 text-[10px] font-mono text-slate-500 truncate border-t border-slate-200 pt-2">
            <div>NTRO PS 26164 Engine</div>
            <div className="text-indigo-700 font-semibold flex items-center gap-1.5 mt-0.5">
              <span className={`w-1.5 h-1.5 rounded-full ${systemOnline ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
              <span>{systemOnline ? 'Local Engine Active' : 'Connecting Engine...'}</span>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
