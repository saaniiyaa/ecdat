import React, { useEffect, useState, useCallback } from 'react';
import { useScan } from '../context/ScanContext';
import { useRegistry } from '../context/RegistryContext';
import { ecdatApi } from '../api/endpoints';
import { FindingOut, Page, Band, EvidenceClass } from '../types/api';
import { BandBadge } from '../components/common/BandBadge';
import { EvidenceBadge } from '../components/common/EvidenceBadge';
import { QuantumBadge } from '../components/common/QuantumBadge';
import { FindingDetailDrawer } from '../components/findings/FindingDetailDrawer';
import {
  Search,
  Filter,
  ArrowUpDown,
  RefreshCw,
  FileCode,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  X,
} from 'lucide-react';

interface FindingsExplorerProps {
  initialBand?: string;
}

export const FindingsExplorer: React.FC<FindingsExplorerProps> = ({ initialBand }) => {
  const { activeScanId } = useScan();
  const { resolveAlgorithm } = useRegistry();

  // Filters State
  const [band, setBand] = useState<string>(initialBand || '');
  const [quantumStatus, setQuantumStatus] = useState<string>('');
  const [evidenceClass, setEvidenceClass] = useState<string>('');
  const [purpose, setPurpose] = useState<string>('');
  const [search, setSearch] = useState<string>('');
  const [sort, setSort] = useState<'risk' | 'urgency' | 'path' | 'confidence'>('risk');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [limit, setLimit] = useState<number>(50);
  const [offset, setOffset] = useState<number>(0);

  // Findings Data State
  const [pageData, setPageData] = useState<Page<FindingOut> | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFinding, setSelectedFinding] = useState<FindingOut | null>(null);

  const fetchFindings = useCallback(async () => {
    if (!activeScanId) return;

    setLoading(true);
    setError(null);
    try {
      const res = await ecdatApi.listFindings(activeScanId, {
        band: band || undefined,
        quantum_status: quantumStatus || undefined,
        evidence_class: evidenceClass || undefined,
        purpose: purpose || undefined,
        search: search.trim() || undefined,
        sort,
        order,
        limit,
        offset,
      });
      setPageData(res.data);
    } catch (err: any) {
      setError(err.message || 'Failed to query findings');
    } finally {
      setLoading(false);
    }
  }, [activeScanId, band, quantumStatus, evidenceClass, purpose, search, sort, order, limit, offset]);

  useEffect(() => {
    fetchFindings();
  }, [fetchFindings]);

  // Reset offset when filters change
  const handleFilterChange = (setter: (val: string) => void, val: string) => {
    setter(val);
    setOffset(0);
  };

  const handleResetFilters = () => {
    setBand('');
    setQuantumStatus('');
    setEvidenceClass('');
    setPurpose('');
    setSearch('');
    setSort('risk');
    setOrder('desc');
    setOffset(0);
  };

  const totalPages = pageData ? Math.ceil(pageData.total / limit) : 0;
  const currentPage = Math.floor(offset / limit) + 1;

  if (!activeScanId) {
    return (
      <div className="max-w-4xl mx-auto p-12 text-center space-y-4">
        <ShieldAlert className="w-12 h-12 text-slate-400 mx-auto" />
        <h2 className="text-xl font-bold font-mono text-slate-800">No Scan Selected</h2>
        <p className="text-sm text-slate-500 font-mono">
          Select or launch a scan to explore detected cryptographic findings.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header and Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <SlidersHorizontal className="w-6 h-6 text-indigo-600" />
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Cryptographic Findings Explorer
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Complete inventory of detected security algorithms, keys, and certificates.
          </p>
        </div>

        <button
          onClick={() => fetchFindings()}
          className="self-start sm:self-center inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-medium shadow-sm transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Filter Chips & Search Bar */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => handleFilterChange(setSearch, e.target.value)}
              placeholder="Search file path, algorithm, symbol, detector..."
              className="w-full pl-10 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition"
            />
            {search && (
              <button
                onClick={() => handleFilterChange(setSearch, '')}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as any)}
                className="px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition cursor-pointer"
              >
                <option value="risk">Sort by Risk Score</option>
                <option value="urgency">Sort by Urgency</option>
                <option value="path">Sort by File Path</option>
                <option value="confidence">Sort by Confidence</option>
              </select>
            </div>

            <button
              onClick={() => setOrder(order === 'asc' ? 'desc' : 'asc')}
              className="px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs text-slate-700 hover:text-slate-900 hover:bg-slate-50 flex items-center gap-1.5 transition font-medium shadow-sm"
              title={`Switch to ${order === 'asc' ? 'descending' : 'ascending'}`}
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              <span>{order.toUpperCase()}</span>
            </button>
          </div>
        </div>

        {/* Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-2.5 pt-1 text-xs">
          <span className="text-slate-400 flex items-center gap-1.5 text-xs font-medium mr-1">
            <Filter className="w-3.5 h-3.5 text-slate-400" /> Filters:
          </span>

          {/* Band Filter */}
          <select
            value={band}
            onChange={(e) => handleFilterChange(setBand, e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
          >
            <option value="">All Bands</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
            <option value="informational">Informational</option>
          </select>

          {/* Quantum Status */}
          <select
            value={quantumStatus}
            onChange={(e) => handleFilterChange(setQuantumStatus, e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
          >
            <option value="">All Quantum Statuses</option>
            <option value="shor_vulnerable">Shor Vulnerable</option>
            <option value="grover_affected">Grover Affected</option>
            <option value="quantum_resistant">Quantum Resistant</option>
            <option value="post_quantum_standard">PQ Standard</option>
          </select>

          {/* Evidence Class */}
          <select
            value={evidenceClass}
            onChange={(e) => handleFilterChange(setEvidenceClass, e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
          >
            <option value="">All Evidence Classes</option>
            <option value="PARSED_STRUCTURE">Parsed Structure (AST/Cert)</option>
            <option value="SYMBOL_INFERRED">Symbol Inferred (Binary)</option>
            <option value="INFERRED">Inferred (Constant)</option>
            <option value="PATTERN">Pattern (Regex)</option>
          </select>

          {/* Purpose */}
          <select
            value={purpose}
            onChange={(e) => handleFilterChange(setPurpose, e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
          >
            <option value="">All Purposes</option>
            <option value="key_establishment">Key Establishment</option>
            <option value="signature">Signature</option>
            <option value="encryption">Encryption</option>
            <option value="digest">Digest / Hash</option>
          </select>

          {(band || quantumStatus || evidenceClass || purpose || search) && (
            <button
              onClick={handleResetFilters}
              className="px-3 py-1.5 rounded-lg border border-rose-200/60 bg-rose-50 text-rose-700 hover:bg-rose-100 transition text-xs font-medium"
            >
              Clear Filters
            </button>
          )}

          <div className="ml-auto text-slate-400 text-xs">
            {pageData ? `Showing ${pageData.items.length} of ${pageData.total} findings` : ''}
          </div>
        </div>
      </div>

      {/* Findings Table */}
      <div className="rounded-2xl border border-slate-200/80 bg-white overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-500 uppercase tracking-wider text-[11px] font-medium">
                <th className="py-3 px-4">Band</th>
                <th className="py-3 px-4">Algorithm & OID</th>
                <th className="py-3 px-4">Source Location</th>
                <th className="py-3 px-4">Evidence Class</th>
                <th className="py-3 px-4">Quantum Status</th>
                <th className="py-3 px-4 text-center">Score</th>
                <th className="py-3 px-4 text-center">Factors</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500 font-mono">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-600" />
                    Querying cryptographic findings...
                  </td>
                </tr>
              ) : !pageData || pageData.items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500 font-mono">
                    No findings match the applied filter criteria.
                  </td>
                </tr>
              ) : (
                pageData.items.map((f) => {
                  const asset = f.asset;
                  const risk = f.risk;
                  const regAlg = asset ? resolveAlgorithm(asset.canonical_name) : undefined;
                  const displayName = asset?.canonical_name || f.symbol || 'Unknown Primitive';

                  return (
                    <tr
                      key={f.id}
                      onClick={() => setSelectedFinding(f)}
                      className="hover:bg-slate-50/60 cursor-pointer transition group"
                    >
                      {/* Band */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {risk && <BandBadge band={risk.band} size="sm" />}
                      </td>

                      {/* Algorithm */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-800 group-hover:text-indigo-600 transition">
                          {displayName}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {asset?.oid || regAlg?.oid || asset?.purpose || 'No OID'}
                        </div>
                      </td>

                      {/* Location */}
                      <td className="py-3.5 px-4 max-w-xs truncate">
                        <div className="flex items-center gap-1.5 text-slate-700 truncate">
                          <FileCode className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate font-mono text-[11px]">{f.file_path}</span>
                        </div>
                        {f.line_start && (
                          <div className="text-[11px] text-indigo-600 font-mono pl-5">
                            Line {f.line_start}{f.line_end ? `–${f.line_end}` : ''}
                          </div>
                        )}
                      </td>

                      {/* Evidence Class */}
                      <td className="py-3.5 px-4">
                        <EvidenceBadge
                          evidenceClass={f.evidence_class}
                          confidence={f.confidence}
                          cappedByConfidence={risk?.capped_by_confidence}
                        />
                      </td>

                      {/* Quantum Status */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <QuantumBadge
                          status={asset?.quantum_status}
                          isPostQuantum={asset?.is_post_quantum}
                        />
                      </td>

                      {/* Classical / Quantum Scores */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <div className="font-semibold text-slate-800 font-mono">
                          {risk?.composite_risk ?? 0}/100
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          C:{risk?.classical_risk ?? 0} · Q:{risk?.quantum_risk ?? 0}
                        </div>
                      </td>

                      {/* Action */}
                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedFinding(f);
                          }}
                          className="px-3 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-medium text-xs transition cursor-pointer"
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {pageData && pageData.total > 0 && (
          <div className="p-4 border-t border-slate-200 bg-white flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-500">Rows per page:</span>
              <select
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setOffset(0);
                }}
                className="px-2 py-1 bg-white border border-slate-300 rounded text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={250}>250</option>
              </select>
              <span className="text-slate-500 ml-2">
                Page {currentPage} of {totalPages || 1}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - limit))}
                className="p-1.5 rounded border border-slate-200 bg-white text-slate-500 hover:text-slate-900 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-sm"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={!pageData.has_next}
                onClick={() => setOffset(offset + limit)}
                className="p-1.5 rounded border border-slate-200 bg-white text-slate-500 hover:text-slate-900 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-sm"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Finding Detail Drawer (Rule 6.2 attribution factors) */}
      <FindingDetailDrawer
        scanId={activeScanId}
        finding={selectedFinding}
        onClose={() => setSelectedFinding(null)}
      />
    </div>
  );
};
