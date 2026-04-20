import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ORIGINAL_HOME = process.env.HOME;
let fakeHome: string;

function writeOAuthCredential() {
  mkdirSync(join(fakeHome, '.mootup'), { mode: 0o700 });
  writeFileSync(
    join(fakeHome, '.mootup', 'credentials.json'),
    JSON.stringify(
      {
        default: {
          api_url: 'http://convo.test',
          token: 'acc_short_lived',
          user_id: 'usr_1',
          credential_type: 'oauth',
          refresh_token_ref: 'mootup-cli:default:refresh',
          access_token_expires_at: 0,
          installation_id: 'inst_abcdef',
        },
      },
      null,
      2,
    ),
  );
}

function makeFakeKeytar() {
  const store = new Map<string, string>();
  store.set('mootup-cli:mootup-cli:default:refresh', 'ref_tok_xyz');
  return {
    setPassword: vi.fn(async (s: string, a: string, p: string) => {
      store.set(`${s}:${a}`, p);
    }),
    getPassword: vi.fn(async (s: string, a: string) => store.get(`${s}:${a}`) ?? 'ref_tok_xyz'),
    deletePassword: vi.fn(async (s: string, a: string) => store.delete(`${s}:${a}`)),
  };
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

describe('cmdLogout — R8/R9', () => {
  it('R8 — happy path revokes refresh token, deletes keychain, clears local state', async () => {
    writeOAuthCredential();
    const credsMod = await import('../src/auth/credentials.js');
    const keytar = makeFakeKeytar();
    credsMod.__setKeytarForTest(keytar);
    credsMod.__clearSessionMemoryForTest();

    const calls: { url: string; body: string }[] = [];
    const fakeFetch: typeof globalThis.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : (input as URL | Request).toString();
      const body = typeof init?.body === 'string' ? init.body : '';
      calls.push({ url, body });
      return new Response('', { status: 200 }) as unknown as Response;
    };

    const { cmdLogout } = await import('../src/index.js');
    await cmdLogout({ profile: 'default', fetch: fakeFetch });

    expect(calls.some((c) => c.url === 'http://convo.test/oauth/revoke')).toBe(true);
    const revokeCall = calls.find((c) => c.url === 'http://convo.test/oauth/revoke');
    expect(revokeCall?.body).toContain('token=ref_tok_xyz');
    expect(keytar.deletePassword).toHaveBeenCalledWith('mootup-cli', 'mootup-cli:default:refresh');

    const raw = readFileSync(join(fakeHome, '.mootup', 'credentials.json'), 'utf8');
    const parsed = JSON.parse(raw);
    expect(parsed.default).toBeUndefined();

    credsMod.__setKeytarForTest(null);
  });

  it('R9 — prints installation_id on revoke', async () => {
    writeOAuthCredential();
    const credsMod = await import('../src/auth/credentials.js');
    credsMod.__setKeytarForTest(makeFakeKeytar());
    credsMod.__clearSessionMemoryForTest();
    const fakeFetch: typeof globalThis.fetch = async () =>
      new Response('', { status: 200 }) as unknown as Response;
    const lines: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(' '));
    };
    try {
      const { cmdLogout } = await import('../src/index.js');
      await cmdLogout({ profile: 'default', fetch: fakeFetch });
    } finally {
      console.log = origLog;
    }
    const joined = lines.join('\n');
    expect(joined).toMatch(/inst_abcdef/);
    credsMod.__setKeytarForTest(null);
  });

  // Silence unused-import warnings for fs fns used selectively in future tests.
  void existsSync;
});
