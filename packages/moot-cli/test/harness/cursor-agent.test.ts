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

describe('harness=cursor-agent (R2)', () => {
  it('R2 — devcontainer-team happy path uses Cursor-specific template variant', async () => {
    writeOAuthCredential(env.fakeHome);
    const credsMod = await import('../../src/auth/credentials.js');
    const unpin = seedKeytar(credsMod);
    const { fetch } = makeInstallFetch();

    const { cmdInit } = await import('../../src/index.js');
    try {
      await cmdInit({
        cwd: env.fakeCwd,
        apiUrl: 'http://convo.test',
        fetch,
        archetype: 'mootup/loop-4',
        harness: 'cursor-agent',
      });
    } finally {
      unpin();
    }

    expect(existsSync(join(env.fakeCwd, '.moot', 'actors.json'))).toBe(true);
    const dcPath = join(env.fakeCwd, '.devcontainer', 'devcontainer.json');
    expect(existsSync(dcPath)).toBe(true);
    const dc = readFileSync(dcPath, 'utf8');
    // Cursor-specific tweak: customizations.cursor block + cursor-suffixed name
    expect(dc).toContain('"cursor"');
    expect(dc).toContain('moot-agent-team-cursor');
    // NOT the claude-code/devcontainer default name
    expect(dc).not.toContain('"vscode"');
  });
});
