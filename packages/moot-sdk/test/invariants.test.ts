import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pkgRoot = resolve(__dirname, '..');
const oasPath = resolve(pkgRoot, 'openapi.yaml');
const generatedPath = resolve(pkgRoot, 'src/generated/paths.ts');

function collectTs(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (name === 'generated') continue; // generated paths.ts is allowed to mention types
    if (statSync(full).isDirectory()) out.push(...collectTs(full));
    else if (name.endsWith('.ts')) out.push(full);
  }
  return out;
}

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

  // AH-g structural invariants (inv 4, 8, 11)
  it('inv 4: contract stamps oas_version_ref + sync-contract.mjs enforces ≥', () => {
    const contract = JSON.parse(
      readFileSync(join(pkgRoot, 'test', 'fixtures', 'sdk-harness-contract.json'), 'utf8'),
    ) as { oas_version_ref?: string };
    expect(contract.oas_version_ref).toMatch(/^\d+\.\d+\.\d+$/);
    // sync-contract.mjs must contain the version-check logic so drift fails
    // at refresh time rather than silently mismatching.
    const syncSrc = readFileSync(join(pkgRoot, 'scripts', 'sync-contract.mjs'), 'utf8');
    expect(syncSrc).toMatch(/oas_version_ref/);
    expect(syncSrc).toMatch(/process\.exit/);
  });

  it('inv 8: no MCP SDK package dep in package.json', () => {
    const pkg = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const allDeps = {
      ...(pkg.dependencies ?? {}),
      ...(pkg.devDependencies ?? {}),
    };
    for (const name of Object.keys(allDeps)) {
      expect(name).not.toMatch(/^@modelcontextprotocol\//);
      expect(name).not.toBe('mcp');
    }
  });

  it('inv 11: connect.ts redacts token-ish substrings at error-raise-site', () => {
    const connectSrc = readFileSync(join(pkgRoot, 'src', 'connect.ts'), 'utf8');
    expect(connectSrc).toMatch(/redactError/);
    expect(connectSrc).toMatch(/REDACTION_SUBSTRINGS/);
  });

  it('inv 11: no raw Bearer / Authorization literals in connect.ts throw sites', () => {
    // Per spec § 8 inv 11 phrasing: redaction is validated at the error-raise-
    // site in connect.ts. client.ts legitimately sets the Authorization header
    // on outgoing HTTP requests (not an error path) — out of scope.
    const connectSrc = readFileSync(join(pkgRoot, 'src', 'connect.ts'), 'utf8');
    const suspicious = connectSrc.split(/\r?\n/).filter(
      (line) =>
        /(throw new |new Error\()/.test(line) &&
        /(Bearer |Authorization:)/.test(line),
    );
    expect(
      suspicious,
      `unredacted auth-header literal in connect.ts error site: ${suspicious.join(' | ')}`,
    ).toEqual([]);
  });
});
