#!/usr/bin/env node
/**
 * F11.4 (JS-side): sync the canonical convo `.claude/skills/` SOT into this
 * package's vendored skills tree. Run from the monorepo root:
 *   npm run -w @mootup/moot-templates sync:skills
 *
 * Canonical source resolution:
 *   1. $CONVO_REPO_PATH if set (matches sync-templates.mjs MOOT_REPO_PATH +
 *      sync-oas.mjs / sync-contract.mjs CONVO_REPO_PATH per F11.5).
 *   2. Default: `<monorepo-parent>/../convo` (sibling-layout assumption).
 *
 * The destination `packages/moot-templates/templates/skills/` is wiped-and-
 * replaced on every run so the vendored copy is always an exact mirror of
 * canonical. `skill-parity.test.ts` enforces byte-identity at CI time.
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const thisFile = fileURLToPath(import.meta.url);
const pkgRoot = resolve(dirname(thisFile), '..');
const monorepoRoot = resolve(pkgRoot, '..', '..');

const convoRepo = process.env.CONVO_REPO_PATH
  ? resolve(process.env.CONVO_REPO_PATH)
  : resolve(monorepoRoot, '..', '..', 'convo');
const source = resolve(convoRepo, '.claude', 'skills');
const dest = resolve(pkgRoot, 'templates', 'skills');

if (!existsSync(source)) {
  console.error(`sync:skills — canonical skills not found at ${source}`);
  console.error('Expected layout: <parent>/convo and <parent>/mootup-io/moot-cli-js as siblings.');
  console.error('Set CONVO_REPO_PATH to override (e.g. to a worktree path).');
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(source, dest, { recursive: true, dereference: true });
console.log(`sync:skills — copied ${source}\n               → ${dest}`);
