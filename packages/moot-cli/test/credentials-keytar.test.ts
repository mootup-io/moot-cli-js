import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ORIGINAL_HOME = process.env.HOME;
let fakeHome: string;

interface KeyCall {
  op: 'set' | 'get' | 'delete';
  service: string;
  account: string;
  password?: string;
}

function makeFakeKeytar(shouldFail = false) {
  const calls: KeyCall[] = [];
  const store = new Map<string, string>();
  const keytar = {
    setPassword: vi.fn(async (service: string, account: string, password: string) => {
      calls.push({ op: 'set', service, account, password });
      if (shouldFail) throw new Error('keychain not available');
      store.set(`${service}:${account}`, password);
    }),
    getPassword: vi.fn(async (service: string, account: string) => {
      calls.push({ op: 'get', service, account });
      return store.get(`${service}:${account}`) ?? null;
    }),
    deletePassword: vi.fn(async (service: string, account: string) => {
      calls.push({ op: 'delete', service, account });
      return store.delete(`${service}:${account}`);
    }),
  };
  return { keytar, calls, store };
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

describe('credentials keytar — R5/R6/R7', () => {
  it('R5 — keytar success stores ref in file, not raw refresh-token', async () => {
    const mod = await import('../src/auth/credentials.js');
    const { keytar, calls } = makeFakeKeytar(false);
    mod.__setKeytarForTest(keytar);
    mod.__clearSessionMemoryForTest();
    await mod.storeOAuthCredential('default', {
      api_url: 'http://convo.test',
      user_id: 'usr_1',
      access_token: 'acc_short_lived',
      refresh_token: 'ref_tok_SHOULD_NOT_APPEAR_IN_FILE',
      access_token_expires_at: 12345,
      installation_id: 'inst_abc',
    });
    const raw = readFileSync(join(fakeHome, '.mootup', 'credentials.json'), 'utf8');
    const parsed = JSON.parse(raw);
    expect(parsed.default.refresh_token_ref).toBe('mootup-cli:default:refresh');
    expect(parsed.default.credential_type).toBe('oauth');
    expect(parsed.default.installation_id).toBe('inst_abc');
    expect(raw).not.toContain('ref_tok_SHOULD_NOT_APPEAR_IN_FILE');
    expect(calls.find((c) => c.op === 'set')).toBeDefined();
    mod.__setKeytarForTest(null);
  });

  it('R6 — keytar unavailable falls back, refresh-token NOT in file', async () => {
    const mod = await import('../src/auth/credentials.js');
    const { keytar } = makeFakeKeytar(true);
    mod.__setKeytarForTest(keytar);
    mod.__clearSessionMemoryForTest();
    const stderr: string[] = [];
    const origError = console.error;
    console.error = (...args: unknown[]) => {
      stderr.push(args.map(String).join(' '));
    };
    try {
      await mod.storeOAuthCredential('default', {
        api_url: 'http://convo.test',
        user_id: 'usr_1',
        access_token: 'acc',
        refresh_token: 'ref_tok_HEADLESS_FALLBACK',
        access_token_expires_at: 1,
      });
    } finally {
      console.error = origError;
    }
    const joined = stderr.join('\n');
    expect(joined).toContain('keychain unavailable');
    expect(joined).toContain('file-based storage at');
    const raw = readFileSync(join(fakeHome, '.mootup', 'credentials.json'), 'utf8');
    expect(raw).not.toContain('ref_tok_HEADLESS_FALLBACK');
    const parsed = JSON.parse(raw);
    expect(parsed.default.refresh_token_ref).toBeUndefined();
    // Memory fallback serves the refresh-token for this session
    expect(await mod.loadRefreshToken('default')).toBe('ref_tok_HEADLESS_FALLBACK');
    mod.__setKeytarForTest(null);
  });

  it('R7 — loadRefreshToken retrieves stored token via keytar', async () => {
    const mod = await import('../src/auth/credentials.js');
    const { keytar } = makeFakeKeytar(false);
    mod.__setKeytarForTest(keytar);
    mod.__clearSessionMemoryForTest();
    await mod.storeOAuthCredential('default', {
      api_url: 'http://convo.test',
      user_id: 'usr_1',
      access_token: 'acc',
      refresh_token: 'ref_tok_RETRIEVABLE',
      access_token_expires_at: 1,
    });
    const got = await mod.loadRefreshToken('default');
    expect(got).toBe('ref_tok_RETRIEVABLE');
    mod.__setKeytarForTest(null);
  });
});
