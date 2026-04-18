import createClient from 'openapi-fetch';
import type { paths } from './generated/paths.js';
import { makeCookieJarMiddleware } from './cookies.js';

export interface MootupClientOptions {
  baseUrl: string;
  apiKey?: string;
  fetch?: typeof globalThis.fetch;
  persistCookies?: boolean;
}

export type MootupClient = ReturnType<typeof createMootupClient>;

export function createMootupClient(opts: MootupClientOptions) {
  const client = createClient<paths>({
    baseUrl: opts.baseUrl,
    fetch: opts.fetch,
  });

  if (opts.apiKey) {
    const token = opts.apiKey;
    client.use({
      async onRequest({ request }) {
        request.headers.set('Authorization', `Bearer ${token}`);
        return request;
      },
    });
  }

  if (opts.persistCookies) {
    client.use(makeCookieJarMiddleware());
  }

  return client;
}

export type { paths, components, operations } from './generated/paths.js';
