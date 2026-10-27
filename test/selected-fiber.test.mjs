import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewPtgaeProposalUnderFiber } from '../src/propose.mjs';

const fiber = {
  language: 'en-US', version: '0.1.0',
  rules: [
    { ruleId: 'PTG004', action: 'propose-for-review', automaticApplicationAllowed: false },
    { ruleId: 'PTG010', action: 'propose-for-review', automaticApplicationAllowed: false },
  ],
};
const text = 'In order to act, we waited due to the fact that evidence was missing.';

test('an absent optional language fiber withholds the original source proposal', () => {
  const review = reviewPtgaeProposalUnderFiber({ sourceText: text, sourceVersion: 'note@1' });
  assert.equal(review.disposition, 'fiber-unavailable');
  assert.equal(review.proposal, null);
  assert.match(review.sourceSha256, /^[a-f0-9]{64}$/u);
  assert.deepEqual(review.executableEffects, []);
});

test('a selected reviewed policy composes the existing source-anchored producer and evaluator', () => {
  const review = reviewPtgaeProposalUnderFiber({
    sourceText: text, sourceVersion: 'note@2', safeRewriteRules: fiber,
  });
  assert.equal(review.disposition, 'review-required');
  assert.equal(review.proposal.candidateText, 'To act, we waited because evidence was missing.');
  assert.deepEqual(review.permittedRuleIds, ['PTG004', 'PTG010']);
  assert.deepEqual(review.proposal.edits.map(x => x.ruleId), ['PTG004', 'PTG010']);
  assert.equal(review.evaluation.automaticApplicationAllowed, false);
  assert.equal(review.automaticApplicationAllowed, false);
  assert.equal(review.sourceSha256, review.evaluation.sourceSha256);
});

test('partially selected source rules withhold the entire rewrite candidate', () => {
  const limited = { ...fiber, rules: fiber.rules.slice(0, 1) };
  const review = reviewPtgaeProposalUnderFiber({ sourceText: text, safeRewriteRules: limited });
  assert.equal(review.disposition, 'fiber-restricted');
  assert.deepEqual(review.deniedRuleIds, ['PTG010']);
  assert.equal(review.proposal, null);
  assert.equal(review.evaluation, null);
});

test('selected source cannot activate an unimplemented rule or silently authorize a rewrite', () => {
  const unsupported = { ...fiber, rules: [{ ruleId: 'UNKNOWN', action: 'propose-for-review' }] };
  const review = reviewPtgaeProposalUnderFiber({
    sourceText: 'In order to test.', safeRewriteRules: unsupported,
  });
  assert.equal(review.disposition, 'fiber-restricted');
  assert.deepEqual(review.permittedRuleIds, []);
  assert.deepEqual(review.deniedRuleIds, ['PTG004']);
});

test('foreign, unversioned, duplicate and auto-apply policies refuse', () => {
  for (const value of [
    { ...fiber, language: 'fr-FR' },
    { ...fiber, version: 'latest' },
    { ...fiber, rules: [...fiber.rules, fiber.rules[0]] },
    { ...fiber, rules: [{ ...fiber.rules[0], automaticApplicationAllowed: true }] },
  ]) {
    assert.throws(() => reviewPtgaeProposalUnderFiber({
      sourceText: text, safeRewriteRules: value,
    }), /version|language|duplicate|automatic/u);
  }
});

test('quotation and code are preserved by the original prose analyzer under a selected fiber', () => {
  const sourceText = [
    '"In order to leave."',
    '`In order to test.`',
    'In order to complete the report.',
  ].join('\n');
  const review = reviewPtgaeProposalUnderFiber({ sourceText, safeRewriteRules: fiber });
  assert.equal(review.disposition, 'review-required');
  assert.equal(review.proposal.edits.length, 1);
  assert.ok(review.proposal.candidateText.includes('"In order to leave."'));
  assert.ok(review.proposal.candidateText.includes('`In order to test.`'));
  assert.ok(review.proposal.candidateText.includes('To complete the report.'));
});

test('a source needing no edits remains verbatim, with no implied grammatical certification', () => {
  const sourceText = 'The claim remains under review.';
  const review = reviewPtgaeProposalUnderFiber({ sourceText, safeRewriteRules: fiber });
  assert.equal(review.disposition, 'preserve');
  assert.equal(review.proposal.candidateText, sourceText);
  assert.equal(review.automaticApplicationAllowed, false);
});
