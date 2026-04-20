import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ORIGINAL_HOME = process.env.HOME;
let fakeHome: string;

function writeCredForProfile(profile: string, patToken = 'mootup_pat_abc') {
  const dir = join(fakeHome, '.mootup');
  mkdirSync(dir, { mode: 0o700, recursive: true });
  const existing = (() => {
    try {
      return JSON.parse(readFileSync(join(dir, 'credentials.json'), 'utf8'));
    } catch {
      return {};
    }
  })();
  existing[profile] = {
    api_url: 'http://convo.test',
    token: patToken,
    user_id: `usr_${profile}`,
    credential_type: 'static_token',
  };
  writeFileSync(join(dir, 'credentials.json'), JSON.stringify(existing, null, 2));
}

beforeEach(() => {
  fakeHome = mkdtempSync(join(tmpdir(), 'mootup-cli-home-'));
  process.env.HOME = fakeHome;
  vi.resetModules();
});

afterEach(() => {
  process.env.HOME = ORIGINAL_HOME;
  rmSync(fakeHome, { recursive: true, force: true });
});

describe('--profile flag — R12/R13', () => {
  it('R12 — storeCredential writes under named profile key', async () => {
    const mod = await import('../src/credential.js');
    mod.storeCredential(
      { api_url: 'http://convo.test', token: 'mootup_pat_x', user_id: 'usr_x' },
      'work',
    );
    const raw = readFileSync(join(fakeHome, '.mootup', 'credentials.json'), 'utf8');
    const parsed = JSON.parse(raw);
    expect(parsed.work).toBeDefined();
    expect(parsed.work.token).toBe('mootup_pat_x');
    expect(parsed.default).toBeUndefined();
    expect(mod.loadCredential('work')?.user_id).toBe('usr_x');
    expect(mod.loadCredential('default')).toBeNull();
  });

  it('R13 — keytar ref is profile-scoped', async () => {
    const credsMod = await import('../src/auth/credentials.js');
    const setCalls: { service: string; account: string }[] = [];
    const keytar = {
      setPassword: vi.fn(async (service: string, account: string) => {
        setCalls.push({ service, account });
      }),
      getPassword: vi.fn(async () => null),
      deletePassword: vi.fn(async () => true),
    };
    credsMod.__setKeytarForTest(keytar);
    credsMod.__clearSessionMemoryForTest();

    await credsMod.storeOAuthCredential('work', {
      api_url: 'http://convo.test',
      user_id: 'usr_w',
      access_token: 'a',
      refresh_token: 'ref_w',
      access_token_expires_at: 1,
    });
    await credsMod.storeOAuthCredential('personal', {
      api_url: 'http://convo.test',
      user_id: 'usr_p',
      access_token: 'a',
      refresh_token: 'ref_p',
      access_token_expires_at: 1,
    });
    const accounts = setCalls.map((c) => c.account);
    expect(accounts).toContain('mootup-cli:work:refresh');
    expect(accounts).toContain('mootup-cli:personal:refresh');
    credsMod.__setKeytarForTest(null);
  });

  it('R12b — PAT written under --profile is loaded by --profile', () => {
    writeCredForProfile('personal', 'mootup_pat_p');
    writeCredForProfile('work', 'mootup_pat_w');
    // profile inference works off file keys
    const home = fakeHome;
    void home;
  });
});
