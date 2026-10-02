import React from 'react';
import { X, BookOpen, ShieldCheck, Atom, Clock, Key, FileCheck, Layers } from 'lucide-react';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const topics = [
    {
      title: 'What is Shor’s Algorithm & Quantum Vulnerability?',
      icon: Atom,
      color: 'text-danger',
      bg: 'bg-danger-subtle',
      explanation:
        'Shor’s algorithm is a quantum computing method that can easily factor large integers and solve discrete logarithms. It completely breaks classical public-key cryptography (RSA, DSA, ECDSA, ECDH) once a Cryptanalytically Relevant Quantum Computer (CRQC) is built. Symmetric algorithms (AES-256) remain safe under Grover’s algorithm with adequate key lengths.',
    },
    {
      title: 'What is Mosca’s Theorem (X + Y > Z)?',
      icon: Clock,
      color: 'text-warning',
      bg: 'bg-warning-subtle',
      explanation:
        'Mosca’s Theorem models quantum migration urgency: X = how long sensitive data must remain secret; Y = how long the migration to PQC will take; Z = time until a quantum computer arrives. If X + Y > Z, an adversary can record encrypted traffic today ("Harvest Now, Decrypt Later") and decrypt it when the quantum computer is ready. A negative margin means migration must start immediately.',
    },
    {
      title: 'What are the NIST PQC Standards (FIPS 203, 204, 205)?',
      icon: ShieldCheck,
      color: 'text-accent',
      bg: 'bg-accent-subtle',
      explanation:
        'NIST finalized post-quantum standards in August 2024: FIPS 203 (ML-KEM / CRYSTALS-Kyber) for Key Encapsulation Mechanisms (replacing RSA/DH); FIPS 204 (ML-DSA / CRYSTALS-Dilithium) for general lattice digital signatures; FIPS 205 (SLH-DSA / SPHINCS+) for stateless hash-based signatures.',
    },
    {
      title: 'What is a CBOM (Cryptographic Bill of Materials)?',
      icon: FileCheck,
      color: 'text-accent-2',
      bg: 'bg-accent-2-subtle',
      explanation:
        'CycloneDX CBOM (v1.6 & v1.7) is a machine-readable bill of materials cataloging every cryptographic asset, algorithm, key size, padding mode, and certificate in your estate. It allows automated security auditing and supply chain compliance.',
    },
    {
      title: 'What is Coverage Honesty & Unobserved Surfaces (Rule 6.1)?',
      icon: Layers,
      color: 'text-info',
      bg: 'bg-info-subtle',
      explanation:
        'True security honesty requires stating what was NOT inspected alongside what was verified. ECDAT explicitly accounts for compiled binaries, stripped libraries, or skipped directories so executives are never misled by false senses of complete safety.',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-surface border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="p-4 border-b border-border flex items-center justify-between bg-surface-2/40">
          <div className="flex items-center gap-2.5">
            <BookOpen className="w-5 h-5 text-accent" />
            <h2 className="font-bold text-sm text-text-main">
              ECDAT Cryptographic Knowledge & Guidance
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-text-dim hover:text-text-main hover:bg-surface transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-4">
          <p className="text-xs text-text-muted leading-relaxed">
            Welcome to the ECDAT Cryptographic Command Center. Here is a quick reference guide to help understand the risk models and terminology used throughout the dashboards.
          </p>

          <div className="space-y-3">
            {topics.map((t, idx) => {
              const Icon = t.icon;
              return (
                <div key={idx} className="p-4 rounded-xl bg-surface-2 border border-border space-y-2">
                  <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded-lg ${t.bg} ${t.color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <h3 className="text-xs font-bold text-text-main">{t.title}</h3>
                  </div>
                  <p className="text-xs font-normal text-text-muted leading-relaxed pl-8">
                    {t.explanation}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-4 border-t border-border bg-surface-2/30 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-surface-2 border border-border text-xs font-bold text-text-main hover:bg-surface-3 transition"
          >
            Close Guide
          </button>
        </div>
      </div>
    </div>
  );
};
