import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import {
  mkdtempSync,
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { server } from './setup.js';

const ORIGINAL_HOME = process.env.HOME;
let fakeHome: string;
let fakeCwd: string;

beforeEach(() => {
  fakeHome = mkdtempSync(join(tmpdir(), 'mootup-cli-home-'));
  fakeCwd = mkdtempSync(join(tmpdir(), 'mootup-cli-cwd-'));
  mkdirSync(join(fakeCwd, '.git'));
  process.env.HOME = fakeHome;
  vi.resetModules();
});

afterEach(() => {
  process.env.HOME = ORIGINAL_HOME;
  rmSync(fakeHome, { recursive: true, force: true });
  rmSync(fakeCwd, { recursive: true, force: true });
});

function writeCredential(): void {
  mkdirSync(join(fakeHome, '.mootup'), { mode: 0o700 });
  writeFileSync(
    join(fakeHome, '.mootup', 'credentials.json'),
    JSON.stringify(
      {
        default: {
          api_url: 'http://convo.test',
          token: 'mootup_pat_abc',
          user_id: 'usr_1',
        },
      },
      null,
      2,
    ),
  );
}

describe('cmdInit', () => {
  it('errors in headless env when no credential (T3)', async () => {
    const prev = { display: process.env.DISPLAY, wayland: process.env.WAYLAND_DISPLAY };
    delete process.env.DISPLAY;
    delete process.env.WAYLAND_DISPLAY;
    try {
      const { cmdInit } = await import('../src/index.js');
      await expect(cmdInit({ cwd: fakeCwd })).rejects.toThrow(/Headless environment/);
    } finally {
      if (prev.display !== undefined) process.env.DISPLAY = prev.display;
      if (prev.wayland !== undefined) process.env.WAYLAND_DISPLAY = prev.wayland;
    }
  });

  it('rotates keys and writes .moot/actors.json (T4)', async () => {
    writeCredential();
    server.use(
      http.get('http://convo.test/api/actors/me', () =>
        HttpResponse.json({
          actor_id: 'usr_1',
          display_name: 'Test User',
          default_space_id: 'spc_abc',
        }),
      ),
      http.get('http://convo.test/api/actors/me/agents', () =>
        HttpResponse.json([
          {
            actor_id: 'act_1',
            display_name: 'Leader',
            actor_type: 'agent',
            api_key_prefix: null,
          },
          {
            actor_id: 'act_2',
            display_name: 'Spec',
            actor_type: 'agent',
            api_key_prefix: null,
          },
        ]),
      ),
      http.post('http://convo.test/api/actors/act_1/rotate-key', () =>
        HttpResponse.json({ api_key: 'convo_key_rotated_1' }),
      ),
      http.post('http://convo.test/api/actors/act_2/rotate-key', () =>
        HttpResponse.json({ api_key: 'convo_key_rotated_2' }),
      ),
    );
    const { cmdInit } = await import('../src/index.js');
    await cmdInit({ cwd: fakeCwd });
    const actorsPath = join(fakeCwd, '.moot', 'actors.json');
    expect(existsSync(actorsPath)).toBe(true);
    const parsed = JSON.parse(readFileSync(actorsPath, 'utf8'));
    expect(parsed.space_id).toBe('spc_abc');
    expect(parsed.space_name).toBe('spc_abc');
    expect(parsed.actors.leader.api_key).toBe('convo_key_rotated_1');
    expect(parsed.actors.spec.api_key).toBe('convo_key_rotated_2');
    expect(statSync(actorsPath).mode & 0o777).toBe(0o600);
    // D-INIT-MINIMAL: .devcontainer/ installed (from templates)
    expect(existsSync(join(fakeCwd, '.devcontainer'))).toBe(true);
    expect(existsSync(join(fakeCwd, '.devcontainer', 'devcontainer.json'))).toBe(true);
  });

  it('refuses when .moot/actors.json exists without --force (T5)', async () => {
    writeCredential();
    mkdirSync(join(fakeCwd, '.moot'));
    writeFileSync(join(fakeCwd, '.moot', 'actors.json'), '{}');
    const { cmdInit } = await import('../src/index.js');
    await expect(cmdInit({ cwd: fakeCwd })).rejects.toThrow(/already exists/);
  });

  it('R2 — OAuth happy path: seeds no credential, exchanges code, installs team', async () => {
    const credsMod = await import('../src/auth/credentials.js');
    credsMod.__setKeytarForTest({
      setPassword: vi.fn(async () => {}),
      getPassword: vi.fn(async () => 'ref_tok_stored'),
      deletePassword: vi.fn(async () => true),
    });
    credsMod.__clearSessionMemoryForTest();

    const calls: { url: string; body: string; method: string; headers: Headers }[] = [];
    const fakeFetch: typeof globalThis.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : (input as URL | Request).toString();
      const body = typeof init?.body === 'string' ? init.body : '';
      const method = (init?.method ?? 'GET').toUpperCase();
      const headers = new Headers(init?.headers ?? {});
      calls.push({ url, body, method, headers });
      if (url.endsWith('/oauth/token')) {
        return new Response(
          JSON.stringify({
            access_token: 'acc_tok',
            refresh_token: 'ref_tok',
            expires_in: 1800,
            token_type: 'Bearer',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ) as unknown as Response;
      }
      if (url.endsWith('/api/actors/me')) {
        return new Response(JSON.stringify({ actor_id: 'usr_1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }) as unknown as Response;
      }
      if (url.endsWith('/api/teams/install')) {
        return new Response(
          JSON.stringify({
            installation_id: 'inst_new',
            team_id: 'team_x',
            space_id: 'spc_new',
            space_name: 'My Team',
            actors: {
              leader: { actor_id: 'act_1', api_key: 'convo_key_1', display_name: 'Leader' },
              spec: { actor_id: 'act_2', api_key: 'convo_key_2', display_name: 'Spec' },
            },
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        ) as unknown as Response;
      }
      throw new Error(`unexpected fetch: ${url}`);
    };

    process.env.DISPLAY = ':0';
    try {
      const { cmdInit } = await import('../src/index.js');
      await cmdInit({
        cwd: fakeCwd,
        apiUrl: 'http://convo.test',
        fetch: fakeFetch,
        openBrowser: async () => {},
        waitForCallback: async () => 'auth_code',
        archetype: 'mootup/loop-4',
      });
    } finally {
      delete process.env.DISPLAY;
      credsMod.__setKeytarForTest(null);
    }

    const installCall = calls.find((c) => c.url.endsWith('/api/teams/install'));
    expect(installCall).toBeDefined();
    const idempKey = installCall!.headers.get('Idempotency-Key');
    expect(idempKey).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(installCall!.headers.get('Authorization')).toBe('Bearer acc_tok');
    expect(installCall!.body).toContain('"archetype_id":"mootup/loop-4"');

    const actorsPath = join(fakeCwd, '.moot', 'actors.json');
    expect(existsSync(actorsPath)).toBe(true);
    const actors = JSON.parse(readFileSync(actorsPath, 'utf8'));
    expect(actors.actors.leader.api_key).toBe('convo_key_1');
  });

  it('R3 — PAT escape hatch: PAT credential skips OAuth flow', async () => {
    writeCredential();
    const calls: string[] = [];
    const fakeFetch: typeof globalThis.fetch = async (input) => {
      let url: string;
      if (typeof input === 'string') url = input;
      else if (input instanceof URL) url = input.toString();
      else url = (input as Request).url;
      calls.push(url);
      if (url.endsWith('/api/actors/me')) {
        return new Response(
          JSON.stringify({
            actor_id: 'usr_1',
            display_name: 'Test User',
            default_space_id: 'spc_abc',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ) as unknown as Response;
      }
      if (url.endsWith('/api/actors/me/agents')) {
        return new Response(
          JSON.stringify([
            {
              actor_id: 'act_1',
              display_name: 'Leader',
              actor_type: 'agent',
              api_key_prefix: null,
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ) as unknown as Response;
      }
      if (url.endsWith('/api/actors/act_1/rotate-key')) {
        return new Response(JSON.stringify({ api_key: 'convo_key_1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }) as unknown as Response;
      }
      throw new Error(`unexpected fetch: ${url}`);
    };
    // msw is still up; override with our fakeFetch threaded via opts.fetch so cmdInit's SDK uses it.
    const { cmdInit } = await import('../src/index.js');
    await cmdInit({ cwd: fakeCwd, fetch: fakeFetch });
    // No /oauth/ endpoint should have been touched (PAT skips OAuth entirely).
    expect(calls.some((u) => u.includes('/oauth/'))).toBe(false);
    // Legacy keyless flow wrote .moot/actors.json
    const actorsPath = join(fakeCwd, '.moot', 'actors.json');
    expect(existsSync(actorsPath)).toBe(true);
  });

  it('stages .devcontainer/ when it already exists (T6)', async () => {
    writeCredential();
    mkdirSync(join(fakeCwd, '.devcontainer'));
    writeFileSync(
      join(fakeCwd, '.devcontainer', 'devcontainer.json'),
      '{"preserved": true}',
    );
    server.use(
      http.get('http://convo.test/api/actors/me', () =>
        HttpResponse.json({
          actor_id: 'usr_1',
          display_name: 'Test User',
          default_space_id: 'spc_abc',
        }),
      ),
      http.get('http://convo.test/api/actors/me/agents', () =>
        HttpResponse.json([
          {
            actor_id: 'act_1',
            display_name: 'Leader',
            actor_type: 'agent',
            api_key_prefix: null,
          },
        ]),
      ),
      http.post('http://convo.test/api/actors/act_1/rotate-key', () =>
        HttpResponse.json({ api_key: 'convo_key_rotated_1' }),
      ),
    );
    const { cmdInit } = await import('../src/index.js');
    await cmdInit({ cwd: fakeCwd });
    // Operator's existing .devcontainer/ preserved
    const preserved = readFileSync(
      join(fakeCwd, '.devcontainer', 'devcontainer.json'),
      'utf8',
    );
    expect(preserved).toContain('preserved');
    // Staged copy under .moot/suggested-devcontainer/
    expect(
      existsSync(join(fakeCwd, '.moot', 'suggested-devcontainer', 'devcontainer.json')),
    ).toBe(true);
  });
});
