import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ORIGINAL_HOME = process.env.HOME;
let fakeHome: string;
let credFile: string;

beforeEach(() => {
  fakeHome = mkdtempSync(join(tmpdir(), 'mootup-cli-account-'));
  process.env.HOME = fakeHome;
  credFile = join(fakeHome, '.mootup', 'credentials.json');
  vi.resetModules();
});

afterEach(() => {
  process.env.HOME = ORIGINAL_HOME;
  rmSync(fakeHome, { recursive: true, force: true });
});

function makeCred(suffix: string) {
  return {
    api_url: 'https://mootup.io',
    token: `mootup_pat_${suffix}_0123456789abcdef`,
    user_id: `act_${suffix}`,
  };
}

function seedFile(content: Record<string, unknown>): void {
  const dir = join(fakeHome, '.mootup');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(credFile, JSON.stringify(content, null, 2) + '\n');
}

describe('R1: no-op guard — credentials.json without defaultProfile produces no rewrite, no .bak', () => {
  it('R1.1: pre-MCMC file with single profile passes through untouched on resolveProfile read', async () => {
    seedFile({ default: makeCred('a') });
    const before = readFileSync(credFile, 'utf8');
    const { resolveProfile } = await import('../src/credential.js');
    const profile = resolveProfile({});
    expect(profile).toBe('default');
    const after = readFileSync(credFile, 'utf8');
    expect(after).toBe(before);
    expect(existsSync(`${credFile}.v1.bak`)).toBe(false);
    expect(existsSync(`${credFile}.bak`)).toBe(false);
  });

  it('R1.2: pre-MCMC file with multiple profiles also passes through untouched', async () => {
    seedFile({ default: makeCred('a'), work: makeCred('b') });
    const before = readFileSync(credFile, 'utf8');
    const { resolveProfile, enumerateProfiles } = await import('../src/credential.js');
    expect(resolveProfile({})).toBe('default');
    expect(enumerateProfiles()).toEqual(['default', 'work']);
    expect(readFileSync(credFile, 'utf8')).toBe(before);
    expect(existsSync(`${credFile}.v1.bak`)).toBe(false);
  });

  it('R1.3: missing credentials.json — resolveProfile falls back to default without creating anything', async () => {
    const { resolveProfile } = await import('../src/credential.js');
    expect(resolveProfile({})).toBe('default');
    expect(existsSync(credFile)).toBe(false);
  });
});

describe('R2: resolution chain — explicit flag → defaultProfile → literal default', () => {
  it('R2.1: explicit --profile flag wins over persisted defaultProfile', async () => {
    seedFile({ defaultProfile: 'work', default: makeCred('a'), work: makeCred('b') });
    const { resolveProfile } = await import('../src/credential.js');
    expect(resolveProfile({ profile: 'default' })).toBe('default');
  });

  it('R2.2: absent flag uses persisted defaultProfile', async () => {
    seedFile({ defaultProfile: 'work', default: makeCred('a'), work: makeCred('b') });
    const { resolveProfile } = await import('../src/credential.js');
    expect(resolveProfile({})).toBe('work');
  });

  it('R2.3: absent flag + absent defaultProfile falls back to literal `default`', async () => {
    seedFile({ default: makeCred('a') });
    const { resolveProfile } = await import('../src/credential.js');
    expect(resolveProfile({})).toBe('default');
  });

  it('R2.4: invalid defaultProfile value (non-string / empty / bad chars) falls back to literal default', async () => {
    seedFile({ defaultProfile: 42, default: makeCred('a') });
    const { resolveProfile } = await import('../src/credential.js');
    expect(resolveProfile({})).toBe('default');
    seedFile({ defaultProfile: '', default: makeCred('a') });
    vi.resetModules();
    const m2 = await import('../src/credential.js');
    expect(m2.resolveProfile({})).toBe('default');
    seedFile({ defaultProfile: 'INVALID!!', default: makeCred('a') });
    vi.resetModules();
    const m3 = await import('../src/credential.js');
    expect(m3.resolveProfile({})).toBe('default');
  });
});

describe('R3: cmdAccountList output + meta-key filter', () => {
  it('R3.1: empty config emits helpful message; no crash', async () => {
    const { cmdAccountList } = await import('../src/commands/account.js');
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    cmdAccountList();
    expect(spy.mock.calls.flat().join('\n')).toContain('No profiles registered');
    spy.mockRestore();
  });

  it('R3.2: lists profiles + marks default with asterisk; excludes defaultProfile meta-key', async () => {
    seedFile({ defaultProfile: 'work', default: makeCred('a'), work: makeCred('b') });
    const { cmdAccountList } = await import('../src/commands/account.js');
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    cmdAccountList();
    const out = spy.mock.calls.flat().join('\n');
    expect(out).toContain('Profiles:');
    expect(out).toMatch(/\*\s+work\s*\(current default\)/);
    expect(out).toContain('default');
    expect(out).not.toMatch(/\bdefaultProfile\b/);
    spy.mockRestore();
  });

  it('R3.3: defaultProfile points at non-registered profile emits warning', async () => {
    seedFile({ defaultProfile: 'ghost', default: makeCred('a') });
    const { cmdAccountList } = await import('../src/commands/account.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    cmdAccountList();
    const out = logSpy.mock.calls.flat().join('\n');
    expect(out).toContain('ghost');
    expect(out).toContain('is not a registered profile');
    logSpy.mockRestore();
  });
});

describe('R4: cmdAccountUse persists + validates exists', () => {
  it('R4.1: sets defaultProfile when profile exists', async () => {
    seedFile({ default: makeCred('a'), work: makeCred('b') });
    const { cmdAccountUse } = await import('../src/commands/account.js');
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    cmdAccountUse({ name: 'work' });
    const raw = JSON.parse(readFileSync(credFile, 'utf8'));
    expect(raw.defaultProfile).toBe('work');
    spy.mockRestore();
  });

  it('R4.2: rejects non-existent profile with helpful pointer to login/add', async () => {
    seedFile({ default: makeCred('a') });
    const { cmdAccountUse } = await import('../src/commands/account.js');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => cmdAccountUse({ name: 'ghost' })).toThrow(/not registered/);
    const errOut = errSpy.mock.calls.flat().join('\n');
    expect(errOut).toContain("moot login --profile ghost");
    errSpy.mockRestore();
  });

  it('R4.3: subsequent resolveProfile read returns the new default', async () => {
    seedFile({ default: makeCred('a'), work: makeCred('b') });
    const { cmdAccountUse } = await import('../src/commands/account.js');
    const { resolveProfile } = await import('../src/credential.js');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    cmdAccountUse({ name: 'work' });
    expect(resolveProfile({})).toBe('work');
  });
});

