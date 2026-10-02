import React, { useEffect, useState, useCallback } from 'react';
import { useScan } from '../context/ScanContext';
import { ecdatApi } from '../api/endpoints';
import { RecommendationOut, MigrationItemOut } from '../types/api';
import {
  GitPullRequest,
  CheckCircle,
  Layers,
  Edit2,
  Save,
  X,
  ShieldCheck,
  RefreshCw,
  User,
  AlertCircle,
} from 'lucide-react';
import { HelpTooltip } from '../components/common/HelpTooltip';

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
        <div className="w-16 h-16 rounded-2xl bg-white border border-slate-300 flex items-center justify-center mx-auto text-indigo-600 shadow-sm">
          <GitPullRequest className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">No Scan Target Selected</h2>
        <p className="text-sm text-slate-600">
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
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8 animate-in fade-in duration-200">
      {/* Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <GitPullRequest className="w-6 h-6 text-indigo-600" />
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Purpose-Aware PQC Migration Roadmap
            </h1>
            <HelpTooltip
              title="Post-Quantum Cryptography Migration"
              content="Prioritized waves to replace classical public-key cryptography with NIST FIPS 203 (ML-KEM), FIPS 204 (ML-DSA), and FIPS 205 (SLH-DSA)."
            />
          </div>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            FIPS 203 (ML-KEM), FIPS 204 (ML-DSA), FIPS 205 (SLH-DSA), and RFC 10024 hybrid transitions.
          </p>
        </div>

        <button
          onClick={loadData}
          className="self-start sm:self-center inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold shadow-sm transition cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
          <span>Refresh Queue</span>
        </button>
      </div>

      {/* Target Standards Grouping Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white border border-slate-300 shadow-sm space-y-1.5">
          <div className="text-indigo-600 font-bold text-xs flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4" />
            NIST FIPS 203
          </div>
          <div className="text-slate-900 font-bold text-sm">ML-KEM (Kyber)</div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Primary replacement for RSA & ECDH key establishment
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-300 shadow-sm space-y-1.5">
          <div className="text-blue-600 font-bold text-xs flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4" />
            NIST FIPS 204
          </div>
          <div className="text-slate-900 font-bold text-sm">ML-DSA (Dilithium)</div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Lattice signature standard for digital signatures & PKI
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-300 shadow-sm space-y-1.5">
          <div className="text-purple-600 font-bold text-xs flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4" />
            NIST FIPS 205
          </div>
          <div className="text-slate-900 font-bold text-sm">SLH-DSA (SPHINCS+)</div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Stateless hash-based signature scheme backup
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-300 shadow-sm space-y-1.5">
          <div className="text-amber-600 font-bold text-xs flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4" />
            RFC 10024 Hybrids
          </div>
          <div className="text-slate-900 font-bold text-sm">Classical + PQC</div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Dual-encapsulation transitional deploy mode
          </p>
        </div>
      </div>

      {/* Migration Work Queue Table */}
      <div className="p-6 rounded-2xl bg-white border border-slate-300 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-600" />
              Migration Work Queue ({filteredItems.length} items)
            </h2>
            <p className="text-xs text-slate-500 font-mono mt-0.5">
              Editable migration backlog synchronized with engine via PATCH /migration/items/{`{id}`}
            </p>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2 text-xs">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 font-semibold focus:outline-none focus:border-indigo-600 cursor-pointer"
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
              className="px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 font-semibold focus:outline-none focus:border-indigo-600 cursor-pointer"
            >
              <option value="">All Standards</option>
              <option value="FIPS 203">FIPS 203</option>
              <option value="FIPS 204">FIPS 204</option>
              <option value="RFC">RFC</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-300 bg-white">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-slate-300 bg-slate-100 text-slate-700 uppercase tracking-wider text-[11px] font-bold">
                <th className="py-3 px-4 font-sans">Title & Migration Target</th>
                <th className="py-3 px-4 font-sans">Standard</th>
                <th className="py-3 px-4 font-sans">Wave</th>
                <th className="py-3 px-4 font-sans">Status</th>
                <th className="py-3 px-4 font-sans">Owner</th>
                <th className="py-3 px-4 text-center font-sans">Urgency / Effort</th>
                <th className="py-3 px-4 text-right font-sans">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
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
                    No migration queue items match the filter criteria.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition">
                    <td className="py-3 px-4 max-w-sm truncate">
                      <div className="font-bold text-slate-900 truncate font-sans">{item.title}</div>
                      {item.notes && (
                        <div className="text-[11px] text-slate-500 truncate mt-0.5">
                          Note: {item.notes}
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap text-indigo-700 font-bold">
                      {item.target_standard}
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-300 font-bold">
                        Wave {item.wave}
                      </span>
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase border ${
                          item.status === 'verified'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                            : item.status === 'in_progress'
                            ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                            : item.status === 'blocked'
                            ? 'bg-rose-50 text-rose-800 border-rose-300'
                            : 'bg-slate-100 text-slate-700 border-slate-300'
                        }`}
                      >
                        {item.status}
                      </span>
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap text-slate-600">
                      {item.owner ? (
                        <span className="flex items-center gap-1.5 text-slate-900 font-semibold">
                          <User className="w-3.5 h-3.5 text-indigo-600" />
                          <span>{item.owner}</span>
                        </span>
                      ) : (
                        <span className="italic text-slate-400">Unassigned</span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      <span className="text-amber-700 font-bold">{item.urgency_score}</span>
                      <span className="text-slate-400"> / </span>
                      <span className="text-slate-900 font-bold">{item.effort_score}</span>
                    </td>

                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button
                        onClick={() => handleOpenEdit(item)}
                        className="p-1.5 rounded-lg border border-slate-300 bg-slate-50 text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer"
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
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white border border-slate-300 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-bold text-slate-900 flex items-center gap-2 text-sm">
                <Edit2 className="w-4 h-4 text-indigo-600" />
                Update Migration Queue Item
              </h3>
              <button
                onClick={() => setEditingItem(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
              <div>
                <span className="text-slate-500 block text-[11px] font-semibold">Task:</span>
                <span className="text-slate-900 font-bold">{editingItem.title}</span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-700 mb-1 font-semibold">Status:</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 font-semibold focus:outline-none focus:border-indigo-600 focus:bg-white"
                  >
                    <option value="backlog">backlog</option>
                    <option value="in_progress">in_progress</option>
                    <option value="verified">verified</option>
                    <option value="blocked">blocked</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 mb-1 font-semibold">Migration Wave:</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={editWave}
                    onChange={(e) => setEditWave(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 font-mono text-xs focus:outline-none focus:border-indigo-600 focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 mb-1 font-semibold">Assigned Owner:</label>
                <input
                  type="text"
                  value={editOwner}
                  onChange={(e) => setEditOwner(e.target.value)}
                  placeholder="e.g. core-payments-team or A. Sharma"
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 font-mono text-xs focus:outline-none focus:border-indigo-600 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-slate-700 mb-1 font-semibold">Engineering Notes:</label>
                <textarea
                  rows={3}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Migration details, branch references, PR links..."
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 text-xs focus:outline-none focus:border-indigo-600 focus:bg-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="px-3.5 py-2 rounded-lg border border-slate-300 text-slate-700 hover:text-slate-950 hover:bg-slate-100 transition font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center gap-1.5 transition shadow-sm cursor-pointer"
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
