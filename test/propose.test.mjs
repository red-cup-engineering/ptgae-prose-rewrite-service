import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { proposePtgaeRewrites, evaluatePtgaeCandidate } from '../src/propose.mjs';

const hash = text => createHash('sha256').update(text).digest('hex');

test('PTGAE review proposal is source-anchored, hashed, and nonexecuting',()=>{
  const sourceText='😀 In order to test, we stopped due to the fact that the service failed.';
  const result=proposePtgaeRewrites({sourceText,sourceVersion:'r4'});
  assert.equal(result.disposition,'review-required');
  assert.equal(result.candidateText,'😀 To test, we stopped because the service failed.');
  assert.deepEqual(result.edits.map(x=>x.ruleId),['PTG004','PTG010']);
  assert.equal(result.source.sha256,hash(sourceText));
  assert.equal(result.candidate.sha256,hash(result.candidateText));
  assert.equal(result.sourceVersion,'r4');
  assert.deepEqual(result.executableEffects,[]);
  assert.equal(result.automaticApplicationAllowed,false);
  for(const edit of result.edits){
    assert.equal(sourceText.slice(...edit.sourceSpan),edit.before);
    assert.equal(result.candidateText.slice(...edit.candidateSpan),edit.after);
    assert.equal(edit.semanticPreservation,'not-established');
  }
});

test('quotes, code, frontmatter, blockquotes, link destinations and table cells are protected',()=>{
  const sourceText=['---','title: In order to finish','---','```','In order to work','```',
    '> In order to do it','"In order to finish"','[in order to](https://example.com/in-order-to)',
    '| In order to | field |','In order to publish.'].join('\n');
  const p=proposePtgaeRewrites({sourceText});
  assert.equal(p.edits.length,2);
  assert.ok(p.candidateText.includes('title: In order to finish'));
  assert.ok(p.candidateText.includes('"In order to finish"'));
  assert.ok(p.candidateText.includes('https://example.com/in-order-to'));
  assert.ok(p.candidateText.includes('> In order to do it'));
});

test('proposed text is deterministic and a second pass has no more edits',()=>{
  const sourceText='Due to the fact that it was late, in order to continue we waited.';
  const before=proposePtgaeRewrites({sourceText});
  assert.deepEqual(before,proposePtgaeRewrites({sourceText}));
  const after=proposePtgaeRewrites({sourceText:before.candidateText});
  assert.equal(after.disposition,'preserve');
  assert.deepEqual(after.edits,[]);
});

test('identity is preserved and unrecognized transformations cannot be admitted',()=>{
  assert.equal(evaluatePtgaeCandidate({sourceText:'A',candidateText:'A'}).disposition,'preserve');
  assert.equal(evaluatePtgaeCandidate({sourceText:'A',candidateText:'B'}).disposition,'reject');
  const sourceText='In order to test.';
  const candidateText=proposePtgaeRewrites({sourceText}).candidateText;
  const result=evaluatePtgaeCandidate({sourceText,candidateText});
  assert.equal(result.disposition,'review-required');
  assert.equal(result.automaticApplicationAllowed,false);
});

test('dangerous changes in the existing semantic-drift fixture corpus are rejected',()=>{
  const data=JSON.parse(readFileSync(new URL('../../../data/fixtures/semantic-drift-cases.json',import.meta.url)));
  for(const fixture of data.cases.filter(x=>x.expected==='reject')){
    const got=evaluatePtgaeCandidate({sourceText:fixture.source,candidateText:fixture.candidate});
    assert.equal(got.disposition,'reject',fixture.id);
  }
  const identity=data.cases.find(x=>x.expected==='preserve');
  assert.equal(evaluatePtgaeCandidate({sourceText:identity.source,candidateText:identity.candidate}).disposition,'preserve');
  const manual=data.cases.find(x=>x.expected==='review-required');
  assert.equal(evaluatePtgaeCandidate({sourceText:manual.source,candidateText:manual.candidate}).disposition,'reject');
  // A potentially acceptable but unsupported edit needs review *outside* this
  // narrow proposal engine; rejection is not a semantics theorem.
});

test('source is not mutated and invalid inputs refuse',()=>{
  assert.throws(()=>proposePtgaeRewrites({sourceText:null}),/must be a string/);
  assert.throws(()=>proposePtgaeRewrites({sourceText:'x',sourceVersion:''}),/sourceVersion/);
  const sourceText='In order to perform the test.';
  const result=proposePtgaeRewrites({sourceText});
  assert.equal(sourceText,'In order to perform the test.');
  assert.equal(result.interpretationAuthority,'style-candidate-only');
});
