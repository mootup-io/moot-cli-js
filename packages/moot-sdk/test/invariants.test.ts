import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pkgRoot = resolve(__dirname, '..');
const oasPath = resolve(pkgRoot, 'openapi.yaml');
const generatedPath = resolve(pkgRoot, 'src/generated/paths.ts');

describe('structural invariants', () => {
  it('openapi.yaml declares OAS 3.1.x', () => {
    const oas = readFileSync(oasPath, 'utf8');
    expect(oas).toMatch(/^openapi:\s*3\.1\.\d+/m);
  });

  it('src/generated/paths.ts is byte-identical to a fresh regeneration', () => {
    const current = readFileSync(generatedPath, 'utf8');
    const fresh = execFileSync(
      'npx',
      ['openapi-typescript', oasPath],
      { cwd: pkgRoot, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
    );
    expect(fresh).toBe(current);
  });
});
