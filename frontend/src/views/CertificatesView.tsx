import React, { useEffect, useState, useCallback } from 'react';
import { useScan } from '../context/ScanContext';
import { ecdatApi } from '../api/endpoints';
import { CertificateOut } from '../types/api';
import {
  Award,
  AlertTriangle,
  CheckCircle,
  FileCode,
  Calendar,
  Key,
  Shield,
  RefreshCw,
  Clock,
} from 'lucide-react';

export const CertificatesView: React.FC = () => {
  const { activeScanId } = useScan();
  const [certs, setCerts] = useState<CertificateOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  if (!activeScanId) {
    return (
      <div className="max-w-4xl mx-auto p-12 text-center space-y-4">
        <Award className="w-12 h-12 text-slate-500 mx-auto" />
        <h2 className="text-xl font-bold font-mono text-slate-200">No Scan Selected</h2>
        <p className="text-sm text-slate-400 font-mono">
          Select or launch a scan to view parsed X.509 certificates and trust paths.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Title */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <Award className="w-6 h-6 text-amber-400" />
            <h1 className="text-2xl font-bold text-slate-100 tracking-tight">
              X.509 Certificate Inventory & Validity
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Parsed leaf, intermediate and root certificates with validity windows and signature algorithms
          </p>
        </div>

        <button
          onClick={loadCerts}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-700/70 bg-slate-800/60 hover:bg-slate-700/60 text-slate-200 text-xs font-medium shadow-sm transition cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-sky-400' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Certificates Cards */}
      {loading ? (
        <div className="p-12 text-center text-slate-400">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-sky-400" />
          Loading certificate assets...
        </div>
      ) : certs.length === 0 ? (
        <div className="p-12 text-center text-slate-400 border border-dashed border-slate-700/60 rounded-2xl">
          No X.509 certificates detected in this scan target.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {certs.map((c) => {
            return (
              <div
                key={c.id}
                className="p-5 rounded-2xl bg-slate-800/40 border border-slate-700/60 shadow-sm backdrop-blur-sm space-y-4 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={`px-2.5 py-0.5 rounded-md text-[11px] font-medium border ${
                        c.expired
                          ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                          : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      }`}
                    >
                      {c.expired ? 'Expired Certificate' : 'Active / Valid'}
                    </span>
                    {c.is_ca && (
                      <span className="px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-400 border border-sky-500/30 text-[10px] font-medium">
                        CA Root
                      </span>
                    )}
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block font-semibold">Subject:</span>
                    <p className="text-xs text-slate-200 font-semibold break-all">{c.subject}</p>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block font-semibold">Issuer:</span>
                    <p className="text-xs text-slate-400 break-all">{c.issuer}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-800">
                    <div>
                      <span className="text-slate-500 text-[10px] block">Public Key:</span>
                      <span className="text-slate-300 font-medium">
                        {c.public_key_algorithm} {c.public_key_bits ? `(${c.public_key_bits}b)` : ''}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-500 text-[10px] block">Signature:</span>
                      <span className="text-slate-300 font-medium">{c.signature_algorithm}</span>
                    </div>
                  </div>

                  <div className="p-2.5 rounded bg-slate-950 border border-slate-800/80 text-[11px] text-slate-400 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      <span>Valid until: {c.not_after.split('T')[0]}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-400 truncate">
                      <FileCode className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span className="truncate">{c.source_path}</span>
                    </div>
                  </div>
                </div>

                <div className="text-[10px] text-slate-500 truncate pt-2 border-t border-slate-800/60">
                  Fingerprint: {c.fingerprint_sha256.substring(0, 16)}...
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
