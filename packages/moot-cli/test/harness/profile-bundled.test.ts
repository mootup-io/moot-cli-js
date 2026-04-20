import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ORIGINAL_HOME = process.env.HOME;
let fakeHome: string;

beforeEach(() => {
  fakeHome = mkdtempSync(join(tmpdir(), 'mootup-cli-home-'));
  process.env.HOME = fakeHome;
  vi.resetModules();
});

afterEach(() => {
  process.env.HOME = ORIGINAL_HOME;
  rmSync(fakeHome, { recursive: true, force: true });
});

function writeStaticCredential(): void {
  mkdirSync(join(fakeHome, '.mootup'), { mode: 0o700 });
  writeFileSync(
    join(fakeHome, '.mootup', 'credentials.json'),
    JSON.stringify(
      {
        default: {
          api_url: 'http://convo.test',
          token: 'mootup_pat_abc',
          user_id: 'usr_1',
          credential_type: 'oauth',
          refresh_token_ref: 'mootup-cli:default:refresh',
          access_token_expires_at: 9999999999,
        },
      },
      null,
      2,
    ),
  );
}

describe('--profile regex bundled completion (R12–R14)', () => {
  it.each([
    ['logout', 'cmdLogout'],
    ['refresh', 'cmdRefresh'],
    ['login', 'cmdLogin'],
  ])('%s rejects invalid profile name', async (_name, fnName) => {
    writeStaticCredential();
    const mod = (await import('../../src/index.js')) as unknown as Record<
      string,
      (opts: Record<string, unknown>) => Promise<unknown>
    >;
    const fn = mod[fnName];
    expect(fn).toBeDefined();
    await expect(
      fn({ profile: 'bad!name', token: 'mootup_pat_x' }),
    ).rejects.toThrow(/invalid profile name/);
  });
});
