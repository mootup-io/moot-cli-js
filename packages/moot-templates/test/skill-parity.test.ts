import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { getTemplatesDir } from '../src/index.js';

const BUNDLED_SKILLS = [
  'doc-curation',
  'handoff',
  'implementation-workflow',
  'leader-workflow',
  'librarian-workflow',
  'memory-audit',
  'merge-to-main',
  'product-workflow',
  'spec-checklist',
  'stack-reset',
  'verify',
] as const;

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

const convoRepo = process.env.CONVO_REPO_PATH
  ? resolve(process.env.CONVO_REPO_PATH)
  : resolve(getTemplatesDir(), '..', '..', '..', '..', '..', 'convo');

const canonicalSkillsRoot = join(convoRepo, '.claude', 'skills');
const describeIfCanonical = existsSync(canonicalSkillsRoot) ? describe : describe.skip;

describeIfCanonical('parity with canonical convo .claude/skills/', () => {
  // Bundled skills must be byte-identical to convo's canonical SOT.
  // Skipped when convo is not checked out alongside moot-cli-js (e.g. CI-only-checking-this-repo).
  // Set CONVO_REPO_PATH to point at a worktree or checkout.
  it('every bundled skill is byte-identical to its canonical SOT', () => {
    const vendoredRoot = join(getTemplatesDir(), 'skills');
    for (const name of BUNDLED_SKILLS) {
      const bundled = join(vendoredRoot, name, 'SKILL.md');
      const canonical = join(canonicalSkillsRoot, name, 'SKILL.md');
      expect(existsSync(bundled), `bundled missing: ${name}`).toBe(true);
      expect(existsSync(canonical), `canonical missing: ${name} (symlink into playbooks/ or tools/)`).toBe(true);
      expect(sha256(bundled), `drift: ${name}`).toBe(sha256(canonical));
    }
  });
});
