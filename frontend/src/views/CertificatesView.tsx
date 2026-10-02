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
        <div className="w-16 h-16 rounded-2xl bg-white border border-slate-300 flex items-center justify-center mx-auto text-indigo-600 shadow-sm">
          <Award className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">No Scan Target Selected</h2>
        <p className="text-sm text-slate-600">
          Select or launch a scan to view parsed X.509 certificates and trust paths.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6 animate-in fade-in duration-200">
      {/* Title */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <Award className="w-6 h-6 text-indigo-600" />
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              X.509 Certificate Inventory & Validity
            </h1>
            <HelpTooltip
              title="X.509 Certificate Analysis"
              content="Catalogs parsed leaf, intermediate, and root certificates. Identifies expiring validity windows and weak or quantum-vulnerable signature schemes (RSA, ECDSA)."
            />
          </div>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            Parsed leaf, intermediate and root certificates with validity windows and signature algorithms.
          </p>
        </div>

        <button
          onClick={loadCerts}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold shadow-sm transition cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
          <span>Refresh Certs</span>
        </button>
      </div>

      {/* Certificates Cards */}
      {loading ? (
        <div className="p-12 text-center text-slate-500">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-600" />
          Loading certificate assets...
        </div>
      ) : certs.length === 0 ? (
        <div className="p-12 text-center text-slate-500 border border-dashed border-slate-300 rounded-2xl bg-white shadow-sm">
          No X.509 certificates detected in this scan target.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {certs.map((c) => {
            return (
              <div
                key={c.id}
                className="p-5 rounded-2xl bg-white border border-slate-300 shadow-sm hover:border-indigo-400 space-y-4 flex flex-col justify-between transition group"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                        c.expired
                          ? 'bg-rose-50 text-rose-800 border-rose-300'
                          : 'bg-emerald-50 text-emerald-800 border-emerald-300'
                      }`}
                    >
                      {c.expired ? 'Expired Certificate' : 'Active / Valid'}
                    </span>
                    {c.is_ca && (
                      <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold">
                        CA Root
                      </span>
                    )}
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block font-bold">Subject:</span>
                    <p className="text-xs text-slate-900 font-bold break-all">{c.subject}</p>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block font-bold">Issuer:</span>
                    <p className="text-xs text-slate-600 break-all">{c.issuer}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-200 font-mono">
                    <div>
                      <span className="text-slate-500 text-[10px] block font-sans font-semibold">Public Key:</span>
                      <span className="text-slate-900 font-bold">
                        {c.public_key_algorithm} {c.public_key_bits ? `(${c.public_key_bits}b)` : ''}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-500 text-[10px] block font-sans font-semibold">Signature:</span>
                      <span className="text-slate-900 font-bold">{c.signature_algorithm}</span>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 space-y-1.5 font-mono">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                      <span>Valid until: <strong className="text-slate-900 font-bold">{c.not_after.split('T')[0]}</strong></span>
                    </div>
                    <div className="flex items-center gap-1.5 truncate">
                      <FileCode className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span className="truncate text-slate-800">{c.source_path}</span>
                    </div>
                  </div>
                </div>

                <div className="text-[10px] text-slate-500 truncate pt-2 border-t border-slate-200 flex items-center justify-between font-mono">
                  <span>FP: {c.fingerprint_sha256.substring(0, 16)}...</span>
                  <button
                    onClick={() => handleCopy(c.fingerprint_sha256, c.id)}
                    title="Copy full SHA-256 fingerprint"
                    className="p-1 hover:text-indigo-600 transition text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    {copiedId === c.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
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
