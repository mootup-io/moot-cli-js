import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
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
          token: 'acc_expired',
          user_id: 'usr_1',
          credential_type: 'oauth',
          refresh_token_ref: 'mootup-cli:default:refresh',
          access_token_expires_at: 1,
          installation_id: 'inst_abc',
        },
      },
      null,
      2,
    ),
  );
}

function makeFakeKeytar(tokenValue = 'ref_tok_xyz') {
  return {
    setPassword: vi.fn(async () => {}),
    getPassword: vi.fn(async () => tokenValue),
    deletePassword: vi.fn(async () => true),
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

describe('cmdRefresh — R10/R11', () => {
  it('R10 — happy path rotates access token, updates file + expires_at', async () => {
    writeOAuthCredential();
    const credsMod = await import('../src/auth/credentials.js');
    credsMod.__setKeytarForTest(makeFakeKeytar());
    credsMod.__clearSessionMemoryForTest();

    const calls: { url: string; body: string }[] = [];
    const fakeFetch: typeof globalThis.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : (input as URL | Request).toString();
      const body = typeof init?.body === 'string' ? init.body : '';
      calls.push({ url, body });
      return new Response(
        JSON.stringify({
          access_token: 'acc_new_123',
          refresh_token: 'ref_new_456',
          expires_in: 1800,
          token_type: 'Bearer',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ) as unknown as Response;
    };
    const { cmdRefresh } = await import('../src/index.js');
    await cmdRefresh({ profile: 'default', fetch: fakeFetch });
    expect(calls[0]!.url).toBe('http://convo.test/oauth/token');
    expect(calls[0]!.body).toContain('grant_type=refresh_token');
    expect(calls[0]!.body).toContain('refresh_token=ref_tok_xyz');
    const parsed = JSON.parse(readFileSync(join(fakeHome, '.mootup', 'credentials.json'), 'utf8'));
    expect(parsed.default.token).toBe('acc_new_123');
    expect(parsed.default.access_token_expires_at).toBeGreaterThan(Math.floor(Date.now() / 1000));
    credsMod.__setKeytarForTest(null);
  });

  it('R11 — rejects on revoked chain with operator-facing notice', async () => {
    writeOAuthCredential();
    const credsMod = await import('../src/auth/credentials.js');
    credsMod.__setKeytarForTest(makeFakeKeytar());
    credsMod.__clearSessionMemoryForTest();
    const fakeFetch: typeof globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: 'invalid_grant' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }) as unknown as Response;
    const stderr: string[] = [];
    const origError = console.error;
    console.error = (...args: unknown[]) => {
      stderr.push(args.map(String).join(' '));
    };
    try {
      const { cmdRefresh } = await import('../src/index.js');
      await expect(cmdRefresh({ profile: 'default', fetch: fakeFetch })).rejects.toThrow(
        /revoked|invalid_grant/i,
      );
    } finally {
      console.error = origError;
    }
    expect(stderr.some((l) => l.includes('inst_abc'))).toBe(true);
    credsMod.__setKeytarForTest(null);
  });
});
