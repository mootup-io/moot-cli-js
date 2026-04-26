import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
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

beforeEach(() => {
  env = makeFakeEnv();
  vi.resetModules();
});

afterEach(() => {
  env.cleanup();
  rmSync(env.fakeCwd, { recursive: true, force: true });
  rmSync(env.fakeHome, { recursive: true, force: true });
});

describe('harness=cursor-ide (R3)', () => {
  it('R3 — host-solo happy path writes .cursor/mcp.json + .gitignore sidecar', async () => {
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
        harness: 'cursor-ide',
      });
    } finally {
      unpin();
    }

    const patCall = calls.find((c) => c.url.endsWith('/api/personal-access-tokens'));
    expect(patCall).toBeDefined();
    expect(patCall!.method).toBe('POST');
    expect(patCall!.headers.get('Authorization')).toBe('Bearer acc_tok');
    expect(patCall!.body).toMatch(/"name":"mootup-cursor-ide-default-/);

    const mcpPath = join(env.fakeCwd, '.cursor', 'mcp.json');
    expect(existsSync(mcpPath)).toBe(true);
    const mcp = JSON.parse(readFileSync(mcpPath, 'utf8'));
    expect(mcp.mcpServers.convo.url).toBe('http://convo.test/mcp');
    expect(mcp.mcpServers.convo.headers.Authorization).toBe(`Bearer ${PAT_RESP.token}`);
    expect(statSync(mcpPath).mode & 0o777).toBe(0o600);

    const gitignorePath = join(env.fakeCwd, '.gitignore');
    expect(existsSync(gitignorePath)).toBe(true);
    const gi = readFileSync(gitignorePath, 'utf8');
    expect(gi).toContain('.cursor/mcp.json');

    // No team install was attempted
    expect(calls.some((c) => c.url.endsWith('/api/teams/install'))).toBe(false);
  });

  it('R3b — appends to existing .gitignore without dupes', async () => {
    writeOAuthCredential(env.fakeHome);
    const credsMod = await import('../../src/auth/credentials.js');
    const unpin = seedKeytar(credsMod);
    const { fetch } = makePatFetch();

    // Pre-create .gitignore with existing content
    const { writeFileSync } = await import('node:fs');
    writeFileSync(join(env.fakeCwd, '.gitignore'), 'node_modules/\n');

    const { cmdInit } = await import('../../src/index.js');
    try {
      await cmdInit({
        cwd: env.fakeCwd,
        apiUrl: 'http://convo.test',
        fetch,
        harness: 'cursor-ide',
      });
    } finally {
      unpin();
    }

    const gi = readFileSync(join(env.fakeCwd, '.gitignore'), 'utf8');
    expect(gi).toContain('node_modules/');
    expect(gi).toContain('.cursor/mcp.json');
    expect(gi.match(/\.cursor\/mcp\.json/g)?.length).toBe(1);
  });

  it('R4 — second-init does not echo PAT to stdout', async () => {
    writeOAuthCredential(env.fakeHome);
    const credsMod = await import('../../src/auth/credentials.js');
    const unpin = seedKeytar(credsMod);
    const { fetch } = makePatFetch();

    // Pre-seed an existing .cursor/mcp.json containing a Bearer token.
    const { mkdirSync, writeFileSync } = await import('node:fs');
    mkdirSync(join(env.fakeCwd, '.cursor'), { recursive: true, mode: 0o700 });
    writeFileSync(
      join(env.fakeCwd, '.cursor', 'mcp.json'),
      JSON.stringify({
        mcpServers: {
          convo: {
            url: 'http://convo.test/mcp',
            headers: { Authorization: 'Bearer existing_pat_secret_xyz' },
          },
        },
      }),
    );

    const captured: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((s: string) => {
      captured.push(s);
    });

    try {
      const { cmdInit } = await import('../../src/index.js');
      try {
        await cmdInit({
          cwd: env.fakeCwd,
          apiUrl: 'http://convo.test',
          fetch,
          harness: 'cursor-ide',
          yes: false,
          confirm: async () => false, // user declines overwrite
        });
      } finally {
        unpin();
      }
    } finally {
      spy.mockRestore();
    }

    const stdoutAll = captured.join('\n');
    expect(stdoutAll).not.toContain('Bearer ');
    expect(stdoutAll).not.toContain('existing_pat_secret_xyz');
    // Positive: redacted message reaches stdout.
    expect(stdoutAll).toContain('.cursor/mcp.json already exists');
  });
});
