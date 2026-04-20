import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import {
  runBrowserFlow,
  shouldUseBrowser,
  mintPkcePair,
  mintState,
  generateIdempotencyKey,
} from '../src/auth/oauth.js';

describe('OAuth helpers — primitives', () => {
  it('mintPkcePair produces verifier + challenge shapes (R1-helper)', () => {
    const { verifier, challenge } = mintPkcePair();
    expect(verifier).toMatch(/^[A-Za-z0-9\-_]+$/);
    expect(challenge).toMatch(/^[A-Za-z0-9\-_]+$/);
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(challenge.length).toBeGreaterThanOrEqual(43);
  });

  it('mintState produces 32-hex-char state', () => {
    expect(mintState()).toMatch(/^[a-f0-9]{32}$/);
  });

  it('generateIdempotencyKey returns UUID v4 shape', () => {
    const k = generateIdempotencyKey();
    expect(k).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('OAuth browser flow — R1 happy path', () => {
  it('runs PKCE round-trip, validates state, returns access+refresh tokens', async () => {
    const captured: { url: string; body: string }[] = [];
    const fakeFetch: typeof globalThis.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : (input as URL | Request).toString();
      const body = typeof init?.body === 'string' ? init.body : '';
      captured.push({ url, body });
      return new Response(
        JSON.stringify({
          access_token: 'acc_tok_123',
          refresh_token: 'ref_tok_abc',
          expires_in: 1800,
          token_type: 'Bearer',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ) as unknown as Response;
    };
    const result = await runBrowserFlow({
      apiUrl: 'http://convo.test',
      fetchImpl: fakeFetch,
      openImpl: async () => { /* no-op */ },
      waitForCallbackImpl: async (state) => {
        expect(state).toMatch(/^[a-f0-9]{32}$/);
        return 'auth_code_xyz';
      },
    });
    expect(result.access_token).toBe('acc_tok_123');
    expect(result.refresh_token).toBe('ref_tok_abc');
    expect(result.access_token_expires_at).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(captured.length).toBe(1);
    expect(captured[0]!.url).toBe('http://convo.test/oauth/token');
    expect(captured[0]!.body).toContain('grant_type=authorization_code');
    expect(captured[0]!.body).toContain('code=auth_code_xyz');
    expect(captured[0]!.body).toContain('code_verifier=');
  });

  it('rejects when /oauth/token returns non-200', async () => {
    const fakeFetch: typeof globalThis.fetch = async () =>
      new Response('invalid_code', { status: 400 }) as unknown as Response;
    await expect(
      runBrowserFlow({
        apiUrl: 'http://convo.test',
        fetchImpl: fakeFetch,
        openImpl: async () => {},
        waitForCallbackImpl: async () => 'c',
      }),
    ).rejects.toThrow(/oauth\/token exchange failed/);
  });
});

describe('OAuth host detection — R4 parametrized', () => {
  const saved = {
    DISPLAY: process.env.DISPLAY,
    WAYLAND_DISPLAY: process.env.WAYLAND_DISPLAY,
    MOOTUP_FORCE_DEVICE_CODE: process.env.MOOTUP_FORCE_DEVICE_CODE,
  };
  beforeEach(() => {
    delete process.env.DISPLAY;
    delete process.env.WAYLAND_DISPLAY;
    delete process.env.MOOTUP_FORCE_DEVICE_CODE;
  });
  afterEach(() => {
    if (saved.DISPLAY !== undefined) process.env.DISPLAY = saved.DISPLAY;
    if (saved.WAYLAND_DISPLAY !== undefined) process.env.WAYLAND_DISPLAY = saved.WAYLAND_DISPLAY;
    if (saved.MOOTUP_FORCE_DEVICE_CODE !== undefined) {
      process.env.MOOTUP_FORCE_DEVICE_CODE = saved.MOOTUP_FORCE_DEVICE_CODE;
    }
  });

  it.each([
    { name: 'DISPLAY set → browser', env: { DISPLAY: ':0' } as Record<string, string>, expect: true },
    { name: 'WAYLAND_DISPLAY set → browser', env: { WAYLAND_DISPLAY: 'wayland-0' }, expect: true },
    { name: 'MOOTUP_FORCE_DEVICE_CODE=1 → NOT browser', env: { MOOTUP_FORCE_DEVICE_CODE: '1', DISPLAY: ':0' }, expect: false },
  ])('$name', ({ env, expect: expectedBrowser }) => {
    for (const [k, v] of Object.entries(env)) process.env[k] = v;
    // On darwin/win32, shouldUseBrowser is always true regardless of DISPLAY — skip those envs
    // when testing linux-style behavior. The deploy-target matrix is host-level anyway.
    if (process.platform === 'darwin' || process.platform === 'win32') {
      if (!env.MOOTUP_FORCE_DEVICE_CODE) {
        expect(shouldUseBrowser()).toBe(true);
        return;
      }
    }
    expect(shouldUseBrowser()).toBe(expectedBrowser);
  });
});

describe('OAuth degraded headless path (F-1 device-code fallback absent)', () => {
  it('headless linux (no DISPLAY, no WAYLAND) returns false from shouldUseBrowser', () => {
    const saved = { DISPLAY: process.env.DISPLAY, WAYLAND_DISPLAY: process.env.WAYLAND_DISPLAY };
    delete process.env.DISPLAY;
    delete process.env.WAYLAND_DISPLAY;
    try {
      if (process.platform === 'darwin' || process.platform === 'win32') {
        expect(shouldUseBrowser()).toBe(true);
      } else {
        expect(shouldUseBrowser()).toBe(false);
      }
    } finally {
      if (saved.DISPLAY !== undefined) process.env.DISPLAY = saved.DISPLAY;
      if (saved.WAYLAND_DISPLAY !== undefined) process.env.WAYLAND_DISPLAY = saved.WAYLAND_DISPLAY;
    }
  });

  it('MOOTUP_FORCE_DEVICE_CODE=1 takes precedence over DISPLAY', () => {
    const saved = {
      DISPLAY: process.env.DISPLAY,
      MOOTUP_FORCE_DEVICE_CODE: process.env.MOOTUP_FORCE_DEVICE_CODE,
    };
    process.env.DISPLAY = ':0';
    process.env.MOOTUP_FORCE_DEVICE_CODE = '1';
    try {
      expect(shouldUseBrowser()).toBe(false);
    } finally {
      if (saved.DISPLAY !== undefined) process.env.DISPLAY = saved.DISPLAY;
      else delete process.env.DISPLAY;
      if (saved.MOOTUP_FORCE_DEVICE_CODE !== undefined) {
        process.env.MOOTUP_FORCE_DEVICE_CODE = saved.MOOTUP_FORCE_DEVICE_CODE;
      } else {
        delete process.env.MOOTUP_FORCE_DEVICE_CODE;
      }
    }
  });
});
