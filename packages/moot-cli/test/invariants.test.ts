import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readdirSync } from 'node:fs';

const PKG_ROOT = resolve(__dirname, '..');
const REPO_ROOT = resolve(PKG_ROOT, '..', '..');

describe('structural invariants', () => {
  it('package.json bin maps mootup → ./dist/bin.js (T9)', () => {
    const pkg = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8'));
    expect(pkg.bin).toEqual({ mootup: './dist/bin.js' });
  });

  it('package.json files includes dist and README.md, excludes src/test/scripts (T10)', () => {
    const pkg = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8'));
    expect(pkg.files).toContain('dist');
    expect(pkg.files).toContain('README.md');
    expect(pkg.files).not.toContain('src');
    expect(pkg.files).not.toContain('test');
    expect(pkg.files).not.toContain('scripts');
  });

  it('publish.yml contains @mootup/moot-cli publish step with NODE_AUTH_TOKEN gate (T11)', () => {
    const yml = readFileSync(
      join(REPO_ROOT, '.github', 'workflows', 'publish.yml'),
      'utf8',
    );
    expect(yml).toContain('npm publish --access public -w @mootup/moot-cli');
    // Count NODE_AUTH_TOKEN gates: sdk + templates + cli = 3
    const gateCount = yml.match(/NODE_AUTH_TOKEN:/g)?.length ?? 0;
    expect(gateCount).toBe(3);
  });

  it('src/ imports @mootup/moot-sdk + @mootup/moot-templates, not bare node-fetch or raw http (T12)', () => {
    const srcDir = join(PKG_ROOT, 'src');
    const files = collectTs(srcDir);
    const joined = files.map((f) => readFileSync(f, 'utf8')).join('\n');
    expect(joined).toContain("from '@mootup/moot-sdk'");
    expect(joined).toContain("from '@mootup/moot-templates'");
    expect(joined).not.toMatch(/from ['"]node-fetch['"]/);
    expect(joined).not.toMatch(/from ['"]node:http['"]/);
    expect(joined).not.toMatch(/from ['"]node:https['"]/);
  });

  it('dist/bin.js starts with shebang and has executable bit (T14)', () => {
    const binPath = join(PKG_ROOT, 'dist', 'bin.js');
    // T14 runs only after build — skip gracefully if dist/ doesn't exist
    if (!existsSync(binPath)) {
      return;
    }
    const contents = readFileSync(binPath, 'utf8');
    expect(contents.startsWith('#!/usr/bin/env node')).toBe(true);
    const mode = statSync(binPath).mode & 0o111;
    expect(mode).not.toBe(0);
  });
});

function collectTs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectTs(full));
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}
