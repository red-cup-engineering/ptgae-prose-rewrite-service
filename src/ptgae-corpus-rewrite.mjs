import fs from 'node:fs/promises';
import path from 'node:path';
import { rewritePTGAE } from './ptgae-rewrite.mjs';

const DEFAULT_EXTENSIONS = new Set(['.md', '.mdx', '.txt', '.html']);
const SKIP_DIRS = new Set(['.git', 'node_modules', 'vendor', 'dist', 'build', '.next']);

async function collect(target, files) {
  const stat = await fs.lstat(target);
  if (stat.isSymbolicLink()) return;
  if (stat.isFile()) {
    if (DEFAULT_EXTENSIONS.has(path.extname(target).toLowerCase())) files.push(target);
    return;
  }
  if (!stat.isDirectory() || SKIP_DIRS.has(path.basename(target))) return;
  const entries = await fs.readdir(target, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
    await collect(path.join(target, entry.name), files);
  }
}

export async function rewriteCorpus(targets, { write = false } = {}) {
  const files = [];
  for (const target of targets) await collect(target, files);
  files.sort();
  const changed = [];
  for (const file of files) {
    const source = await fs.readFile(file, 'utf8');
    const result = rewritePTGAE(source);
    if (!result.changed) continue;
    changed.push({
      file,
      changes: [...new Set(result.changes)],
      beforeBytes: Buffer.byteLength(source),
      afterBytes: Buffer.byteLength(result.text)
    });
    if (write) await fs.writeFile(file, result.text);
  }
  return changed;
}

if (import.meta.url === 'file://' + process.argv[1]) {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const json = args.includes('--json');
  const targets = args.filter(arg => !arg.startsWith('--'));
  if (!targets.length) {
    console.error('usage: node ptgae-corpus-rewrite.mjs [--write] [--json] PATH [...]');
    process.exit(2);
  }

  const changed = await rewriteCorpus(targets, { write });
  if (json) console.log(JSON.stringify({ write, changed }, null, 2));
  else for (const item of changed) console.log(item.file + ': ' + item.changes.join(','));
  if (!write && changed.length) process.exitCode = 1;
}
