// AH-g Required tests R3–R8: connectMootup behavior.
// Hand-crafted MCP-client stubs (NOT msw) — MCP calls aren't HTTP at the
// client level; they're method calls on a caller-supplied client instance.

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  connectMootup,
  MootupNotOrientedError,
  type MCPClientLike,
} from '../src/index.js';

interface CapturedCall {
  name: string;
  arguments?: Record<string, unknown>;
}

function makeStubClient(
  response: {
    content?: Array<{ type: string; text?: string }>;
    structuredContent?: unknown;
    isError?: boolean;
  },
  opts: { throwOnCall?: Error } = {},
): { client: MCPClientLike; calls: CapturedCall[] } {
  const calls: CapturedCall[] = [];
  const client: MCPClientLike = {
    async callTool(req) {
      calls.push({ name: req.name, arguments: req.arguments });
      if (opts.throwOnCall) throw opts.throwOnCall;
      return response;
    },
  };
  return { client, calls };
}

const validOrientationStructured = {
  identity: {
    actor_id: 'agt_test',
    display_name: 'Test Agent',
    actor_type: 'agent',
    is_admin: false,
  },
  focus_space: {
    space_id: 'spc_test',
    description: 'test',
    status: 'active',
  },
  unread_mentions: 0,
  last_status: null,
  participants: [],
  context: 'summary body',
};

const ORIG_ENV = { ...process.env };

beforeEach(() => {
  delete process.env.MOOTUP_OAUTH_TOKEN;
  delete process.env.MOOTUP_API_KEY;
});

afterEach(() => {
  process.env = { ...ORIG_ENV };
});

describe('connectMootup — R3–R8', () => {
  it('R3: happy path extracts Session fields from structuredContent', async () => {
    const { client, calls } = makeStubClient({
      structuredContent: validOrientationStructured,
    });
    const session = await connectMootup(client, {
      baseUrl: 'http://convo.test',
      auth: 'mootup_pat_abc',
    });
    expect(session.participantId).toBe('agt_test');
    expect(session.spaceId).toBe('spc_test');
    expect(session.orientationSummary).toBe('summary body');
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe('orientation');
  });

  it.each([
    { label: 'explicit kwarg wins', explicit: 'explicit_token', envOauth: 'env_oauth', envApi: 'env_api', expectOk: true },
    { label: 'oauth env when no kwarg', explicit: undefined, envOauth: 'env_oauth', envApi: 'env_api', expectOk: true },
    { label: 'api-key env fallback', explicit: undefined, envOauth: undefined, envApi: 'env_api', expectOk: true },
    { label: 'no auth → MootupNotOrientedError', explicit: undefined, envOauth: undefined, envApi: undefined, expectOk: false },
  ])('R4 auth precedence: $label', async ({ explicit, envOauth, envApi, expectOk }) => {
    if (envOauth) process.env.MOOTUP_OAUTH_TOKEN = envOauth;
    if (envApi) process.env.MOOTUP_API_KEY = envApi;
    const { client } = makeStubClient({
      structuredContent: validOrientationStructured,
    });
    if (expectOk) {
      const session = await connectMootup(client, {
        baseUrl: 'http://convo.test',
        ...(explicit !== undefined ? { auth: explicit } : {}),
      });
      expect(session.participantId).toBe('agt_test');
    } else {
      await expect(
        connectMootup(client, { baseUrl: 'http://convo.test' }),
      ).rejects.toBeInstanceOf(MootupNotOrientedError);
    }
  });

  it('R5: session.tools.* throws MootupNotOrientedError', async () => {
    const { client } = makeStubClient({
      structuredContent: validOrientationStructured,
    });
    const session = await connectMootup(client, {
      baseUrl: 'http://convo.test',
      auth: 'mootup_pat_abc',
    });
    // Typed tool accessors are not yet implemented — Proxy throws on any access.
    expect(() => (session.tools as Record<string, unknown>).foo).toThrow(
      MootupNotOrientedError,
    );
  });

  it('R6: session memoized per-client; 2nd call returns same instance; callTool once', async () => {
    const { client, calls } = makeStubClient({
      structuredContent: validOrientationStructured,
    });
    const first = await connectMootup(client, {
      baseUrl: 'http://convo.test',
      auth: 'mootup_pat_abc',
    });
    const second = await connectMootup(client, {
      baseUrl: 'http://convo.test',
      auth: 'mootup_pat_abc',
    });
    expect(second).toBe(first); // reference equality — memoized
    expect(calls).toHaveLength(1); // orientation invoked once
  });

  it('R7: session is frozen (mutation silently ignored or throws in strict mode)', async () => {
    const { client } = makeStubClient({
      structuredContent: validOrientationStructured,
    });
    const session = await connectMootup(client, {
      baseUrl: 'http://convo.test',
      auth: 'mootup_pat_abc',
    });
    expect(Object.isFrozen(session)).toBe(true);
    expect(() => {
      (session as unknown as { participantId: string }).participantId = 'spoofed';
    }).toThrow();
  });

  it('R8: OAuth-issuer-origin mismatch rejects when token is JWT-shaped', async () => {
    // JWT with iss=https://attacker.test/ but baseUrl=http://convo.test
    const header = Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url');
    const claims = Buffer.from(
      JSON.stringify({ iss: 'https://attacker.test/oauth/authorization-server' }),
    ).toString('base64url');
    const signature = 'sig';
    const jwt = `${header}.${claims}.${signature}`;
    const { client } = makeStubClient({
      structuredContent: validOrientationStructured,
    });
    await expect(
      connectMootup(client, { baseUrl: 'http://convo.test', auth: jwt }),
    ).rejects.toThrow(/base_url origin/);
  });

  it('R8b: non-JWT token skips issuer-origin check (PAT / api-key)', async () => {
    const { client } = makeStubClient({
      structuredContent: validOrientationStructured,
    });
    const session = await connectMootup(client, {
      baseUrl: 'http://convo.test',
      auth: 'mootup_pat_abcdef',
    });
    expect(session.participantId).toBe('agt_test');
  });

  it('throws if orientation response lacks structuredContent (pre-AH-g convo)', async () => {
    const { client } = makeStubClient({
      content: [{ type: 'text', text: '**Identity:** ...' }], // markdown-mode
    });
    await expect(
      connectMootup(client, { baseUrl: 'http://convo.test', auth: 'mootup_pat_abc' }),
    ).rejects.toThrow(/structuredContent/i);
  });

  it('falls back to JSON-parsed text block when structuredContent absent but text is JSON', async () => {
    const { client } = makeStubClient({
      content: [
        { type: 'text', text: JSON.stringify(validOrientationStructured) },
      ],
    });
    const session = await connectMootup(client, {
      baseUrl: 'http://convo.test',
      auth: 'mootup_pat_abc',
    });
    expect(session.participantId).toBe('agt_test');
  });

  it('isError=true → throws', async () => {
    const { client } = makeStubClient({ isError: true });
    await expect(
      connectMootup(client, { baseUrl: 'http://convo.test', auth: 'mootup_pat_abc' }),
    ).rejects.toThrow(/isError/);
  });

  it('redacts token-ish substrings from propagated errors (inv 11)', async () => {
    const { client } = makeStubClient({}, {
      throwOnCall: new Error('Bearer mootup_pat_secret leaked; api_key=xyz'),
    });
    const err = await connectMootup(client, {
      baseUrl: 'http://convo.test',
      auth: 'mootup_pat_secret',
    }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(String(err.message)).not.toMatch(/Bearer /);
    expect(String(err.message)).not.toMatch(/api_key/);
  });
});
