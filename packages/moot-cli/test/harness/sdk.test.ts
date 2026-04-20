import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  makeFakeEnv,
  writeOAuthCredential,
  seedKeytar,
  makePatFetch,
  PAT_RESP,
  type FakeEnv,
} from './helpers.js';

let env: FakeEnv;
let origLog: typeof console.log;
let logLines: string[];

beforeEach(() => {
  env = makeFakeEnv();
  logLines = [];
  origLog = console.log;
  console.log = (...args: unknown[]) => {
    logLines.push(args.map(String).join(' '));
  };
  vi.resetModules();
});

afterEach(() => {
  console.log = origLog;
  env.cleanup();
  rmSync(env.fakeCwd, { recursive: true, force: true });
  rmSync(env.fakeHome, { recursive: true, force: true });
});

describe('harness=sdk (R4, R10)', () => {
  it('R4 — default prints token suffix + config-path hint; does NOT print full token', async () => {
    writeOAuthCredential(env.fakeHome);
    const credsMod = await import('../../src/auth/credentials.js');
    const unpin = seedKeytar(credsMod);
    const { fetch, calls } = makePatFetch();

    const { cmdInit } = await import('../../src/index.js');
    try {
      await cmdInit({
        cwd: env.fakeCwd,
        apiUrl: 'http://convo.test',
        fetch,
        harness: 'sdk',
      });
    } finally {
      unpin();
    }

    const out = logLines.join('\n');
    const suffix = PAT_RESP.token.slice(-4);
    expect(out).toContain(`Token suffix: ...${suffix}`);
    expect(out).toContain('~/.config/moot/sdk-credentials.toml');
    expect(out).toContain('MOOTUP_PAT');
    expect(out).toContain('Revoke at: http://convo.test/settings/access');
    // Full token MUST NOT appear in default output
    expect(out).not.toContain(PAT_RESP.token);

    // No files written for sdk path
    expect(existsSync(join(env.fakeCwd, '.cursor'))).toBe(false);
    expect(existsSync(join(env.fakeCwd, '.moot'))).toBe(false);
    expect(existsSync(join(env.fakeCwd, '.devcontainer'))).toBe(false);

    // PAT mint was called
    expect(calls.some((c) => c.url.endsWith('/api/personal-access-tokens'))).toBe(true);
  });

  it('R10 — --show-token reveals full token', async () => {
    writeOAuthCredential(env.fakeHome);
    const credsMod = await import('../../src/auth/credentials.js');
    const unpin = seedKeytar(credsMod);
    const { fetch } = makePatFetch();

    const { cmdInit } = await import('../../src/index.js');
    try {
      await cmdInit({
        cwd: env.fakeCwd,
        apiUrl: 'http://convo.test',
        fetch,
        harness: 'sdk',
        showToken: true,
      });
    } finally {
      unpin();
    }

    const out = logLines.join('\n');
    expect(out).toContain(PAT_RESP.token);
    expect(out).toContain('shell history');
  });
});
