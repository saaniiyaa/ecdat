import React, { useEffect, useState, useCallback } from 'react';
import { useScan } from '../context/ScanContext';
import { ecdatApi } from '../api/endpoints';
import { RecommendationOut, MigrationItemOut, Band } from '../types/api';
import { BandBadge } from '../components/common/BandBadge';
import {
  GitPullRequest,
  CheckCircle,
  Clock,
  Layers,
  Edit2,
  Save,
  X,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  User,
  Calendar,
} from 'lucide-react';

export const MigrationPlan: React.FC = () => {
  const { activeScanId } = useScan();

  const [recommendations, setRecommendations] = useState<RecommendationOut[]>([]);
  const [migrationItems, setMigrationItems] = useState<MigrationItemOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit Modal State
  const [editingItem, setEditingItem] = useState<MigrationItemOut | null>(null);
  const [editStatus, setEditStatus] = useState<string>('backlog');
  const [editOwner, setEditOwner] = useState<string>('');
  const [editWave, setEditWave] = useState<number>(1);
  const [editNotes, setEditNotes] = useState<string>('');
  const [saving, setSaving] = useState(false);

  // Filter State
  const [filterStandard, setFilterStandard] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');

  const loadData = useCallback(async () => {
    if (!activeScanId) return;

    setLoading(true);
    setError(null);
    try {
      const [recsRes, itemsRes] = await Promise.all([
        ecdatApi.listRecommendations(activeScanId, 100),
        ecdatApi.listMigrationItems(activeScanId, 100),
      ]);
      setRecommendations(recsRes.data.items || []);
      setMigrationItems(itemsRes.data.items || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load migration data');
    } finally {
      setLoading(false);
    }
  }, [activeScanId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenEdit = (item: MigrationItemOut) => {
    setEditingItem(item);
    setEditStatus(item.status);
    setEditOwner(item.owner || '');
    setEditWave(item.wave);
    setEditNotes(item.notes || '');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    setSaving(true);
    try {
      const updated = await ecdatApi.updateMigrationItem(editingItem.id, {
        status: editStatus,
        owner: editOwner.trim() || undefined,
        wave: Number(editWave),
        notes: editNotes.trim() || undefined,
      });

      setMigrationItems((prev) =>
        prev.map((item) => (item.id === editingItem.id ? updated.data : item))
      );
      setEditingItem(null);
    } catch (err: any) {
      alert(`Update failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (!activeScanId) {
    return (
      <div className="max-w-4xl mx-auto p-12 text-center space-y-4">
        <GitPullRequest className="w-12 h-12 text-slate-400 mx-auto" />
        <h2 className="text-xl font-bold font-mono text-slate-800">No Scan Selected</h2>
        <p className="text-sm text-slate-500 font-mono">
          Select or launch a scan to view purpose-aware PQC recommendations and manage the migration queue.
        </p>
      </div>
    );
  }

  // Filtered Items
  const filteredItems = migrationItems.filter((item) => {
    if (filterStandard && !item.target_standard.toLowerCase().includes(filterStandard.toLowerCase())) {
      return false;
    }
    if (filterStatus && item.status.toLowerCase() !== filterStatus.toLowerCase()) {
      return false;
    }
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
      {/* Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <GitPullRequest className="w-6 h-6 text-emerald-600" />
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Purpose-Aware PQC Migration Roadmap
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            FIPS 203 (ML-KEM), FIPS 204 (ML-DSA), FIPS 205 (SLH-DSA), and RFC 10024 hybrid transitions
          </p>
        </div>

        <button
          onClick={loadData}
          className="self-start sm:self-center inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 shadow-sm text-xs font-medium transition cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
          <span>Refresh Queue</span>
        </button>
      </div>

      {/* Target Standards Grouping Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-sm space-y-1.5">
          <div className="text-emerald-700 font-semibold text-xs flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4" />
            NIST FIPS 203
          </div>
          <div className="text-slate-900 font-bold text-sm">ML-KEM (Kyber)</div>
          <p className="text-xs text-slate-500 font-sans">
            Primary replacement for RSA & ECDH key establishment
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-sm space-y-1.5">
          <div className="text-indigo-600 font-semibold text-xs flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4" />
            NIST FIPS 204
          </div>
          <div className="text-slate-900 font-bold text-sm">ML-DSA (Dilithium)</div>
          <p className="text-xs text-slate-500 font-sans">
            Lattice signature standard for digital signatures & PKI
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-sm space-y-1.5">
          <div className="text-violet-700 font-semibold text-xs flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4" />
            NIST FIPS 205
          </div>
          <div className="text-slate-900 font-bold text-sm">SLH-DSA (SPHINCS+)</div>
          <p className="text-xs text-slate-500 font-sans">
            Stateless hash-based signature scheme backup
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-sm space-y-1.5">
          <div className="text-amber-700 font-bold flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4" />
            RFC 10024 Hybrids
          </div>
          <div className="text-slate-800 font-semibold">Classical + PQC</div>
          <p className="text-[11px] text-slate-500 font-sans">
            Dual-encapsulation transitional deploy mode
          </p>
        </div>
      </div>

      {/* Migration Work Queue Table */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div>
            <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-slate-800 flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-600" />
              Migration Work Queue ({filteredItems.length} items)
            </h3>
            <p className="text-xs text-slate-500 font-mono mt-0.5">
              Editable migration backlog synchronized with backend database via PATCH /migration/items/{`{id}`}
            </p>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2 font-mono text-xs">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 focus:outline-none focus:border-indigo-500"
            >
              <option value="">All Statuses</option>
              <option value="backlog">Backlog</option>
              <option value="in_progress">In Progress</option>
              <option value="verified">Verified</option>
              <option value="blocked">Blocked</option>
            </select>

            <select
              value={filterStandard}
              onChange={(e) => setFilterStandard(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 focus:outline-none focus:border-indigo-500"
            >
              <option value="">All Standards</option>
              <option value="FIPS 203">FIPS 203</option>
              <option value="FIPS 204">FIPS 204</option>
              <option value="RFC">RFC</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-3">Title & Migration Target</th>
                <th className="py-3 px-3">Standard</th>
                <th className="py-3 px-3">Wave</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">Owner</th>
                <th className="py-3 px-3 text-center">Urgency / Effort</th>
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500 font-mono">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-600" />
                    Loading migration queue...
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500 font-mono">
                    No migration queue items match the filter.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-3 max-w-sm truncate">
                      <div className="font-bold text-slate-800 truncate">{item.title}</div>
                      {item.notes && (
                        <div className="text-[10px] text-slate-500 truncate mt-0.5">
                          Note: {item.notes}
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-3 whitespace-nowrap text-indigo-600 font-medium">
                      {item.target_standard}
                    </td>

                    <td className="py-3 px-3 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 font-bold">
                        Wave {item.wave}
                      </span>
                    </td>

                    <td className="py-3 px-3 whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold uppercase ${
                          item.status === 'verified'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                            : item.status === 'in_progress'
                            ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/60'
                            : item.status === 'blocked'
                            ? 'bg-rose-50 text-rose-700 border border-rose-200/60'
                            : 'bg-slate-50 text-slate-500 border border-slate-200'
                        }`}
                      >
                        {item.status}
                      </span>
                    </td>

                    <td className="py-3 px-3 whitespace-nowrap text-slate-500">
                      {item.owner ? (
                        <span className="flex items-center gap-1 text-slate-800">
                          <User className="w-3.5 h-3.5 text-indigo-600" />
                          <span>{item.owner}</span>
                        </span>
                      ) : (
                        <span className="italic text-slate-400">Unassigned</span>
                      )}
                    </td>

                    <td className="py-3 px-3 text-center whitespace-nowrap">
                      <span className="text-amber-700 font-bold">{item.urgency_score}</span>
                      <span className="text-slate-400"> / </span>
                      <span className="text-slate-700">{item.effort_score}</span>
                    </td>

                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => handleOpenEdit(item)}
                        className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition"
                        title="Edit migration item"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      {editingItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-mono font-bold text-slate-900 flex items-center gap-2 text-sm">
                <Edit2 className="w-4 h-4 text-indigo-600" />
                Update Migration Item
              </h3>
              <button
                onClick={() => setEditingItem(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4 font-mono text-xs">
              <div>
                <span className="text-slate-500 block text-[11px]">Task:</span>
                <span className="text-slate-800 font-semibold">{editingItem.title}</span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-600 mb-1">Status:</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="backlog">backlog</option>
                    <option value="in_progress">in_progress</option>
                    <option value="verified">verified</option>
                    <option value="blocked">blocked</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-600 mb-1">Migration Wave:</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={editWave}
                    onChange={(e) => setEditWave(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-600 mb-1">Assigned Owner:</label>
                <input
                  type="text"
                  value={editOwner}
                  onChange={(e) => setEditOwner(e.target.value)}
                  placeholder="e.g. core-payments-team or A. Sharma"
                  className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-600 mb-1">Engineering Notes:</label>
                <textarea
                  rows={3}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Migration details, branch references, PR links..."
                  className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{saving ? 'Updating...' : 'Save Changes'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
