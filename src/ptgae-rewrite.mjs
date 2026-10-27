const SAFE_REWRITES = [
  { code: 'PTR001', pattern: /\bmay\s+potentially\b/gi, replacement: 'may' },
  { code: 'PTR002', pattern: /\bcould\s+possibly\b/gi, replacement: 'could' },
  { code: 'PTR003', pattern: /\bmight\s+perhaps\b/gi, replacement: 'might' },
  { code: 'PTR004', pattern: /\bin order to\b/gi, replacement: 'to' },
  { code: 'PTR005', pattern: /\bdue to the fact that\b/gi, replacement: 'because' },
  { code: 'PTR006', pattern: /\bin light of the fact that\b/gi, replacement: 'because' },
  { code: 'PTR007', pattern: /\bhas the ability to\b/gi, replacement: 'can' },
  { code: 'PTR008', pattern: /\bat this point in time\b/gi, replacement: 'now' },
  { code: 'PTR009', pattern: /\bat the present time\b/gi, replacement: 'now' },
  { code: 'PTR010', pattern: /\bin the event that\b/gi, replacement: 'if' },
  { code: 'PTR011', pattern: /\bon a regular basis\b/gi, replacement: 'regularly' },
  { code: 'PTR012', pattern: /\bsubsequent to\b/gi, replacement: 'after' },
  { code: 'PTR013', pattern: /\bprior to\b/gi, replacement: 'before' },
  { code: 'PTR014', pattern: /\bwith regard to\b/gi, replacement: 'about' }
];

const SECTION_STUDY = {
  code: 'PTR026',
  pattern: /\bThe ([A-Z][A-Za-z0-9 '&()/-]* Services Section) maintains knowledge and practices for the study of ([^.!?\n]+)\./g,
  replace: (_match, section, subject) => `The ${section} studies ${subject}.`
};

const GENERIC_SECTION = {
  code: 'PTR027',
  pattern: /\bThe [A-Z][A-Za-z0-9 '&()/-]* Services Section maintains knowledge and practices for this service domain\./g,
  replacement: 'Description incomplete.'
};

const SHARED_SECTION = {
  code: 'PTR028',
  pattern: /\bThis section holds shared knowledge and services concerning ([^.!?\n]+)\./g,
  replace: (_match, subject) => `This section provides shared ${subject} knowledge and services.`
};

const OECD_HOME = {
  code: 'PTR029',
  pattern: /\bThis is the home for OECD FORD ([0-9.]+), ([^.!?\n]+)\./g,
  replace: (_match, code, subject) => `This section covers OECD FORD ${code}: ${subject}.`
};

function findStraightQuoteEnd(source, start) {
  for (let i = start + 1; i < source.length; i++) {
    if (source[i] === '"' && source[i - 1] !== '\\') return i;
    if (source[i] === '\n') return -1;
  }
  return -1;
}

function rewriteOutsideCode(source, transform) {
  let out = '';
  let plain = '';
  let i = 0;
  let fence = null;
  let inline = false;
  let inBlockquote = false;

  const flush = () => {
    if (plain) {
      out += transform(plain);
      plain = '';
    }
  };

  while (i < source.length) {
    if (!fence && !inline && (i === 0 || source[i - 1] === '\n')) {
      const nextNewline = source.indexOf('\n', i);
      const lineEnd = nextNewline === -1 ? source.length : nextNewline;
      const line = source.slice(i, lineEnd);
      // Unmarked nonblank lines can continue a Markdown quote paragraph.
      // Conservatively preserve the whole run until an unquoted blank line.
      if (/^\s{0,3}>/.test(line) || (inBlockquote && line.trim())) {
        inBlockquote = true;
        flush();
        out += line;
        i = lineEnd;
        continue;
      }
      inBlockquote = false;
    }

    const three = source.slice(i, i + 3);
    if (!inline && (three === '```' || three === '~~~')) {
      flush();
      if (!fence) fence = three;
      else if (fence === three) fence = null;
      out += three;
      i += 3;
      continue;
    }

    const ch = source[i];

    if (!fence && ch === '`') {
      flush();
      inline = !inline;
      out += ch;
      i += 1;
      continue;
    }

    if (!fence && !inline && ch === '"') {
      const end = findStraightQuoteEnd(source, i);
      if (end !== -1) {
        flush();
        out += source.slice(i, end + 1);
        i = end + 1;
        continue;
      }
    }

    if (!fence && !inline && ch === '“') {
      const end = source.indexOf('”', i + 1);
      if (end !== -1 && !source.slice(i, end + 1).includes('\n')) {
        flush();
        out += source.slice(i, end + 1);
        i = end + 1;
        continue;
      }
    }

    if (fence || inline) out += ch;
    else plain += ch;
    i += 1;
  }

  flush();
  return out;
}

function transformPlainText(text, changes) {
  let next = text;

  for (const rule of SAFE_REWRITES) {
    next = next.replace(rule.pattern, match => {
      changes.push(rule.code);
      if (/^[A-Z]/.test(match) && /^[a-z]/.test(rule.replacement)) {
        return rule.replacement[0].toUpperCase() + rule.replacement.slice(1);
      }
      return rule.replacement;
    });
  }

  next = next.replace(SECTION_STUDY.pattern, (...args) => {
    changes.push(SECTION_STUDY.code);
    return SECTION_STUDY.replace(...args);
  });

  next = next.replace(GENERIC_SECTION.pattern, () => {
    changes.push(GENERIC_SECTION.code);
    return GENERIC_SECTION.replacement;
  });

  next = next.replace(SHARED_SECTION.pattern, (...args) => {
    changes.push(SHARED_SECTION.code);
    return SHARED_SECTION.replace(...args);
  });

  next = next.replace(OECD_HOME.pattern, (...args) => {
    changes.push(OECD_HOME.code);
    return OECD_HOME.replace(...args);
  });

  return next;
}

export function rewritePTGAE(source) {
  const changes = [];
  const text = rewriteOutsideCode(source, plain => transformPlainText(plain, changes));
  return { text, changed: text !== source, changes };
}

export const SAFE_REWRITE_CODES = new Set([
  ...SAFE_REWRITES.map(rule => rule.code),
  SECTION_STUDY.code,
  GENERIC_SECTION.code,
  SHARED_SECTION.code,
  OECD_HOME.code
]);

// Throat-clearing phrases remain lint-only. Deleting them mechanically can
// change capitalization or syntax around Markdown spans; a semantic rewrite
// must own that change.
// "With respect to" also remains lint-only: it can name a mathematical
// variable of differentiation or another technical relation.
//
// Quoted source text is protected from automatic rewriting. The surrounding
// prose may be normalized, but the quotation must remain faithful to its source.

if (import.meta.url === 'file://' + process.argv[1]) {
  const fs = await import('node:fs/promises');
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const files = args.filter(arg => !arg.startsWith('--'));

  if (!files.length) {
    console.error('usage: node ptgae-rewrite.mjs [--check] FILE [...]');
    process.exit(2);
  }

  let changed = false;
  for (const file of files) {
    const source = await fs.readFile(file, 'utf8');
    const result = rewritePTGAE(source);
    if (!result.changed) continue;
    changed = true;
    if (check) console.log(file + ': ' + result.changes.join(','));
    else {
      await fs.writeFile(file, result.text);
      console.log(file + ': rewrote ' + result.changes.join(','));
    }
  }

  if (check && changed) process.exitCode = 1;
}
