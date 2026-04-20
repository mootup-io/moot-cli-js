import { vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface FakeEnv {
  fakeHome: string;
  fakeCwd: string;
  cleanup: () => void;
}

export function makeFakeEnv(): FakeEnv {
  const fakeHome = mkdtempSync(join(tmpdir(), 'mootup-cli-home-'));
  const fakeCwd = mkdtempSync(join(tmpdir(), 'mootup-cli-cwd-'));
  mkdirSync(join(fakeCwd, '.git'));
  const prevHome = process.env.HOME;
  process.env.HOME = fakeHome;
  return {
    fakeHome,
    fakeCwd,
    cleanup: () => {
      if (prevHome !== undefined) process.env.HOME = prevHome;
      else delete process.env.HOME;
    },
  };
}

export function writeOAuthCredential(fakeHome: string): void {
  mkdirSync(join(fakeHome, '.mootup'), { mode: 0o700 });
  writeFileSync(
    join(fakeHome, '.mootup', 'credentials.json'),
    JSON.stringify(
      {
        default: {
          api_url: 'http://convo.test',
          token: 'acc_tok',
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

interface CredsModLike {
  __setKeytarForTest: (k: unknown) => void;
  __clearSessionMemoryForTest: () => void;
}

export function seedKeytar(credsMod: unknown): () => void {
  const mod = credsMod as CredsModLike;
  const keytar = {
    setPassword: vi.fn(async () => {}),
    getPassword: vi.fn(async () => 'ref_tok_xyz'),
    deletePassword: vi.fn(async () => true),
  };
  mod.__setKeytarForTest(keytar);
  mod.__clearSessionMemoryForTest();
  return () => mod.__setKeytarForTest(null);
}

export const INSTALL_RESP = {
  installation_id: 'inst_new',
  team_id: 'team_x',
  space_id: 'spc_new',
  space_name: 'My Team',
  actors: {
    leader: { actor_id: 'act_1', api_key: 'convo_key_1', display_name: 'Leader' },
    spec: { actor_id: 'act_2', api_key: 'convo_key_2', display_name: 'Spec' },
  },
};

export interface FakeFetchCall {
  url: string;
  body: string;
  method: string;
  headers: Headers;
}

export function makeInstallFetch(): {
  fetch: typeof globalThis.fetch;
  calls: FakeFetchCall[];
} {
  const calls: FakeFetchCall[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : (input as URL | Request).toString();
    const body = typeof init?.body === 'string' ? init.body : '';
    const method = (init?.method ?? 'GET').toUpperCase();
    const headers = new Headers(init?.headers ?? {});
    calls.push({ url, body, method, headers });
    if (url.endsWith('/api/teams/install')) {
      return new Response(JSON.stringify(INSTALL_RESP), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }) as unknown as Response;
    }
    throw new Error(`unexpected fetch: ${url}`);
  };
  return { fetch, calls };
}

export const PAT_RESP = {
  token: 'mootup_pat_test_abcdefghijklmnop1234',
  pat_id: 'pat_1',
};

export function makePatFetch(): {
  fetch: typeof globalThis.fetch;
  calls: FakeFetchCall[];
} {
  const calls: FakeFetchCall[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : (input as URL | Request).toString();
    const body = typeof init?.body === 'string' ? init.body : '';
    const method = (init?.method ?? 'GET').toUpperCase();
    const headers = new Headers(init?.headers ?? {});
    calls.push({ url, body, method, headers });
    if (url.endsWith('/api/personal-access-tokens')) {
      return new Response(JSON.stringify(PAT_RESP), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }) as unknown as Response;
    }
    throw new Error(`unexpected fetch: ${url}`);
  };
  return { fetch, calls };
}
