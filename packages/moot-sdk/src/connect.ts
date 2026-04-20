// AH-g: connectMootup — thin SDK helper that calls the shipped convo
// `orientation` MCP tool via a caller-supplied MCP client, surfaces a
// typed, frozen Session. Session is memoized per-client (inv 10).

import type { MCPClientLike, Session } from './session.js';
import { MootupNotOrientedError } from './session.js';

export type { MCPClientLike, Session };
export { MootupNotOrientedError };

export interface ConnectMootupOptions {
  baseUrl: string;
  auth?: string;
}

// Per-process, per-MCP-client session cache (inv 10).
const sessionCache = new WeakMap<object, Session>();

// Redaction list — error messages must never surface these (inv 11 / T-2).
const REDACTION_SUBSTRINGS = ['Bearer ', 'Authorization', 'api_key', 'token'];

function redactError(message: string): string {
  let out = message;
  for (const needle of REDACTION_SUBSTRINGS) {
    if (out.includes(needle)) {
      out = out.replace(new RegExp(needle, 'gi'), '<redacted>');
    }
  }
  return out;
}

function resolveAuth(explicit?: string): string {
  if (explicit) return explicit;
  const env = globalThis.process?.env ?? {};
  if (env.MOOTUP_OAUTH_TOKEN) return env.MOOTUP_OAUTH_TOKEN;
  if (env.MOOTUP_API_KEY) return env.MOOTUP_API_KEY;
  throw new MootupNotOrientedError(
    'No auth supplied (kwarg > MOOTUP_OAUTH_TOKEN > MOOTUP_API_KEY > error)',
  );
}

const JWT_SHAPE_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

function validateBaseUrlOrigin(baseUrl: string, token: string): void {
  // T-1: if token is JWT-shaped (heuristic OAuth detection), compare the
  // token's second segment (claims) iss URL origin to baseUrl origin.
  if (!JWT_SHAPE_RE.test(token)) return;
  const segments = token.split('.');
  let claims: { iss?: string };
  try {
    // base64url-decode the claims segment.
    const b64 = segments[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    const decoded = globalThis.atob
      ? globalThis.atob(b64 + pad)
      : Buffer.from(b64 + pad, 'base64').toString('binary');
    claims = JSON.parse(decoded) as { iss?: string };
  } catch {
    return;
  }
  if (!claims.iss) return;
  let issOrigin: string;
  let baseOrigin: string;
  try {
    issOrigin = new URL(claims.iss).origin;
    baseOrigin = new URL(baseUrl).origin;
  } catch {
    throw new Error('base_url or OAuth issuer URL is malformed');
  }
  if (issOrigin !== baseOrigin) {
    throw new Error(
      `base_url origin (${baseOrigin}) does not match OAuth issuer origin (${issOrigin})`,
    );
  }
}

function extractStructured(resp: {
  content?: Array<{ type: string; text?: string }>;
  structuredContent?: unknown;
  isError?: boolean;
}): Record<string, unknown> {
  if (resp.isError) {
    throw new Error('orientation tool returned isError=true');
  }
  if (resp.structuredContent && typeof resp.structuredContent === 'object') {
    return resp.structuredContent as Record<string, unknown>;
  }
  // Fallback: parse the JSON text block if FastMCP emitted only text.
  const text = resp.content?.find((c) => c.type === 'text')?.text;
  if (text) {
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      // fall through to error below
    }
  }
  throw new Error(
    'orientation response missing structuredContent (requires convo ≥AH-g)',
  );
}

function makeToolsProxy(): Record<string, never> {
  return new Proxy({} as Record<string, never>, {
    get(_target, prop): never {
      throw new MootupNotOrientedError(
        `Typed tool accessors are not yet implemented. Tried to access 'session.tools.${String(prop)}'. Use the caller-supplied MCP client directly until typed accessors ship.`,
      );
    },
  }) as Record<string, never>;
}

export async function connectMootup(
  client: MCPClientLike,
  opts: ConnectMootupOptions,
): Promise<Session> {
  const cached = sessionCache.get(client as object);
  if (cached) return cached;

  const token = resolveAuth(opts.auth);
  try {
    validateBaseUrlOrigin(opts.baseUrl, token);
  } catch (err) {
    throw new Error(redactError((err as Error).message));
  }

  let resp;
  try {
    resp = await client.callTool({ name: 'orientation', arguments: {} });
  } catch (err) {
    throw new Error(redactError(`orientation call failed: ${(err as Error).message}`));
  }

  const structured = extractStructured(resp);
  const identity = structured.identity as { actor_id?: unknown } | undefined;
  if (!identity || typeof identity.actor_id !== 'string') {
    throw new Error('orientation response missing identity.actor_id');
  }
  const focus = structured.focus_space as { space_id?: unknown } | null | undefined;
  const spaceId =
    focus && typeof focus.space_id === 'string' ? focus.space_id : null;
  const contextRaw = structured.context;
  const orientationSummary = typeof contextRaw === 'string' ? contextRaw : '';

  const session: Session = Object.freeze({
    participantId: identity.actor_id,
    spaceId,
    orientationSummary,
    tools: makeToolsProxy(),
  });
  sessionCache.set(client as object, session);
  return session;
}
