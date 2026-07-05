import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  makeFakeEnv,
  writeOAuthCredential,
  seedKeytar,
  makeInstallFetch,
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

describe('harness=codex', () => {
  it('devcontainer-team happy path uses Codex-specific template variant', async () => {
    writeOAuthCredential(env.fakeHome);
    const credsMod = await import('../../src/auth/credentials.js');
    const unpin = seedKeytar(credsMod);
    const { fetch, calls } = makeInstallFetch();

    const { cmdInit } = await import('../../src/index.js');
    try {
      await cmdInit({
        cwd: env.fakeCwd,
        apiUrl: 'http://convo.test',
        fetch,
        archetype: 'mootup/loop-4',
        harness: 'codex',
      });
    } finally {
      unpin();
    }

    expect(calls.some((c) => c.url.endsWith('/api/teams/install'))).toBe(true);
    expect(calls.some((c) => c.url.endsWith('/api/personal-access-tokens'))).toBe(false);
    expect(existsSync(join(env.fakeCwd, '.moot', 'actors.json'))).toBe(true);

    const dcPath = join(env.fakeCwd, '.devcontainer', 'devcontainer.json');
    expect(existsSync(dcPath)).toBe(true);
    const dc = readFileSync(dcPath, 'utf8');
    expect(dc).toContain('moot-agent-team-codex');
    expect(dc).toContain('moot-codex-${localWorkspaceFolderBasename}');

    const postCreate = readFileSync(
      join(env.fakeCwd, '.devcontainer', 'post-create.sh'),
      'utf8',
    );
    expect(postCreate).toContain('https://chatgpt.com/codex/install.sh');
    expect(postCreate).toContain('approval_policy = "never"');
    expect(postCreate).toContain('sandbox_mode = "workspace-write"');
    expect(postCreate).toContain('[mcp_servers.convo]');
    expect(postCreate).toContain('[mcp_servers.convo-channel]');
    expect(postCreate).not.toContain('claude mcp add');
  });
});
