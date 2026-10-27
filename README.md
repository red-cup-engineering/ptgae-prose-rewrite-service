# PTGAE prose rewrite service — review-only 0.1

<!-- 561-group-standards:badges:start -->
[![Red Cup Engineering](https://img.shields.io/badge/561%20Group-Red%20Cup%20Engineering-c0392b)](https://github.com/red-cup-engineering)
[![License: MIT](https://img.shields.io/badge/license-MIT-c0392b)](LICENSE)
[![Indigenous data: CARE](https://img.shields.io/badge/Indigenous%20data-CARE-4b6f44)](https://github.com/red-cup-engineering/.github/blob/main/GOVERNANCE.md)
[![Tips welcome](https://img.shields.io/badge/tips-welcome-d4a017)](https://github.com/561-group/.github/blob/main/TIPS.md)
<!-- 561-group-standards:badges:end -->

This service proposes **two narrowly bounded** stylistic substitutions using the existing PTGAE analyzer. It changes no files, sends no messages and provides **no semantic-equivalence certificate**. It is a private engineering component, not an English parser or a standardized controlled-English compiler.

## What is implemented

- `proposePtgaeRewrites({ sourceText, sourceVersion })`: deterministic dry-run proposal with source text SHA-256, candidate text SHA-256, UTF-16 half-open before/after spans, underlying PTGAE rule IDs, and review requirements.
- `evaluatePtgaeCandidate({ sourceText, candidateText, sourceVersion })`: allows exact identity, identifies a candidate exactly matching this service's narrow proposal as **review-required**, and rejects other changes **from this service**. Rejection is not an assertion that a human's alternative paraphrase is semantically wrong.
- Only `PTG004` (`in order to` → `to`) and `PTG010` (`due to the fact that` → `because`) are proposed, with initial capitalization preserved. Even these require review of local context.
- Proposals inherit protected source spans from the analyzer: frontmatter, code fences, blockquotes, inline code, quoted strings, Markdown link destinations and table rows are conservatively excluded. An incomplete delimiter causes abstention over its uncertain region rather than a guessed edit.
- Matching source and candidate in an identity operation is the **only** case where `automaticApplicationAllowed` is true. No proposed edit is automatically applied.

## Example

```js
import { proposePtgaeRewrites, evaluatePtgaeCandidate } from './src/propose.mjs';

const sourceText = 'In order to test, we paused due to the fact that power failed.';
const proposed = proposePtgaeRewrites({ sourceText, sourceVersion: 'doc-r5' });
// proposed.candidateText: 'To test, we paused because power failed.'
// proposed.disposition: 'review-required'
// proposed.automaticApplicationAllowed: false
const decision = evaluatePtgaeCandidate({
  sourceText, candidateText: proposed.candidateText, sourceVersion: 'doc-r5'
});
// decision.disposition: 'review-required'
```

## Receiving limits

This service does **not** prove that “because” preserves causality or that an infinitive's purpose is unchanged; those are scientific and editorial questions. It does not accept arbitrary paraphrases, certify factual truth, determine permissions or bind the two competing upstream English-algebra versions. It cannot certify CommonMark correctness, direct speech, nested structures, Markdown tables without separators, HTML, or arbitrary quotation conventions. The analyzer is conservative but not a full Markdown parser; unfamiliar syntaxes and their protection require additional fixtures.

The pre-existing [semantic drift corpus](../../data/records/fixtures/semantic-drift-cases.json) supplies negative controls for quantifiers, modality, attribution, measurement, deadlines and quoted evidence. A general manual-review example in that corpus is *not* in this narrow service's allow-list and is therefore rejected for automatic admission, not condemned as semantically wrong.

Run `npm test` from the PTGAE repository root or `node --test test/*.test.mjs` inside this service. A passing test establishes only behavior covered by those fixtures. No public release or end-to-end English/SignStack integration is implied.

## Consuming selected review-only language fibers (0.1.1-dev.0 candidate)

`reviewPtgaeProposalUnderFiber({ sourceText, sourceVersion, safeRewriteRules })` receives **the actual optional source-owned language-fiber resource** selected by `ptgae-language-fiber-service`, instead of maintaining a second rule-permission list in a parent application. This original rewrite service alone owns which existing review-only substitution implementations exist; the selected source fiber must explicitly opt each one in using `action: "propose-for-review"`.

Missing optional selection returns `fiber-unavailable`, no candidate. If even one original proposed edit is outside the selected source rules, it returns `fiber-restricted` and **withholds the entire candidate**, preserving the original UTF-16 positions and avoiding an invented partial splice. Foreign locales, malformed versions, duplicate rule IDs and source-policy claims of auto-application refuse. A properly selected fiber can yield only `review-required` or literal-source `preserve`, with `automaticApplicationAllowed: false` and no effects.

The original `proposePtgaeRewrites` and `evaluatePtgaeCandidate` APIs remain stable for existing consumers; the new API is an explicit opt-in admission boundary. It cannot verify the fiber's original custody (the selector's hash covers supplied parsed values), settle meaning, infer truth, or approve publication. The root [PTGAE Engineering consumer PR](https://github.com/red-cup-engineering/ptgae-engineering-services-section/pull/19) composes the original selector, this service, and prose preflight, and receives the exact [normative fiber PR](https://github.com/red-cup-engineering/plain-technical-general-american-english/pull/3). Dependency-backed Node 24 and packed consumer tests must qualify all three exact revisions before release.
