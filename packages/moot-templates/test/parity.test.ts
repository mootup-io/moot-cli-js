import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
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

const mootRepo = process.env.MOOT_REPO_PATH
  ? resolve(process.env.MOOT_REPO_PATH)
  : resolve(getTemplatesDir(), '..', '..', '..', '..', 'moot');
const canonical = join(mootRepo, 'src', 'moot', 'templates');

const describeIfCanonical = existsSync(canonical) ? describe : describe.skip;

describeIfCanonical('parity with canonical mootup-io/moot templates', () => {
  // T4: vendored copy is byte-identical to canonical source.
  // Skipped when the canonical moot repo is not present (e.g. on GitHub CI for
  // moot-cli-js, where only this repo is checked out). Set MOOT_REPO_PATH to
  // point at a worktree or run `npm run sync:templates` from a layout where
  // `mootup-io/moot` is a sibling of `mootup-io/moot-cli-js`.
  it('every file under canonical source has a byte-identical match in vendored', () => {
    const vendored = getTemplatesDir();

    const canonicalTree = walk(canonical);
    const vendoredTree = walk(vendored);

    expect(vendoredTree.size).toBe(canonicalTree.size);
    for (const [rel, hash] of canonicalTree) {
      expect(vendoredTree.get(rel), `missing or mismatched: ${rel}`).toBe(hash);
    }
  });
});
