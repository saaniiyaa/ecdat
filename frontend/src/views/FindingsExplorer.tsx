import React, { useEffect, useState, useCallback } from 'react';
import { useScan } from '../context/ScanContext';
import { useRegistry } from '../context/RegistryContext';
import { ecdatApi } from '../api/endpoints';
import { FindingOut, Page, Band, EvidenceClass } from '../types/api';
import { BandBadge } from '../components/common/BandBadge';
import { EvidenceBadge } from '../components/common/EvidenceBadge';
import { DeclarationBadge, SourceContextBadge, isDeclarationFinding } from '../components/common/DeclarationBadge';
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
  // Declared vs called. The API has no parameter for this, so the filter is
  // applied client-side over the fetched page - and it says so, because a
  // filter that silently covers only the current page is a filter that lies.
  const [surface, setSurface] = useState<'all' | 'declared' | 'called'>('all');
  const [sourceScope, setSourceScope] = useState<'all' | 'production' | 'non_production'>('all');
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
  // `any` here because the setters are heterogeneous - some filters are the
  // backend's enum, two of them are ours. The cast is at the one call site
  // that needs it rather than throughout.
  const handleFilterChange = (setter: (val: any) => void, val: any) => {
    setter(val);
    setOffset(0);
  };

  const handleResetFilters = () => {
    setBand('');
    setQuantumStatus('');
    setEvidenceClass('');
    setPurpose('');
    setSearch('');
    setSurface('all');
    setSourceScope('all');
    setSort('risk');
    setOrder('desc');
    setOffset(0);
  };

  const totalPages = pageData ? Math.ceil(pageData.total / limit) : 0;
  const currentPage = Math.floor(offset / limit) + 1;

  // Declared-vs-called and source-scope are client-side, because the server
  // exposes neither. `counts` is computed from the fetched page and labelled
  // as such rather than passed off as a scan-wide total.
  const visibleItems = (pageData?.items || []).filter((f) => {
    const declared = isDeclarationFinding(f.detector_id, f.extra?.declaration);
    if (surface === 'declared' && !declared) return false;
    if (surface === 'called' && declared) return false;
    const ctx = f.extra?.source_context || 'unknown';
    if (sourceScope === 'production' && ctx !== 'production') return false;
    if (sourceScope === 'non_production' && ctx === 'production') return false;
    return true;
  });
  const declaredOnPage = (pageData?.items || []).filter((f) => isDeclarationFinding(f.detector_id, f.extra?.declaration)).length;

  if (!activeScanId) {
    return (
      <div className="max-w-4xl mx-auto p-12 text-center space-y-4">
        <ShieldAlert className="w-12 h-12 text-slate-500 mx-auto" />
        <h2 className="text-xl font-bold font-mono text-slate-200">No Scan Selected</h2>
        <p className="text-sm text-slate-400 font-mono">
          Select or launch a scan to explore detected cryptographic findings.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header and Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold font-mono text-slate-100 flex items-center gap-2">
            <SlidersHorizontal className="w-6 h-6 text-cyan-400" />
            Cryptographic Findings Explorer
          </h1>
          <p className="text-xs text-slate-400 font-mono mt-1">
            Deterministic finding inventory with multi-factor attribution & confidence enforcement
          </p>
        </div>

        <button
          onClick={() => fetchFindings()}
          className="self-start sm:self-center inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900 text-slate-300 hover:text-white text-xs font-mono"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Filter Chips & Search Bar */}
      <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-4">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => handleFilterChange(setSearch, e.target.value)}
              placeholder="Search file path, algorithm, symbol, detector..."
              className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500"
            />
            {search && (
              <button
                onClick={() => handleFilterChange(setSearch, '')}
                className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300"
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
                className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-300 focus:outline-none focus:border-cyan-500"
              >
                <option value="risk">Sort by Risk Score</option>
                <option value="urgency">Sort by Urgency</option>
                <option value="path">Sort by File Path</option>
                <option value="confidence">Sort by Confidence</option>
              </select>
            </div>

            <button
              onClick={() => setOrder(order === 'asc' ? 'desc' : 'asc')}
              className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300 hover:text-white flex items-center gap-1"
              title={`Switch to ${order === 'asc' ? 'descending' : 'ascending'}`}
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              <span>{order.toUpperCase()}</span>
            </button>
          </div>
        </div>

        {/* Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-2 pt-1 font-mono text-xs">
          <span className="text-slate-500 flex items-center gap-1 text-[11px] uppercase mr-1">
            <Filter className="w-3 h-3" /> Filters:
          </span>

          {/* Band Filter */}
          <select
            value={band}
            onChange={(e) => handleFilterChange(setBand, e.target.value)}
            className="px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-slate-300 focus:outline-none focus:border-cyan-500"
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
            className="px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-slate-300 focus:outline-none focus:border-cyan-500"
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
            className="px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-slate-300 focus:outline-none focus:border-cyan-500"
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
            className="px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-slate-300 focus:outline-none focus:border-cyan-500"
          >
            <option value="">All Purposes</option>
            <option value="key_establishment">Key Establishment</option>
            <option value="signature">Signature</option>
            <option value="encryption">Encryption</option>
            <option value="digest">Digest / Hash</option>
          </select>

          {/* Declared vs called - the question that separates this from an
              AST scanner: what does it find that never calls a primitive? */}
          <select
            value={surface}
            onChange={(e) => handleFilterChange(setSurface, e.target.value as any)}
            className="px-2.5 py-1 rounded bg-slate-950 border border-fuchsia-500/40 text-slate-300 focus:outline-none focus:border-fuchsia-500"
            title="Filter by how the finding was established: on a call site, or on a declaration surface (registry, constant, provider string, JWK)"
          >
            <option value="all">Declared &amp; Called</option>
            <option value="declared">Declared only (no call site)</option>
            <option value="called">Called only</option>
          </select>

          <select
            value={sourceScope}
            onChange={(e) => handleFilterChange(setSourceScope, e.target.value as any)}
            className="px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-slate-300 focus:outline-none focus:border-cyan-500"
            title="Separate production code from tests, fixtures, examples and vendored paths"
          >
            <option value="all">Any source</option>
            <option value="production">Production only</option>
            <option value="non_production">Test / fixture only</option>
          </select>

          {(band || quantumStatus || evidenceClass || purpose || search || surface !== 'all' || sourceScope !== 'all') && (
            <button
              onClick={handleResetFilters}
              className="px-2.5 py-1 rounded border border-rose-500/30 bg-rose-950/20 text-rose-400 hover:bg-rose-900/30 transition text-[11px]"
            >
              Clear Filters
            </button>
          )}

          <div className="ml-auto text-slate-400 text-xs font-mono text-right">
            {pageData && (
              <>
                <div>
                  Showing {visibleItems.length} of {pageData.total} findings
                  {visibleItems.length !== pageData.items.length && (
                    <span className="text-amber-400"> (filtered on this page)</span>
                  )}
                </div>
                {declaredOnPage > 0 && surface === 'all' && (
                  <div className="text-[10px] text-fuchsia-400">
                    {declaredOnPage} on this page came from declaration surfaces
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Findings Table */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/80 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">Band</th>
                <th className="py-3 px-4">Algorithm & OID</th>
                <th className="py-3 px-4">Source Location</th>
                <th className="py-3 px-4">Evidence Class</th>
                <th className="py-3 px-4">Quantum Status</th>
                <th className="py-3 px-4 text-center">Score</th>
                <th className="py-3 px-4 text-center">Factors</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500 font-mono">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-cyan-400" />
                    Querying cryptographic findings...
                  </td>
                </tr>
              ) : !pageData || pageData.items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500 font-mono">
                    No findings match the applied filter criteria.
                  </td>
                </tr>
              ) : visibleItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500 font-mono space-y-2">
                    <div>No finding on this page matches the declared-vs-called or source filter.</div>
                    <div className="text-[11px] text-slate-600">
                      That filter is applied to the {pageData.items.length} rows on this page, not to all{' '}
                      {pageData.total} in the scan. Page through, or clear the filter.
                    </div>
                  </td>
                </tr>
              ) : (
                visibleItems.map((f) => {
                  const asset = f.asset;
                  const risk = f.risk;
                  const regAlg = asset ? resolveAlgorithm(asset.canonical_name) : undefined;
                  const displayName = asset?.canonical_name || f.symbol || 'Unknown Primitive';

                  return (
                    <tr
                      key={f.id}
                      onClick={() => setSelectedFinding(f)}
                      className="hover:bg-slate-800/50 cursor-pointer transition group"
                    >
                      {/* Band */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {risk && <BandBadge band={risk.band} size="sm" />}
                      </td>

                      {/* Algorithm */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-200 group-hover:text-cyan-300 transition">
                          {displayName}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {asset?.oid || regAlg?.oid || asset?.purpose || 'No OID'}
                        </div>
                      </td>

                      {/* Location */}
                      <td className="py-3 px-4 max-w-xs truncate">
                        <div className="flex items-center gap-1.5 text-slate-300 truncate">
                          <FileCode className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <span className="truncate">{f.file_path}</span>
                        </div>
                        {f.line_start && (
                          <div className="text-[10px] text-cyan-400 pl-5">
                            Line {f.line_start}{f.line_end ? `–${f.line_end}` : ''}
                          </div>
                        )}
                        <div className="flex flex-wrap gap-1 pl-5 pt-1">
                          <DeclarationBadge detectorId={f.detector_id} reasoning={f.extra?.declaration} />
                          <SourceContextBadge
                            sourceContext={f.extra?.source_context}
                            note={f.extra?.source_context_note}
                          />
                        </div>
                      </td>

                      {/* Evidence Class */}
                      <td className="py-3 px-4">
                        <EvidenceBadge
                          evidenceClass={f.evidence_class}
                          confidence={f.confidence}
                          cappedByConfidence={risk?.capped_by_confidence}
                        />
                      </td>

                      {/* Quantum Status */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <QuantumBadge
                          status={asset?.quantum_status}
                          isPostQuantum={asset?.is_post_quantum}
                        />
                      </td>

                      {/* Classical / Quantum Scores */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <div className="font-bold text-slate-200">
                          {risk?.composite_risk ?? 0}/100
                        </div>
                        <div className="text-[10px] text-slate-500">
                          C:{risk?.classical_risk ?? 0} · Q:{risk?.quantum_risk ?? 0}
                        </div>
                      </td>

                      {/* Action */}
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedFinding(f);
                          }}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 text-[11px] font-medium transition"
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
          <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Rows per page:</span>
              <select
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setOffset(0);
                }}
                className="px-2 py-1 bg-slate-900 border border-slate-800 rounded text-slate-200"
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
                className="p-1.5 rounded border border-slate-800 bg-slate-900 text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={!pageData.has_next}
                onClick={() => setOffset(offset + limit)}
                className="p-1.5 rounded border border-slate-800 bg-slate-900 text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
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
