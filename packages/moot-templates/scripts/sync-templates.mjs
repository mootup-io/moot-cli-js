#!/usr/bin/env node
/**
 * Copy the canonical mootup templates tree into this package's vendored
 * copy. Run from the monorepo root: `npm run -w @mootup/moot-templates sync:templates`.
 *
 * Canonical source resolution:
 *   1. $MOOT_REPO_PATH if set (used by parity tests to point at a feat worktree).
 *   2. Default: `<monorepo-parent>/moot` (sibling-layout assumption, matching
 *      mootup-io/moot-cli-js and mootup-io/moot as siblings under mootup-io/).
 *
 * The destination `packages/moot-templates/templates/` is wiped-and-replaced
 * on every run so the vendored copy is always an exact mirror of canonical.
 * Fails loudly if the source is missing rather than silently leaving stale
 * content.
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const thisFile = fileURLToPath(import.meta.url);
const pkgRoot = resolve(dirname(thisFile), '..');
const monorepoRoot = resolve(pkgRoot, '..', '..');

const mootRepo = process.env.MOOT_REPO_PATH
  ? resolve(process.env.MOOT_REPO_PATH)
  : resolve(monorepoRoot, '..', 'moot');
const source = resolve(mootRepo, 'src', 'moot', 'templates');
const dest = resolve(pkgRoot, 'templates');

if (!existsSync(source)) {
  console.error(`sync:templates — canonical templates not found at ${source}`);
  console.error('Expected layout: <parent>/moot and <parent>/moot-cli-js as siblings.');
  console.error('Set MOOT_REPO_PATH to override (e.g. to a worktree path).');
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(source, dest, { recursive: true });
console.log(`sync:templates — copied ${source}\n                  → ${dest}`);
