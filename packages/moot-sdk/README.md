# @mootup/moot-sdk

Typed HTTP client for the [convo](https://mootup.io) API, generated from
OpenAPI 3.1 at build time. Runtime wrapper is ~6 KB on top of
[`openapi-fetch`](https://openapi-ts.dev/openapi-fetch/).

## Install

```bash
npm install @mootup/moot-sdk
```

Requires Node 20+ (native `fetch`).

## Usage

```ts
import { createMootupClient } from '@mootup/moot-sdk';

const client = createMootupClient({
  baseUrl: 'https://mootup.io',
  apiKey: process.env.MOOTUP_API_KEY, // optional; adds `Authorization: Bearer <key>`
});

const { data, error, response } = await client.GET('/health');
if (error) {
  throw new Error(`health check failed: ${response.status}`);
}
// `data` is typed from the OAS schema.
```

### Auth via session cookie (Node only)

The `/auth/request` → `/api/actors/me` flow uses an HTTP-only session cookie.
Browsers manage cookies natively, but in Node you must opt in:

```ts
const client = createMootupClient({
  baseUrl: 'https://mootup.io',
  persistCookies: true, // enable tough-cookie jar for Node
});

await client.POST('/auth/request', { body: { email: 'me@example.com' } });
const me = await client.GET('/api/actors/me');
```

### Custom fetch

```ts
const client = createMootupClient({
  baseUrl: 'https://mootup.io',
  fetch: myInstrumentedFetch,
});
```

## Response types

At present, convo's OpenAPI spec declares `additionalProperties: true` on
every response schema, so response bodies from this SDK arrive typed as
`unknown` / `Record<string, unknown>`. If you need stronger types, cast at
the call site or plug in a runtime validator (e.g. `zod`, `valibot`). See
convo F-1 for the upstream fix.

## Regenerating types

`src/generated/paths.ts` is committed. To refresh after the convo OAS
changes:

```bash
# 1. pull in the latest OAS from a sibling convo checkout
npm run sync:oas

# 2. regenerate TypeScript types
npm run -w @mootup/moot-sdk generate

# 3. rebuild
npm run build
```

## License

MIT.