describe('R5: cmdAccountRemove protects last/default; clears defaultProfile on default removal', () => {
  it('R5.1: refuses to remove last profile without --force', async () => {
    seedFile({ default: makeCred('a') });
    const { cmdAccountRemove } = await import('../src/commands/account.js');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => cmdAccountRemove({ name: 'default', force: false })).toThrow(/last/);
  });

  it('R5.2: refuses to remove current default without --force', async () => {
    seedFile({ defaultProfile: 'work', default: makeCred('a'), work: makeCred('b') });
    const { cmdAccountRemove } = await import('../src/commands/account.js');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => cmdAccountRemove({ name: 'work', force: false })).toThrow(/default/);
  });

  it('R5.3: removes non-default profile without --force', async () => {
    seedFile({ defaultProfile: 'work', default: makeCred('a'), work: makeCred('b') });
    const { cmdAccountRemove } = await import('../src/commands/account.js');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    cmdAccountRemove({ name: 'default', force: false });
    const raw = JSON.parse(readFileSync(credFile, 'utf8'));
    expect(raw.default).toBeUndefined();
    expect(raw.work).toBeDefined();
    expect(raw.defaultProfile).toBe('work');
  });

  it('R5.4: removes current default with --force, clears defaultProfile', async () => {
    seedFile({ defaultProfile: 'work', default: makeCred('a'), work: makeCred('b') });
    const { cmdAccountRemove } = await import('../src/commands/account.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    cmdAccountRemove({ name: 'work', force: true });
    const raw = JSON.parse(readFileSync(credFile, 'utf8'));
    expect(raw.work).toBeUndefined();
    expect(raw.default).toBeDefined();
    expect(raw.defaultProfile).toBeUndefined();
    expect(logSpy.mock.calls.flat().join('\n')).toContain('Default profile cleared');
    logSpy.mockRestore();
  });

  it('R5.5: rejects non-existent profile (force or not)', async () => {
    seedFile({ default: makeCred('a') });
    const { cmdAccountRemove } = await import('../src/commands/account.js');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => cmdAccountRemove({ name: 'ghost', force: false })).toThrow(/not registered/);
    expect(() => cmdAccountRemove({ name: 'ghost', force: true })).toThrow(/not registered/);
  });
});

describe('R6: cmdAccountAdd delegates to cmdLogin (alias)', () => {
  it('R6.1: invokes cmdLogin with profile=name; resulting file state equals direct cmdLogin', async () => {
    // cmdLogin uses the SDK's createMootupClient with fetch from globalThis;
    // mock globalThis.fetch to return a 200 actors/me response.
    const fakeFetch = vi.fn(async () =>
      new Response(JSON.stringify({ actor_id: 'act_x', display_name: 'X' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const origFetch = globalThis.fetch;
    globalThis.fetch = fakeFetch as unknown as typeof globalThis.fetch;
    try {
      const { cmdAccountAdd } = await import('../src/commands/account.js');
      vi.spyOn(console, 'log').mockImplementation(() => {});
      await cmdAccountAdd({
        name: 'work',
        token: 'mootup_pat_test_0123456789abcdef',
        apiUrl: 'http://convo.test',
      });
      const raw = JSON.parse(readFileSync(credFile, 'utf8'));
      expect(raw.work).toBeDefined();
      expect(raw.work.user_id).toBe('act_x');
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

describe('S1-S3: structural invariants', () => {
  it('S1: META_KEYS exports `defaultProfile`', async () => {
    const { META_KEYS } = await import('../src/credential.js');
    expect(META_KEYS.has('defaultProfile')).toBe(true);
  });

  it('S2: enumerateProfiles excludes meta-keys', async () => {
    seedFile({ defaultProfile: 'work', default: makeCred('a'), work: makeCred('b') });
    const { enumerateProfiles } = await import('../src/credential.js');
    expect(enumerateProfiles()).toEqual(['default', 'work']);
  });

  it('S3: no `.v1.bak` or migration code path exists in credential.ts source', async () => {
    const src = readFileSync(join(__dirname, '..', 'src', 'credential.ts'), 'utf8');
    expect(src).not.toContain('.v1.bak');
    expect(src).not.toContain('migrate');
    expect(src).not.toContain('migration');
  });
});
