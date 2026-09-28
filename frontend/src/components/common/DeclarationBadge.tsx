import React from 'react';
import { FileCode2, FlaskConical } from 'lucide-react';

/**
 * Did the tool find this by reading a *call*, or by reading a *declaration*?
 *
 * This distinction is the reason the tool exists rather than being another AST
 * scanner. A call site says "somebody invoked AES here". A declaration says
 * "this library accepts SHA-1, here is its algorithm table" - and that is
 * where most of a codebase's crypto surface actually lives, in registries,
 * config defaults, provider strings and JWK literals that no call site names.
 *
 * It is also an honesty badge. Declaration findings are INFERRED, not parsed,
 * and the severity cap that follows from that is the policy pack refusing to
 * call an unexecuted inference critical. Showing the badge lets a reviewer ask
 * the useful question - what does this find that never calls a primitive?
 */

const DECLARATION_DETECTORS = new Set(['scanner.declarations']);

/**
 * Is this finding declaration-shaped?
 *
 * The detector ID alone is not the right test, and trusting it would have been
 * a quiet lie: `scanner.declarations` is the Python-AST declaration scanner,
 * so a Java JCA provider string or a Go digest binding - which are equally
 * declaration-shaped - would have gone unbadged. The server tells us
 * explicitly by attaching a reasoning string, so we ask for that and fall back
 * to the detector ID when the reasoning is absent.
 *
 * The underlying judgement is the backend's. This function only reads it.
 */
export const isDeclarationFinding = (
  detectorId?: string | null,
  reasoning?: string | null
): boolean => !!reasoning || (!!detectorId && DECLARATION_DETECTORS.has(detectorId));

interface Props {
  detectorId?: string | null;
  reasoning?: string | null;
  compact?: boolean;
}

export const DeclarationBadge: React.FC<Props> = ({ detectorId, reasoning, compact = false }) => {
  if (!isDeclarationFinding(detectorId, reasoning)) return null;
  return (
    <span
      title={
        'Found on a declaration surface - an algorithm registry, a class-level constant, ' +
        'a provider string, or a JSON Web Key - rather than at a call site. These are ' +
        'inferred, not parsed, so the policy pack caps their severity accordingly.'
      }
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-fuchsia-500/40 bg-fuchsia-950/30 text-fuchsia-300 text-[10px] font-mono font-medium tracking-tight whitespace-nowrap"
    >
      {compact ? (
        <FlaskConical className="w-2.5 h-2.5" />
      ) : (
        <>
          <FlaskConical className="w-3 h-3" />
          <span>Declared</span>
        </>
      )}
    </span>
  );
};

interface ContextProps {
  sourceContext?: string | null;
  note?: string | null;
}

export const SourceContextBadge: React.FC<ContextProps> = ({ sourceContext, note }) => {
  if (!sourceContext || sourceContext === 'production') return null;
  const nonProd = sourceContext === 'non_production';
  return (
    <span
      title={note || 'Found in a test, fixture, example, or vendored path.'}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-mono font-medium tracking-tight whitespace-nowrap ${
        nonProd
          ? 'border-slate-600 bg-slate-800/60 text-slate-300'
          : 'border-slate-700 bg-slate-900 text-slate-400'
      }`}
    >
      <FileCode2 className="w-2.5 h-2.5" />
      <span>{nonProd ? 'Test / fixture' : 'Context unknown'}</span>
    </span>
  );
};
