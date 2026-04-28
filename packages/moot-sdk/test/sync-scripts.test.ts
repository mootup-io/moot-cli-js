import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const pkgRoot = resolve(__dirname, '..');

describe.each([
  ['sync:oas', 'scripts/sync-oas.mjs', 'docs/api/openapi.yaml', 'openapi.yaml'],
  ['sync:contract', 'scripts/sync-contract.mjs', 'docs/api/sdk-harness-contract.json', 'test/fixtures/sdk-harness-contract.json'],
])('%s honors $CONVO_REPO_PATH (R3)', (name, scriptRel, sourceRel, targetRel) => {
  let fakeRepo: string;
  let fakeSource: string;
  let realTarget: string;
  let backupBytes: Buffer | null;

  beforeEach(() => {
    fakeRepo = mkdtempSync(join(tmpdir(), 'arch-7-convo-'));
    fakeSource = join(fakeRepo, sourceRel);
    mkdirSync(join(fakeRepo, 'docs', 'api'), { recursive: true });
    if (sourceRel.endsWith('.yaml')) {
      writeFileSync(fakeSource, 'openapi: 3.1.0\ninfo:\n  title: arch-7-fixture\n  version: 0.0.1\npaths: {}\n');
    } else {
      writeFileSync(fakeSource, JSON.stringify({ oas_version_ref: '0.0.1', fixtures: [] }));
    }
    realTarget = join(pkgRoot, targetRel);
    backupBytes = existsSync(realTarget) ? readFileSync(realTarget) : null;
  });

  afterEach(() => {
    rmSync(fakeRepo, { recursive: true, force: true });
    if (backupBytes !== null) {
      writeFileSync(realTarget, backupBytes);
    }
  });

  it('uses CONVO_REPO_PATH when set', () => {
    execFileSync('node', [join(pkgRoot, scriptRel)], {
      env: { ...process.env, CONVO_REPO_PATH: fakeRepo },
      cwd: pkgRoot,
      encoding: 'utf8',
    });
    const written = readFileSync(realTarget, 'utf8');
    expect(written).toBe(readFileSync(fakeSource, 'utf8'));
  });
});
