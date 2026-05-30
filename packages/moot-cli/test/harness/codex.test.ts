import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, readFileSync, mkdirSync, writeFileSync, rmSync, statSync } from 'node:fs';
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

describe('harness=codex (R-CODEX)', () => {
  it('R-CODEX-1 — host-solo happy path writes .codex/config.toml + .gitignore sidecar', async () => {
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
        harness: 'codex',
      });
    } finally {
      unpin();
    }

    const patCall = calls.find((c) => c.url.endsWith('/api/personal-access-tokens'));
    expect(patCall).toBeDefined();
    expect(patCall!.method).toBe('POST');
    expect(patCall!.headers.get('Authorization')).toBe('Bearer acc_tok');
    expect(patCall!.body).toMatch(/"name":"mootup-codex-default-/);

    const configPath = join(env.fakeCwd, '.codex', 'config.toml');
    expect(existsSync(configPath)).toBe(true);
    const content = readFileSync(configPath, 'utf8');
    expect(content).toContain('[mcp_servers.convo]');
    expect(content).toContain('url = "http://convo.test/mcp"');
    expect(content).toContain(`http_headers = { Authorization = "Bearer ${PAT_RESP.token}" }`);
    expect(statSync(configPath).mode & 0o777).toBe(0o600);

    const gitignorePath = join(env.fakeCwd, '.gitignore');
    expect(existsSync(gitignorePath)).toBe(true);
    const gi = readFileSync(gitignorePath, 'utf8');
    expect(gi).toContain('.codex/config.toml');

    // No team install was attempted (host-side-solo)
    expect(calls.some((c) => c.url.endsWith('/api/teams/install'))).toBe(false);
  });

  it('R-CODEX-2 — appends to existing .gitignore without dupes', async () => {
    writeOAuthCredential(env.fakeHome);
    const credsMod = await import('../../src/auth/credentials.js');
    const unpin = seedKeytar(credsMod);
    const { fetch } = makePatFetch();

    writeFileSync(join(env.fakeCwd, '.gitignore'), 'node_modules/\n');

    const { cmdInit } = await import('../../src/index.js');
    try {
      await cmdInit({
        cwd: env.fakeCwd,
        apiUrl: 'http://convo.test',
        fetch,
        harness: 'codex',
      });
    } finally {
      unpin();
    }

    const gi = readFileSync(join(env.fakeCwd, '.gitignore'), 'utf8');
    expect(gi).toContain('node_modules/');
    expect(gi).toContain('.codex/config.toml');
    expect(gi.match(/\.codex\/config\.toml/g)?.length).toBe(1);
  });

  it('R-CODEX-3 — second-init does not echo existing PAT to stdout (SEC-4-B mirror)', async () => {
    writeOAuthCredential(env.fakeHome);
    const credsMod = await import('../../src/auth/credentials.js');
    const unpin = seedKeytar(credsMod);
    const { fetch } = makePatFetch();

    // Pre-seed an existing .codex/config.toml containing a Bearer token.
    mkdirSync(join(env.fakeCwd, '.codex'), { recursive: true, mode: 0o700 });
    writeFileSync(
      join(env.fakeCwd, '.codex', 'config.toml'),
      '[mcp_servers.convo]\nurl = "http://convo.test/mcp"\nhttp_headers = { Authorization = "Bearer existing_codex_secret_xyz" }\n',
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
          harness: 'codex',
          yes: false,
          confirm: async () => false,
        });
      } finally {
        unpin();
      }
    } finally {
      spy.mockRestore();
    }

    const stdoutAll = captured.join('\n');
    expect(stdoutAll).not.toContain('Bearer ');
    expect(stdoutAll).not.toContain('existing_codex_secret_xyz');
    expect(stdoutAll).toContain('.codex/config.toml already exists');
  });

  it('R-CODEX-SEC — generateCodex leaves .codex at 0o700 and config.toml at 0o600', async () => {
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
        harness: 'codex',
      });
    } finally {
      unpin();
    }

    const codexDir = join(env.fakeCwd, '.codex');
    const configPath = join(codexDir, 'config.toml');
    expect(existsSync(codexDir)).toBe(true);
    expect(existsSync(configPath)).toBe(true);
    expect(statSync(codexDir).mode & 0o777).toBe(0o700);
    expect(statSync(configPath).mode & 0o777).toBe(0o600);
  });
});
