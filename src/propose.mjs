import { createHash } from 'node:crypto';
import { analyzePTGAE } from '../../ptgae-prose-analysis-service/src/analyze.mjs';

const sha256 = text => createHash('sha256').update(text, 'utf8').digest('hex');

// Review-only proposals. A fixed phrase substitution cannot establish
// equivalence of an English utterance in its surrounding context.
const REPLACEMENTS = Object.freeze({
  PTG004: text => /^[A-Z]/u.test(text) ? 'To' : 'to',
  PTG010: text => /^[A-Z]/u.test(text) ? 'Because' : 'because',
});

/**
 * Generate a deterministic source-anchored review packet; no disk writes,
 * semantic proof, upstream English parse, deployment, or authorization.
 */
export function proposePtgaeRewrites({ sourceText, sourceVersion = null }) {
  if (typeof sourceText !== 'string') throw new TypeError('sourceText must be a string');
  if (sourceVersion !== null && (typeof sourceVersion !== 'string' || !sourceVersion.length)) {
    throw new TypeError('sourceVersion must be null or a nonempty string');
  }
  const findings = analyzePTGAE(sourceText, { sourceVersion });
  const eligible = findings.filter(finding => Object.hasOwn(REPLACEMENTS, finding.ruleId));
  const edits = [];
  let after = '';
  let oldCursor = 0;
  let newCursor = 0;
  for (const finding of eligible) {
    const [start, end] = finding.sourceSpan;
    if (start < oldCursor) continue;
    const before = sourceText.slice(start, end);
    const replacement = REPLACEMENTS[finding.ruleId](before);
    if (replacement === before) continue;
    const untouched = sourceText.slice(oldCursor, start);
    after += untouched + replacement;
    newCursor += untouched.length;
    edits.push({
      ruleId: finding.ruleId,
      sourceSpan: [start, end],
      candidateSpan: [newCursor, newCursor + replacement.length],
      before,
      after: replacement,
      approvalStatus: 'review-required',
      semanticPreservation: 'not-established',
    });
    newCursor += replacement.length;
    oldCursor = end;
  }
  const candidateText = after + sourceText.slice(oldCursor);
  return {
    kind: 'ptgae.review-only-rewrite.v0',
    disposition: edits.length ? 'review-required' : 'preserve',
    sourceVersion,
    source: { sha256: sha256(sourceText), utf16Length: sourceText.length, coordinates: 'utf16-half-open' },
    candidate: { sha256: sha256(candidateText), utf16Length: candidateText.length },
    candidateText,
    edits,
    automaticApplicationAllowed: false,
    interpretationAuthority: 'style-candidate-only',
    semanticPreservation: 'not-established',
    executableEffects: [],
  };
}

/** Reject arbitrary supplied rewrites unless they exactly match a review-only
 * constrained proposal. Reject means "not allowed by this service", not
 * a proof that the two natural-language passages differ semantically.
 */
export function evaluatePtgaeCandidate({ sourceText, candidateText, sourceVersion = null }) {
  if (typeof sourceText !== 'string' || typeof candidateText !== 'string') {
    throw new TypeError('sourceText and candidateText must be strings');
  }
  const proposal = proposePtgaeRewrites({ sourceText, sourceVersion });
  const disposition = candidateText === sourceText ? 'preserve'
    : candidateText === proposal.candidateText && proposal.edits.length ? 'review-required'
      : 'reject';
  return {
    kind: 'ptgae.rewrite-admission.v0',
    disposition,
    reason: disposition === 'reject' ? 'OUTSIDE_CONSTRAINED_PROPOSAL' :
      disposition === 'preserve' ? 'IDENTICAL_SOURCE' : 'EDITOR_REVIEW_REQUIRED',
    sourceSha256: sha256(sourceText),
    candidateSha256: sha256(candidateText),
    sourceVersion,
    automaticApplicationAllowed: disposition === 'preserve',
    semanticPreservation: disposition === 'preserve' ? 'exact-source-identity' : 'not-established',
    executableEffects: [],
  };
}
