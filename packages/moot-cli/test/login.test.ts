import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { mkdtempSync, existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { server } from './setup.js';

const ORIGINAL_HOME = process.env.HOME;
let fakeHome: string;

beforeEach(() => {
  fakeHome = mkdtempSync(join(tmpdir(), 'mootup-cli-test-'));
  process.env.HOME = fakeHome;
  vi.resetModules();
});

afterEach(() => {
  process.env.HOME = ORIGINAL_HOME;
  rmSync(fakeHome, { recursive: true, force: true });
});

describe('cmdLogin', () => {
  it('rejects a token missing the mootup_pat_ prefix (T1)', async () => {
    const { cmdLogin } = await import('../src/index.js');
    await expect(
      cmdLogin({
        token: 'convo_key_not_a_pat',
        apiUrl: 'http://convo.test',
        readToken: async () => 'convo_key_not_a_pat',
      }),
    ).rejects.toThrow(/invalid PAT prefix/);
    expect(existsSync(join(fakeHome, '.mootup', 'credentials.json'))).toBe(false);
  });

  it('stores credential on 200 OK (T2)', async () => {
    server.use(
      http.get('http://convo.test/api/actors/me', () =>
        HttpResponse.json({
          actor_id: 'act_123',
          display_name: 'Test User',
          default_space_id: 'spc_abc',
        }),
      ),
    );
    const { cmdLogin } = await import('../src/index.js');
    await cmdLogin({
      token: 'mootup_pat_example_token',
      apiUrl: 'http://convo.test',
    });
    const credPath = join(fakeHome, '.mootup', 'credentials.json');
    expect(existsSync(credPath)).toBe(true);
    const parsed = JSON.parse(readFileSync(credPath, 'utf8'));
    expect(parsed.default).toMatchObject({
      api_url: 'http://convo.test',
      token: 'mootup_pat_example_token',
      user_id: 'act_123',
    });
    // D-CREDENTIAL-PATH: mode 0o600
    const mode = statSync(credPath).mode & 0o777;
    expect(mode).toBe(0o600);
  });
});
