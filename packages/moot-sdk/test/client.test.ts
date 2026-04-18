import { describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from './setup.js';
import { createMootupClient } from '../src/client.js';

// msw persists Set-Cookie values in a shared in-memory cookie store keyed by
// origin. Using a unique origin per test keeps state from leaking between
// cases that assert on Cookie-header presence.
let nextOriginId = 0;
function uniqueBaseUrl(): string {
  return `http://convo-${nextOriginId++}.test`;
}

describe('createMootupClient', () => {
  it('returns a typed 200 for GET /health', async () => {
    const baseUrl = uniqueBaseUrl();
    server.use(
      http.get(`${baseUrl}/health`, () =>
        HttpResponse.json({ status: 'ok' }),
      ),
    );

    const client = createMootupClient({ baseUrl });
    const { data, response } = await client.GET('/health');

    expect(response.status).toBe(200);
    expect((data as { status: string }).status).toBe('ok');
  });

  it('propagates Bearer token when apiKey is set', async () => {
    const baseUrl = uniqueBaseUrl();
    let capturedAuth: string | null = null;
    server.use(
      http.post(`${baseUrl}/api/agents/:agent_id/first-key`, ({ request }) => {
        capturedAuth = request.headers.get('Authorization');
        return HttpResponse.json({ api_key: 'convo_new_key' });
      }),
    );

    const client = createMootupClient({ baseUrl, apiKey: 'convo_test_key' });
    await client.POST('/api/agents/{agent_id}/first-key', {
      params: { path: { agent_id: 'agt_1' } },
    });

    expect(capturedAuth).toBe('Bearer convo_test_key');
  });

  it('omits Authorization header when apiKey is unset', async () => {
    const baseUrl = uniqueBaseUrl();
    let capturedAuth: string | null = 'sentinel';
    server.use(
      http.get(`${baseUrl}/health`, ({ request }) => {
        capturedAuth = request.headers.get('Authorization');
        return HttpResponse.json({ status: 'ok' });
      }),
    );

    const client = createMootupClient({ baseUrl });
    await client.GET('/health');

    expect(capturedAuth).toBeNull();
  });

  it('captures Set-Cookie and replays on subsequent calls when persistCookies is true', async () => {
    // Use custom fetch to bypass msw: msw v2's own cookieStore would replay
    // Set-Cookie on subsequent requests regardless of the SDK middleware chain,
    // making a pass indistinguishable from a broken middleware. Same issue as
    // test 5 (noted in Impl deviation). Capturing Request objects directly
    // tests what the SDK's cookie middleware actually sends.
    const baseUrl = 'http://convo-persistent.test';
    let secondCallCookie: string | null = null;
    const fakeFetch: typeof globalThis.fetch = async (input, init) => {
      const req = new Request(input, init);
      const url = new URL(req.url);
      if (url.pathname.endsWith('/auth/request')) {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'set-cookie': 'convo_session=abc123; Path=/; HttpOnly',
          },
        });
      }
      secondCallCookie = req.headers.get('Cookie');
      return new Response(JSON.stringify({ actor_id: 'act_1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    const client = createMootupClient({ baseUrl, persistCookies: true, fetch: fakeFetch });
    await client.POST('/auth/request', {
      body: { email: 'test@example.com' },
    });
    await client.GET('/api/actors/me');

    expect(secondCallCookie).not.toBeNull();
    expect(secondCallCookie).toContain('convo_session=abc123');
  });

  it('does not send Cookie header without persistCookies', async () => {
    // Use a handcrafted fetch to bypass msw entirely: msw's own cookie store
    // emulates browser behavior and would persist cookies across calls
    // regardless of the client's opts. We want to assert the SDK's middleware
    // chain does not add a Cookie header, so we capture the Request directly
    // as the caller-supplied fetch sees it.
    const baseUrl = 'http://convo.test';
    const capturedCookies: Array<string | null> = [];
    const fakeFetch: typeof globalThis.fetch = async (input, init) => {
      const req = new Request(input, init);
      capturedCookies.push(req.headers.get('Cookie'));
      if (req.url.endsWith('/auth/request')) {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'set-cookie': 'convo_session=abc123; Path=/; HttpOnly',
          },
        });
      }
      return new Response(JSON.stringify({ actor_id: 'act_1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    const client = createMootupClient({ baseUrl, fetch: fakeFetch });
    await client.POST('/auth/request', {
      body: { email: 'test@example.com' },
    });
    await client.GET('/api/actors/me');

    expect(capturedCookies).toEqual([null, null]);
  });

  it('uses the custom fetch when one is injected', async () => {
    const baseUrl = uniqueBaseUrl();
    server.use(
      http.get(`${baseUrl}/health`, () =>
        HttpResponse.json({ status: 'ok' }),
      ),
    );

    const spy = vi.fn((input: Request | URL | string, init?: RequestInit) =>
      globalThis.fetch(input, init),
    );
    const client = createMootupClient({
      baseUrl,
      fetch: spy as unknown as typeof globalThis.fetch,
    });
    await client.GET('/health');

    expect(spy).toHaveBeenCalledTimes(1);
  });
});
