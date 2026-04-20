#!/usr/bin/env node
/**
 * AH-g: sync the canonical sdk-harness contract from convo into this repo's
 * test fixtures. Run from the monorepo root:
 *   npm run -w @mootup/moot-sdk sync:contract
 *
 * Canonical source: `<parent>/convo/docs/api/sdk-harness-contract.json`
 * (mirrors sync-oas.mjs — assumes moot-cli-js and convo are siblings).
 *
 * Target: `packages/moot-sdk/test/fixtures/sdk-harness-contract.json`.
 * Parity tests consume the target; the committed copy is the source of truth
 * for CI. Re-run this script after the canonical contract changes in convo.
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const thisFile = fileURLToPath(import.meta.url);
const pkgRoot = resolve(dirname(thisFile), '..');
const monorepoRoot = resolve(pkgRoot, '..', '..');
const source = resolve(
  monorepoRoot,
  '..',
  'convo',
  'docs',
  'api',
  'sdk-harness-contract.json',
);
const targetDir = resolve(pkgRoot, 'test', 'fixtures');
const target = resolve(targetDir, 'sdk-harness-contract.json');

if (!existsSync(source)) {
  console.error(`sync:contract — canonical contract not found at ${source}`);
  console.error(
    'Expected layout: <parent>/convo and <parent>/mootup-io/moot-cli-js as siblings.',
  );
  console.error(
    'If the convo repo lives elsewhere, copy the file manually or adjust this script.',
  );
  process.exit(1);
}

if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });
copyFileSync(source, target);
console.log(`sync:contract — copied ${source}\n                → ${target}`);

// Inv 4: assert SDK package version prefix meets or exceeds contract's
// oas_version_ref. Build-fail on mismatch so operators catch drift early.
import { readFileSync } from 'node:fs';
const contract = JSON.parse(readFileSync(target, 'utf8'));
const pkg = JSON.parse(readFileSync(resolve(pkgRoot, 'package.json'), 'utf8'));
const oasVersionRef = contract.oas_version_ref;
const pkgSemverPrefix = String(pkg.version).split('-')[0]; // strip pre-release
const cmp = (a, b) => {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x - y;
  }
  return 0;
};
if (cmp(pkgSemverPrefix, oasVersionRef) < 0) {
  console.error(
    `sync:contract — SDK package version ${pkg.version} is below contract oas_version_ref ${oasVersionRef}.`,
  );
  console.error(
    'Bump the SDK package version to match (or post-date) the convo OAS before syncing.',
  );
  process.exit(2);
}
