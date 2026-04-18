#!/usr/bin/env node
/**
 * Copy convo's canonical OpenAPI spec into this repo for committed vendoring.
 * Run from the monorepo root: `npm run -w @mootup/moot-sdk sync:oas`.
 *
 * Canonical source: `../convo/docs/api/openapi.yaml` (resolved relative to
 * the monorepo root, which is assumed to be a sibling of the convo repo).
 * Fails loudly if the source is missing so operators notice a misconfigured
 * workspace rather than silently vendoring a stale spec.
 */
import { copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const thisFile = fileURLToPath(import.meta.url);
const pkgRoot = resolve(dirname(thisFile), '..');
const monorepoRoot = resolve(pkgRoot, '..', '..');
const source = resolve(monorepoRoot, '..', 'convo', 'docs', 'api', 'openapi.yaml');
const target = resolve(pkgRoot, 'openapi.yaml');

if (!existsSync(source)) {
  console.error(`sync:oas — canonical OAS not found at ${source}`);
  console.error('Expected layout: <parent>/convo and <parent>/mootup-io/moot-cli-js as siblings.');
  console.error('If the convo repo lives elsewhere, copy the file manually or adjust this script.');
  process.exit(1);
}

copyFileSync(source, target);
console.log(`sync:oas — copied ${source}\n            → ${target}`);
