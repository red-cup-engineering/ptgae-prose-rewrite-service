import assert from 'node:assert/strict';
import { rewritePTGAE, SAFE_REWRITE_CODES } from '../src/ptgae-rewrite.mjs';

const cases = [
  ['The change may potentially affect the parser.', 'The change may affect the parser.', 'PTR001'],
  ['The change could possibly affect the parser.', 'The change could affect the parser.', 'PTR002'],
  ['The change might perhaps affect the parser.', 'The change might affect the parser.', 'PTR003'],
  ['We parse in order to preserve provenance.', 'We parse to preserve provenance.', 'PTR004'],
  ['The build failed due to the fact that the lockfile changed.', 'The build failed because the lockfile changed.', 'PTR005'],
  ['In light of the fact that the source changed, we rebuilt the index.', 'Because the source changed, we rebuilt the index.', 'PTR006'],
  ['The parser has the ability to preserve provenance.', 'The parser can preserve provenance.', 'PTR007'],
  ['At this point in time the cache is empty.', 'Now the cache is empty.', 'PTR008'],
  ['At the present time the cache is empty.', 'Now the cache is empty.', 'PTR009'],
  ['In the event that validation fails, reject the record.', 'If validation fails, reject the record.', 'PTR010'],
  ['The job runs on a regular basis.', 'The job runs regularly.', 'PTR011'],
  ['Subsequent to validation, store the record.', 'After validation, store the record.', 'PTR012'],
  ['Prior to validation, hash the record.', 'Before validation, hash the record.', 'PTR013'],
  ['With regard to caching, store one copy.', 'About caching, store one copy.', 'PTR014'],
  ['The Sociology Services Section maintains knowledge and practices for the study of social structure.', 'The Sociology Services Section studies social structure.', 'PTR026'],
  ['The Music Services Section maintains knowledge and practices for this service domain.', 'Description incomplete.', 'PTR027'],
  ['This section holds shared knowledge and services concerning Tai Chi.', 'This section provides shared Tai Chi knowledge and services.', 'PTR028'],
  ['This is the home for OECD FORD 5.3, education research.', 'This section covers OECD FORD 5.3: education research.', 'PTR029']
];

for (const [source, expected, code] of cases) {
  const result = rewritePTGAE(source);
  assert.equal(result.text, expected, code + ' output mismatch');
  assert.ok(result.changes.includes(code), code + ' missing change receipt');
  assert.ok(SAFE_REWRITE_CODES.has(code), code + ' missing safe-rewrite registration');
}

for (const source of [
  'It is important to note that the parser preserves provenance.',
  'Unknown: the provider does not expose remaining quota.',
  'The repository is the canonical home of the signed corpus.',
  'Differentiate f with respect to x.',
  'With respect to caching, store one copy.',
  '`may potentially` names a banned stacked-modality phrase.',
  '```\nThe change may potentially affect the parser.\n```',
  '> The source says the change may potentially affect the parser.',
  '   > It is important to note that this is quoted source text.',
  'The source says "the change may potentially affect the parser."',
  'The source says “the change may potentially affect the parser.”',
  '> Source states:\nThe change may potentially matter.',
  '   > Source states:\nThe change could possibly matter.\n>\nAnother quoted paragraph might perhaps matter.',
  '🔬 Source evidence:\n> Source states:\nThe change may potentially matter.'
]) {
  const result = rewritePTGAE(source);
  assert.equal(result.text, source, 'unsafe, quoted, or protected text changed: ' + source);
  assert.equal(result.changed, false, 'unexpected rewrite receipt: ' + source);
}

const mixedStraight = rewritePTGAE('The change may potentially matter; the source says "it may potentially matter."');
assert.equal(mixedStraight.text, 'The change may matter; the source says "it may potentially matter."');
assert.deepEqual(mixedStraight.changes, ['PTR001']);

const mixedCurly = rewritePTGAE('The change could possibly matter; the source says “it could possibly matter.”');
assert.equal(mixedCurly.text, 'The change could matter; the source says “it could possibly matter.”');
assert.deepEqual(mixedCurly.changes, ['PTR002']);

const afterQuote = rewritePTGAE('> Source states:\nThe change may potentially matter.\n\nOur change could possibly help.');
assert.equal(afterQuote.text, '> Source states:\nThe change may potentially matter.\n\nOur change could help.');
assert.deepEqual(afterQuote.changes, ['PTR002']);
assert.equal(SAFE_REWRITE_CODES.has('PTR015'), false);

console.log('ok ' + cases.length + ' safe rewrite fixtures; quoted and protected prose unchanged');
