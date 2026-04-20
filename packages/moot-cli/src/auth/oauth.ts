import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer, type Server, type Socket } from 'node:net';
import { spawn } from 'node:child_process';

export interface OAuthBrowserFlowOptions {
  apiUrl: string;
  clientId?: string;
  scope?: string;
  fetchImpl?: typeof globalThis.fetch;
  openImpl?: (url: string) => Promise<void>;
  waitForCallbackImpl?: (expectedState: string) => Promise<string>;
}

export interface OAuthTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export interface BrowserFlowResult {
  access_token: string;
  refresh_token: string;
  access_token_expires_at: number;
  token_type: string;
}

export function shouldUseBrowser(): boolean {
  if (process.env.MOOTUP_FORCE_DEVICE_CODE === '1') return false;
  if (process.platform === 'darwin' || process.platform === 'win32') return true;
  return Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
}

export function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function mintPkcePair(): { verifier: string; challenge: string } {
  const verifier = base64UrlEncode(randomBytes(32));
  const challenge = base64UrlEncode(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

export function mintState(): string {
  return randomBytes(16).toString('hex');
}

export function generateIdempotencyKey(): string {
  return randomUUID();
}

export async function runBrowserFlow(
  opts: OAuthBrowserFlowOptions,
): Promise<BrowserFlowResult> {
  const clientId = opts.clientId ?? 'mootup-cli';
  const scope = opts.scope ?? 'team:install';
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const openFn = opts.openImpl ?? openBrowser;

  const { verifier, challenge } = mintPkcePair();
  const state = mintState();

  let port: number;
  let waitForCallback: (expectedState: string) => Promise<string>;
  if (opts.waitForCallbackImpl) {
    port = 0;
    waitForCallback = opts.waitForCallbackImpl;
  } else {
    const listener = await startCallbackListener(state);
    port = listener.port;
    waitForCallback = listener.wait;
  }

  const redirectUri = `http://localhost:${port}/callback`;
  const authorizeUrl =
    `${opts.apiUrl}/oauth/authorize?response_type=code&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}` +
    `&state=${state}&code_challenge=${challenge}&code_challenge_method=S256`;

  console.log(`Opening browser for authorization: ${authorizeUrl}`);
  try {
    await openFn(authorizeUrl);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `Could not launch browser (${msg}). Open the URL above manually.`,
    );
  }

  const code = await waitForCallback(state);

  const tokenRes = await fetchImpl(`${opts.apiUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
      client_id: clientId,
    }).toString(),
  });
  if (tokenRes.status !== 200) {
    const body = await tokenRes.text();
    throw new Error(`/oauth/token exchange failed (${tokenRes.status}): ${body}`);
  }
  const body = (await tokenRes.json()) as OAuthTokenResponse;
  if (!body.access_token || !body.refresh_token) {
    throw new Error('/oauth/token response missing access_token or refresh_token');
  }
  return {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    access_token_expires_at: Math.floor(Date.now() / 1000) + (body.expires_in ?? 0),
    token_type: body.token_type ?? 'Bearer',
  };
}

export async function refreshAccessToken(opts: {
  apiUrl: string;
  refreshToken: string;
  clientId?: string;
  fetchImpl?: typeof globalThis.fetch;
}): Promise<BrowserFlowResult> {
  const clientId = opts.clientId ?? 'mootup-cli';
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const res = await fetchImpl(`${opts.apiUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: opts.refreshToken,
      client_id: clientId,
    }).toString(),
  });
  if (res.status !== 200) {
    const body = await res.text();
    throw new Error(`/oauth/token refresh failed (${res.status}): ${body}`);
  }
  const body = (await res.json()) as OAuthTokenResponse;
  return {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    access_token_expires_at: Math.floor(Date.now() / 1000) + (body.expires_in ?? 0),
    token_type: body.token_type ?? 'Bearer',
  };
}

export async function revokeRefreshToken(opts: {
  apiUrl: string;
  refreshToken: string;
  clientId?: string;
  fetchImpl?: typeof globalThis.fetch;
}): Promise<void> {
  const clientId = opts.clientId ?? 'mootup-cli';
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  await fetchImpl(`${opts.apiUrl}/oauth/revoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      token: opts.refreshToken,
      client_id: clientId,
    }).toString(),
  });
}

async function openBrowser(url: string): Promise<void> {
  const cmd =
    process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
        ? 'start'
        : 'xdg-open';
  const child = spawn(cmd, [url], { stdio: 'ignore', detached: true, shell: process.platform === 'win32' });
  child.unref();
}

interface CallbackListener {
  port: number;
  wait: (expectedState: string) => Promise<string>;
}

async function startCallbackListener(expectedState: string): Promise<CallbackListener> {
  let server: Server;
  let resolveWait: (code: string) => void;
  let rejectWait: (err: Error) => void;
  const waitPromise = new Promise<string>((resolve, reject) => {
    resolveWait = resolve;
    rejectWait = reject;
  });

  server = createServer((socket: Socket) => {
    let buf = '';
    socket.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      const headerEnd = buf.indexOf('\r\n\r\n');
      if (headerEnd === -1) return;
      const firstLine = buf.slice(0, buf.indexOf('\r\n'));
      const match = firstLine.match(/^GET\s+(\S+)\s+HTTP/);
      if (!match) {
        socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
        return;
      }
      const pathAndQuery = match[1]!;
      const url = new URL(pathAndQuery, 'http://localhost');
      const gotState = url.searchParams.get('state');
      const gotCode = url.searchParams.get('code');
      const gotError = url.searchParams.get('error');
      if (gotError) {
        sendResponse(socket, 400, `OAuth error: ${gotError}. You can close this window.`);
        rejectWait(new Error(`OAuth error: ${gotError}`));
        return;
      }
      if (!gotState || !gotCode || gotState !== expectedState) {
        sendResponse(socket, 400, 'OAuth state mismatch. You can close this window.');
        rejectWait(new Error('OAuth state mismatch'));
        return;
      }
      sendResponse(socket, 200, 'Authorization received. You can close this window.');
      resolveWait(gotCode);
    });
    socket.on('error', () => {
      // ignore
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  return {
    port,
    wait: async (expected: string) => {
      try {
        const code = await waitPromise;
        return code;
      } finally {
        server.close();
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      void expected;
    },
  };
}

function sendResponse(socket: Socket, status: number, body: string): void {
  const reason = status === 200 ? 'OK' : 'Bad Request';
  socket.end(
    `HTTP/1.1 ${status} ${reason}\r\n` +
    'Content-Type: text/plain; charset=utf-8\r\n' +
    `Content-Length: ${Buffer.byteLength(body)}\r\n` +
    'Connection: close\r\n' +
    '\r\n' +
    body,
  );
}
