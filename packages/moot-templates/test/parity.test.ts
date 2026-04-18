import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { getTemplatesDir } from '../src/index.js';

function walk(root: string): Map<string, string> {
  const out = new Map<string, string>();
  function visit(dir: string) {
    for (const entry of readdirSync(dir)) {
      const abs = join(dir, entry);
      const s = statSync(abs);
      if (s.isDirectory()) {
        visit(abs);
      } else if (s.isFile()) {
        const rel = relative(root, abs);
        const bytes = readFileSync(abs);
        out.set(rel, createHash('sha256').update(bytes).digest('hex'));
      }
    }
  }
  visit(root);
  return out;
}

describe('parity with canonical mootup-io/moot templates', () => {
  // T4: vendored copy is byte-identical to canonical source
  it('every file under canonical source has a byte-identical match in vendored', () => {
    const mootRepo = process.env.MOOT_REPO_PATH
      ? resolve(process.env.MOOT_REPO_PATH)
      : resolve(getTemplatesDir(), '..', '..', '..', '..', 'moot');
    const canonical = join(mootRepo, 'src', 'moot', 'templates');
    const vendored = getTemplatesDir();

    const canonicalTree = walk(canonical);
    const vendoredTree = walk(vendored);

    expect(vendoredTree.size).toBe(canonicalTree.size);
    for (const [rel, hash] of canonicalTree) {
      expect(vendoredTree.get(rel), `missing or mismatched: ${rel}`).toBe(hash);
    }
  });
});
