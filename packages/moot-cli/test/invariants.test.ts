import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readdirSync } from 'node:fs';

const PKG_ROOT = resolve(__dirname, '..');

describe('structural invariants', () => {
  it('package.json bin maps moot → ./dist/bin.js (T9)', () => {
    const pkg = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8'));
    expect(pkg.bin).toEqual({ moot: './dist/bin.js' });
  });

  it('package.json files includes dist and README.md, excludes src/test/scripts (T10)', () => {
    const pkg = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8'));
    expect(pkg.files).toContain('dist');
    expect(pkg.files).toContain('README.md');
    expect(pkg.files).not.toContain('src');
    expect(pkg.files).not.toContain('test');
    expect(pkg.files).not.toContain('scripts');
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

  it('R14a — inv 8: --profile registered on 4 auth-adjacent commands in bin.ts', () => {
    const bin = readFileSync(join(PKG_ROOT, 'src', 'bin.ts'), 'utf8');
    const profileMatches = bin.match(/\.option\(['"]--profile <name>['"]/g) ?? [];
    expect(profileMatches.length).toBe(4);
    for (const cmd of ['login', 'init', 'logout', 'refresh']) {
      expect(bin).toContain(`.command('${cmd}')`);
    }
  });

  it('R14b — inv 10: keytar calls in try/catch with file-based-storage fallback message', () => {
    const creds = readFileSync(join(PKG_ROOT, 'src', 'auth', 'credentials.ts'), 'utf8');
    expect(creds).toContain('try {');
    expect(creds).toContain('catch');
    expect(creds).toContain('file-based storage at');
    expect(creds).toContain('keychain unavailable');
  });

  it('R14c — inv 11: storeOAuthCredential write payload excludes raw refresh_token (file never holds refresh-token bytes)', () => {
    const creds = readFileSync(join(PKG_ROOT, 'src', 'auth', 'credentials.ts'), 'utf8');
    // The Credential object passed to storeCredential must NOT include a refresh_token field.
    // We look for the object literal construction and verify it carries refresh_token_ref, not refresh_token.
    const storeFnMatch = creds.match(/storeOAuthCredential[\s\S]*?storeCredential\(cred, profile\)/);
    expect(storeFnMatch).toBeTruthy();
    const body = storeFnMatch![0];
    expect(body).toContain('refresh_token_ref');
    // The only use of `refresh_token` in this function body should be on the IN-MEMORY bundle (creds arg)
    // or the keychain setPassword call — NOT in the `cred: Credential` object that goes to the file.
    const credObjectLiteral = body.match(/const cred: Credential = \{[\s\S]*?\};/);
    expect(credObjectLiteral).toBeTruthy();
    expect(credObjectLiteral![0]).not.toContain('refresh_token:');
    expect(credObjectLiteral![0]).not.toMatch(/\brefresh_token\b[^_]/);
  });

  it('R14d — inv 12: --profile threaded into init/login/logout/refresh commands', () => {
    for (const cmd of ['init', 'login', 'logout', 'refresh']) {
      const src = readFileSync(join(PKG_ROOT, 'src', 'commands', `${cmd}.ts`), 'utf8');
      expect(src).toContain('profile');
    }
  });

  it('R14e — inv 3: install POST always sets Idempotency-Key header', () => {
    const init = readFileSync(join(PKG_ROOT, 'src', 'commands', 'init.ts'), 'utf8');
    expect(init).toContain("'Idempotency-Key'");
    expect(init).toContain('generateIdempotencyKey');
  });

  it('R14f — inv 9: init dispatches on credential_type + refresh_token_ref presence', () => {
    const init = readFileSync(join(PKG_ROOT, 'src', 'commands', 'init.ts'), 'utf8');
    expect(init).toMatch(/credential_type === ['"]oauth['"]/);
    expect(init).toContain('refresh_token_ref');
  });

  it('R11 — cross-topology path_written sets are disjoint (inv 6)', async () => {
    const { HARNESS_REGISTRY } = await import('../src/index.js');
    const entries = Object.values(HARNESS_REGISTRY);
    for (const a of entries) {
      for (const b of entries) {
        if (a.topology === b.topology) continue;
        const inter = a.paths_written.filter((p) => b.paths_written.includes(p));
        expect(inter).toEqual([]);
      }
    }
  });

  it('R11b — HARNESS_REGISTRY has exactly 4 entries (inv 2)', async () => {
    const { HARNESS_REGISTRY } = await import('../src/index.js');
    expect(Object.keys(HARNESS_REGISTRY).sort()).toEqual(
      ['claude-code', 'cursor-agent', 'cursor-ide', 'sdk'].sort(),
    );
  });

  it('AH-h inv 10 — PROFILE_RE validation imported in all 4 auth commands', () => {
    for (const cmd of ['init', 'login', 'logout', 'refresh']) {
      const src = readFileSync(join(PKG_ROOT, 'src', 'commands', `${cmd}.ts`), 'utf8');
      expect(src).toContain("from '../auth/profile.js'");
      expect(src).toMatch(/validateProfile\(|PROFILE_RE/);
    }
  });

  it('AH-h inv 7 — cursor-ide writes .gitignore sidecar entry', () => {
    const src = readFileSync(
      join(PKG_ROOT, 'src', 'harness', 'cursor-ide.ts'),
      'utf8',
    );
    expect(src).toContain('.gitignore');
    expect(src).toContain('.cursor/mcp.json');
  });

  it('AH-h inv 9 — init.ts dispatches on harness topology via devcontainerTeamFlow / hostSideSoloFlow', () => {
    const init = readFileSync(join(PKG_ROOT, 'src', 'commands', 'init.ts'), 'utf8');
    expect(init).toContain('devcontainerTeamFlow');
    expect(init).toContain('hostSideSoloFlow');
    expect(init).toContain('/api/personal-access-tokens');
  });

  it('AH-h bin.ts registers --harness + --show-token on init', () => {
    const bin = readFileSync(join(PKG_ROOT, 'src', 'bin.ts'), 'utf8');
    expect(bin).toContain("'--harness <name>'");
    expect(bin).toContain("'--show-token'");
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

describe('TMPL-1 default archetype', () => {
  it('R1 — loop-6 description matches D-TMPL1-8 literal', async () => {
    const { findArchetype } = await import('../src/auth/archetypes.js');
    const loop6 = findArchetype('mootup/loop-6');
    expect(loop6?.description).toBe(
      'Recommended default — core pipeline with librarian + dedicated leader',
    );
  });

  it('R2 — DEFAULT_ARCHETYPE is mootup/loop-6', async () => {
    const { DEFAULT_ARCHETYPE } = await import('../src/auth/archetypes.js');
    expect(DEFAULT_ARCHETYPE).toBe('mootup/loop-6');
  });

  it('R7 — loop-4 variants remain registered in ARCHETYPE_CATALOG', async () => {
    const { ARCHETYPE_CATALOG } = await import('../src/auth/archetypes.js');
    const ids = ARCHETYPE_CATALOG.map((a) => a.id);
    for (const id of [
      'mootup/loop-4',
      'mootup/loop-4-observer',
      'mootup/loop-4-parallel',
      'mootup/loop-4-split-leader',
    ]) {
      expect(ids).toContain(id);
    }
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
