import React, { useEffect, useState, useCallback } from 'react';
import { useScan } from '../context/ScanContext';
import { useRegistry } from '../context/RegistryContext';
import { ecdatApi } from '../api/endpoints';
import { FindingOut, Page } from '../types/api';
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
        <div className="w-16 h-16 rounded-2xl bg-surface-2 border border-border flex items-center justify-center mx-auto text-accent shadow-card">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-text-main">No Scan Target Selected</h2>
        <p className="text-sm text-text-muted">
          Select or launch a scan to explore detected cryptographic findings and forensic evidence.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6 animate-in fade-in duration-200">
      {/* Header and Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <SlidersHorizontal className="w-6 h-6 text-accent" />
            <h1 className="text-2xl font-bold text-text-main tracking-tight">
              Cryptographic Findings Explorer
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-text-muted mt-1">
            Complete inventory of detected security algorithms, keys, and certificates with dual-track scoring.
          </p>
        </div>

        <button
          onClick={() => fetchFindings()}
          className="self-start sm:self-center inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-border bg-surface-2 hover:bg-surface-3 text-text-main text-xs font-bold shadow-sm transition cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-accent' : ''}`} />
          <span>Refresh Findings</span>
        </button>
      </div>

      {/* Filter Chips & Search Bar */}
      <div className="p-5 rounded-card bg-surface border border-border shadow-card space-y-4">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-text-dim absolute left-3.5 top-3 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => handleFilterChange(setSearch, e.target.value)}
              placeholder="Search file path, algorithm, symbol, detector..."
              className="w-full pl-10 pr-3 py-2 bg-surface-2 border border-border rounded-xl text-xs font-semibold text-text-main placeholder:text-text-dim focus:outline-none focus:border-accent transition"
            />
            {search && (
              <button
                onClick={() => handleFilterChange(setSearch, '')}
                className="absolute right-3 top-2.5 text-text-dim hover:text-text-main"
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
                className="px-3 py-2 bg-surface-2 border border-border rounded-xl text-xs font-semibold text-text-main focus:outline-none focus:border-accent transition cursor-pointer"
              >
                <option value="risk">Sort by Risk Score</option>
                <option value="urgency">Sort by Urgency</option>
                <option value="path">Sort by File Path</option>
                <option value="confidence">Sort by Confidence</option>
              </select>
            </div>

            <button
              onClick={() => setOrder(order === 'asc' ? 'desc' : 'asc')}
              className="px-3 py-2 rounded-xl bg-surface-2 border border-border text-xs text-text-main hover:bg-surface-3 flex items-center gap-1.5 transition font-bold cursor-pointer"
              title={`Switch to ${order === 'asc' ? 'descending' : 'ascending'}`}
            >
              <ArrowUpDown className="w-3.5 h-3.5 text-accent" />
              <span>{order.toUpperCase()}</span>
            </button>
          </div>
        </div>

        {/* Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-2.5 pt-1 text-xs">
          <span className="text-text-dim flex items-center gap-1.5 text-xs font-bold mr-1">
            <Filter className="w-3.5 h-3.5 text-accent" /> Filters:
          </span>

          {/* Band Filter */}
          <select
            value={band}
            onChange={(e) => handleFilterChange(setBand, e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-surface-2 border border-border text-text-main text-xs font-semibold focus:outline-none focus:border-accent cursor-pointer"
          >
            <option value="">All Severity Bands</option>
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
            className="px-3 py-1.5 rounded-lg bg-surface-2 border border-border text-text-main text-xs font-semibold focus:outline-none focus:border-accent cursor-pointer"
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
            className="px-3 py-1.5 rounded-lg bg-surface-2 border border-border text-text-main text-xs font-semibold focus:outline-none focus:border-accent cursor-pointer"
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
            className="px-3 py-1.5 rounded-lg bg-surface-2 border border-border text-text-main text-xs font-semibold focus:outline-none focus:border-accent cursor-pointer"
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
              className="px-3 py-1.5 rounded-lg border border-danger-border bg-danger-subtle text-danger hover:opacity-90 transition text-xs font-bold cursor-pointer"
            >
              Clear Filters
            </button>
          )}

          <div className="ml-auto text-text-dim text-xs font-mono font-semibold">
            {pageData ? `Showing ${pageData.items.length} of ${pageData.total} findings` : ''}
          </div>
        </div>
      </div>

      {/* Findings Table */}
      <div className="rounded-card border border-border bg-surface overflow-hidden shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-text-muted uppercase tracking-wider text-[11px] font-bold sticky top-0">
                <th className="py-3 px-4">Band</th>
                <th className="py-3 px-4">Algorithm & OID</th>
                <th className="py-3 px-4">Source Location</th>
                <th className="py-3 px-4">Evidence Class</th>
                <th className="py-3 px-4">Quantum Status</th>
                <th className="py-3 px-4 text-center">Score</th>
                <th className="py-3 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-text-muted font-mono">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-accent" />
                    Querying cryptographic findings...
                  </td>
                </tr>
              ) : !pageData || pageData.items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-text-muted font-mono">
                    No findings match the applied filter criteria.
                  </td>
                </tr>
              ) : (
                pageData.items.map((f) => {
                  const asset = f.asset;
                  const risk = f.risk;
                  const regAlg = resolveAlgorithm(asset?.canonical_name || '');
                  const displayName = asset?.canonical_name || f.symbol || 'Unknown Primitive';

                  return (
                    <tr
                      key={f.id}
                      onClick={() => setSelectedFinding(f)}
                      className="hover:bg-surface-2/60 cursor-pointer transition group"
                    >
                      {/* Band */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {risk && <BandBadge band={risk.band} size="sm" />}
                      </td>

                      {/* Algorithm */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-text-main group-hover:text-accent transition-colors">
                          {displayName}
                        </div>
                        <div className="text-[11px] text-text-dim font-mono">
                          {asset?.oid || regAlg?.oid || asset?.purpose || 'No OID'}
                        </div>
                      </td>

                      {/* Location */}
                      <td className="py-3.5 px-4 max-w-xs truncate">
                        <div className="flex items-center gap-1.5 text-text-muted truncate">
                          <FileCode className="w-3.5 h-3.5 text-accent shrink-0" />
                          <span className="truncate font-mono text-[11px] font-semibold">{f.file_path}</span>
                        </div>
                        {f.line_start && (
                          <div className="text-[11px] text-accent-2 font-mono font-bold pl-5">
                            Line {f.line_start}{f.line_end ? `–${f.line_end}` : ''}
                          </div>
                        )}
                      </td>

                      {/* Evidence Class */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
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
                        <div className="font-bold text-text-main font-mono">
                          {risk?.composite_risk ?? 0}/100
                        </div>
                        <div className="text-[11px] text-text-dim font-mono">
                          C:{risk?.classical_risk ?? 0} · Q:{risk?.quantum_risk ?? 0}
                        </div>
                      </td>

                      {/* Action */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedFinding(f);
                          }}
                          className="px-3 py-1 rounded-lg bg-surface-2 hover:bg-surface-3 text-accent font-bold text-xs border border-border transition cursor-pointer"
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
          <div className="p-4 border-t border-border bg-surface-2/40 flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-xs">
            <div className="flex items-center gap-2">
              <span className="text-text-dim font-sans font-semibold">Rows per page:</span>
              <select
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setOffset(0);
                }}
                className="px-2 py-1 bg-surface-2 border border-border rounded text-text-main font-semibold"
              >
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={250}>250</option>
              </select>
              <span className="text-text-dim ml-2">
                Page {currentPage} of {totalPages || 1}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - limit))}
                className="p-1.5 rounded-lg border border-border bg-surface-2 text-text-muted hover:text-text-main disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={!pageData.has_next}
                onClick={() => setOffset(offset + limit)}
                className="p-1.5 rounded-lg border border-border bg-surface-2 text-text-muted hover:text-text-main disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Finding Detail Drawer */}
      <FindingDetailDrawer
        scanId={activeScanId}
        finding={selectedFinding}
        onClose={() => setSelectedFinding(null)}
      />
    </div>
  );
};
