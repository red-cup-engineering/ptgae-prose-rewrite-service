import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { rewriteCorpus } from '../src/ptgae-corpus-rewrite.mjs';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ptgae-rewrite-corpus-'));
try {
  await fs.mkdir(path.join(root, 'docs'));
  await fs.mkdir(path.join(root, 'node_modules'));
  const files = {
    'docs/stacked.md': 'The change may potentially affect the parser.\n',
    'docs/study.md': 'The Sociology Services Section maintains knowledge and practices for the study of social structure.\n',
    'docs/generic.md': 'The Music Services Section maintains knowledge and practices for this service domain.\n',
    'docs/case.md': 'Prior to validation, hash the record.\n',
    'docs/quote.md': '> The source may potentially describe an obsolete behavior.\n',
    'docs/code.md': '```\nThe change may potentially affect the parser.\n```\n',
    'docs/ignored.js': 'The change may potentially affect the parser.\n',
    'node_modules/ignored.md': 'The change may potentially affect the parser.\n'
  };
  for (const [name, body] of Object.entries(files)) {
    await fs.writeFile(path.join(root, name), body);
  }

  const dry = await rewriteCorpus([root]);
  assert.deepEqual(dry.map(x => path.basename(x.file)), ['case.md', 'generic.md', 'stacked.md', 'study.md']);
  assert.equal(await fs.readFile(path.join(root, 'docs/stacked.md'), 'utf8'), files['docs/stacked.md']);

  const written = await rewriteCorpus([root], { write: true });
  assert.equal(written.length, 4);
  assert.equal(await fs.readFile(path.join(root, 'docs/stacked.md'), 'utf8'), 'The change may affect the parser.\n');
  assert.equal(await fs.readFile(path.join(root, 'docs/study.md'), 'utf8'), 'The Sociology Services Section studies social structure.\n');
  assert.equal(await fs.readFile(path.join(root, 'docs/generic.md'), 'utf8'), 'Description incomplete.\n');
  assert.equal(await fs.readFile(path.join(root, 'docs/case.md'), 'utf8'), 'Before validation, hash the record.\n');
  assert.equal(await fs.readFile(path.join(root, 'docs/quote.md'), 'utf8'), files['docs/quote.md']);
  assert.equal(await fs.readFile(path.join(root, 'docs/code.md'), 'utf8'), files['docs/code.md']);

  assert.deepEqual(await rewriteCorpus([root]), []);
} finally {
  await fs.rm(root, { recursive: true, force: true });
}

console.log('ok corpus rewrite dry-run, write, protected-source, and idempotence fixtures');
