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


/**
 * Receive an ORIGINAL selector's optional safeRewriteRules resource.
 *
 * A missing fiber, a rule not selected for review, or a contradictory source
 * policy NEVER yields a candidate. The producer's own REPLACEMENTS keys are the
 * sole implementation inventory: callers cannot enable an unimplemented rule.
 *
 * This does not validate original-source custody, grammar, semantic equivalence,
 * consent, editor approval or publication authority.
 */
export function reviewPtgaeProposalUnderFiber({
  sourceText, sourceVersion = null, safeRewriteRules = null,
} = {}) {
  const original = proposePtgaeRewrites({ sourceText, sourceVersion });
  const sourceSha256 = original.source.sha256;
  if (safeRewriteRules == null) {
    return {
      kind: 'ptgae.selected-rewrite-review.v0',
      disposition: 'fiber-unavailable',
      reason: 'SAFE_REWRITE_FIBER_NOT_SELECTED',
      sourceSha256,
      permittedRuleIds: [], deniedRuleIds: [], proposal: null, evaluation: null,
      automaticApplicationAllowed: false, executableEffects: [],
    };
  }
  if (typeof safeRewriteRules !== 'object' || Array.isArray(safeRewriteRules)
    || !Array.isArray(safeRewriteRules.rules)) {
    throw new TypeError('safeRewriteRules must be a selected resource with a rules array');
  }
  const version = safeRewriteRules.version;
  if (typeof version !== 'string'
    || !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(version)) {
    throw new TypeError('safeRewriteRules.version must be a semantic version');
  }
  let locale;
  try {
    [locale] = Intl.getCanonicalLocales(safeRewriteRules.language);
  } catch {
    throw new RangeError('safeRewriteRules requires an en-US source edition');
  }
  if (locale !== 'en-US' || (safeRewriteRules.locale !== undefined
    && Intl.getCanonicalLocales(safeRewriteRules.locale)[0] !== locale)) {
    throw new RangeError('unsupported safeRewriteRules language edition');
  }
  const declared = new Set();
  const permitted = [];
  for (const rule of safeRewriteRules.rules) {
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)
      || typeof rule.ruleId !== 'string' || typeof rule.action !== 'string') {
      throw new TypeError('selected safeRewriteRules contains an invalid rule');
    }
    if (declared.has(rule.ruleId)) throw new RangeError('duplicate selected safe-rewrite rule');
    declared.add(rule.ruleId);
    if (rule.automaticApplicationAllowed === true) {
      throw new RangeError('review-only safe rewrite fiber must not claim automatic application');
    }
    if (rule.action === 'propose-for-review' && Object.hasOwn(REPLACEMENTS, rule.ruleId)) {
      permitted.push(rule.ruleId);
    }
  }
  const permittedRuleIds = permitted.sort();
  const deniedRuleIds = [...new Set(original.edits
    .map(edit => edit.ruleId).filter(id => !permittedRuleIds.includes(id)))].sort();
  if (deniedRuleIds.length) {
    return {
      kind: 'ptgae.selected-rewrite-review.v0',
      disposition: 'fiber-restricted',
      reason: 'REWRITE_RULE_NOT_SELECTED',
      sourceSha256,
      permittedRuleIds, deniedRuleIds, proposal: null, evaluation: null,
      automaticApplicationAllowed: false, executableEffects: [],
    };
  }
  const evaluation = evaluatePtgaeCandidate({
    sourceText, candidateText: original.candidateText, sourceVersion,
  });
  return {
    kind: 'ptgae.selected-rewrite-review.v0',
    disposition: evaluation.disposition,
    reason: evaluation.reason,
    sourceSha256,
    permittedRuleIds, deniedRuleIds: [],
    proposal: original, evaluation,
    automaticApplicationAllowed: false,
    executableEffects: [],
  };
}
