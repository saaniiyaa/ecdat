import React, { useEffect, useState, useCallback } from 'react';
import { useScan } from '../context/ScanContext';
import { ecdatApi } from '../api/endpoints';
import { CertificateOut } from '../types/api';
import { HelpTooltip } from '../components/common/HelpTooltip';
import {
  Award,
  RefreshCw,
  Clock,
  FileCode,
  ShieldAlert,
  Copy,
  Check,
} from 'lucide-react';

export const CertificatesView: React.FC = () => {
  const { activeScanId } = useScan();
  const [certs, setCerts] = useState<CertificateOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadCerts = useCallback(async () => {
    if (!activeScanId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await ecdatApi.getCertificates(activeScanId);
      setCerts(res.data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load certificates');
    } finally {
      setLoading(false);
    }
  }, [activeScanId]);

  useEffect(() => {
    loadCerts();
  }, [loadCerts]);

  const handleCopy = (fingerprint: string, id: string) => {
    navigator.clipboard.writeText(fingerprint);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (!activeScanId) {
    return (
      <div className="max-w-4xl mx-auto p-12 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-surface-2 border border-border flex items-center justify-center mx-auto text-accent shadow-card">
          <Award className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-text-main">No Scan Target Selected</h2>
        <p className="text-sm text-text-muted">
          Select or launch a scan to view parsed X.509 certificates and trust paths.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6 animate-in fade-in duration-200">
      {/* Title */}
      <div className="flex items-center justify-between border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <Award className="w-6 h-6 text-accent" />
            <h1 className="text-2xl font-bold text-text-main tracking-tight">
              X.509 Certificate Inventory & Validity
            </h1>
            <HelpTooltip
              title="X.509 Certificate Analysis"
              content="Catalogs parsed leaf, intermediate, and root certificates. Identifies expiring validity windows and weak or quantum-vulnerable signature schemes (RSA, ECDSA)."
            />
          </div>
          <p className="text-xs sm:text-sm text-text-muted mt-1">
            Parsed leaf, intermediate and root certificates with validity windows and signature algorithms.
          </p>
        </div>

        <button
          onClick={loadCerts}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-border bg-surface-2 hover:bg-surface-3 text-text-main text-xs font-bold shadow-sm transition cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-accent' : ''}`} />
          <span>Refresh Certs</span>
        </button>
      </div>

      {/* Certificates Cards */}
      {loading ? (
        <div className="p-12 text-center text-text-muted">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-accent" />
          Loading certificate assets...
        </div>
      ) : certs.length === 0 ? (
        <div className="p-12 text-center text-text-muted border border-dashed border-border rounded-card bg-surface">
          No X.509 certificates detected in this scan target.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {certs.map((c) => {
            return (
              <div
                key={c.id}
                className="p-5 rounded-card bg-surface border border-border shadow-card hover:border-accent/40 space-y-4 flex flex-col justify-between transition group"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                        c.expired
                          ? 'bg-danger-subtle text-danger border-danger-border'
                          : 'bg-accent-subtle text-accent border-accent-border'
                      }`}
                    >
                      {c.expired ? 'Expired Certificate' : 'Active / Valid'}
                    </span>
                    {c.is_ca && (
                      <span className="px-2 py-0.5 rounded-full bg-accent-2-subtle text-accent-2 border border-accent-2-border text-[10px] font-bold">
                        CA Root
                      </span>
                    )}
                  </div>

                  <div>
                    <span className="text-[10px] text-text-dim uppercase block font-bold">Subject:</span>
                    <p className="text-xs text-text-main font-bold break-all">{c.subject}</p>
                  </div>

                  <div>
                    <span className="text-[10px] text-text-dim uppercase block font-bold">Issuer:</span>
                    <p className="text-xs text-text-muted break-all">{c.issuer}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-border font-mono">
                    <div>
                      <span className="text-text-dim text-[10px] block font-sans font-semibold">Public Key:</span>
                      <span className="text-text-main font-semibold">
                        {c.public_key_algorithm} {c.public_key_bits ? `(${c.public_key_bits}b)` : ''}
                      </span>
                    </div>

                    <div>
                      <span className="text-text-dim text-[10px] block font-sans font-semibold">Signature:</span>
                      <span className="text-text-main font-semibold">{c.signature_algorithm}</span>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-surface-2 border border-border text-[11px] text-text-muted space-y-1.5 font-mono">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-accent shrink-0" />
                      <span>Valid until: <strong className="text-text-main">{c.not_after.split('T')[0]}</strong></span>
                    </div>
                    <div className="flex items-center gap-1.5 truncate">
                      <FileCode className="w-3.5 h-3.5 text-text-dim shrink-0" />
                      <span className="truncate">{c.source_path}</span>
                    </div>
                  </div>
                </div>

                <div className="text-[10px] text-text-dim truncate pt-2 border-t border-border flex items-center justify-between font-mono">
                  <span>FP: {c.fingerprint_sha256.substring(0, 16)}...</span>
                  <button
                    onClick={() => handleCopy(c.fingerprint_sha256, c.id)}
                    title="Copy full SHA-256 fingerprint"
                    className="p-1 hover:text-accent transition text-text-dim cursor-pointer"
                  >
                    {copiedId === c.id ? <Check className="w-3.5 h-3.5 text-accent" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
