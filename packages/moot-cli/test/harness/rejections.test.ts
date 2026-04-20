import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { rmSync } from 'node:fs';
import {
  makeFakeEnv,
  writeOAuthCredential,
  seedKeytar,
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

describe('harness rejection paths (R5–R8)', () => {
  it('R5 — unknown harness exits non-zero with known-list message', async () => {
    writeOAuthCredential(env.fakeHome);
    const credsMod = await import('../../src/auth/credentials.js');
    const unpin = seedKeytar(credsMod);
    const { cmdInit } = await import('../../src/index.js');
    try {
      await expect(
        cmdInit({
          cwd: env.fakeCwd,
          apiUrl: 'http://convo.test',
          harness: 'foo',
        }),
      ).rejects.toThrow(/Known: claude-code, cursor-agent, cursor-ide, sdk/);
    } finally {
      unpin();
    }
  });

  it('R6 — bare "cursor" rejected with helpful hint', async () => {
    writeOAuthCredential(env.fakeHome);
    const credsMod = await import('../../src/auth/credentials.js');
    const unpin = seedKeytar(credsMod);
    const { cmdInit } = await import('../../src/index.js');
    try {
      await expect(
        cmdInit({
          cwd: env.fakeCwd,
          apiUrl: 'http://convo.test',
          harness: 'cursor',
        }),
      ).rejects.toThrow(/cursor-ide.*cursor-agent|cursor-agent.*cursor-ide/);
    } finally {
      unpin();
    }
  });

  it('R7 — cursor-ide rejects --archetype at flag-parse', async () => {
    writeOAuthCredential(env.fakeHome);
    const credsMod = await import('../../src/auth/credentials.js');
    const unpin = seedKeytar(credsMod);
    const { cmdInit } = await import('../../src/index.js');
    try {
      await expect(
        cmdInit({
          cwd: env.fakeCwd,
          apiUrl: 'http://convo.test',
          harness: 'cursor-ide',
          archetype: 'mootup/loop-4',
        }),
      ).rejects.toThrow(/incompatible.*host-side-solo/);
    } finally {
      unpin();
    }
  });

  it('R8 — sdk rejects --archetype at flag-parse', async () => {
    writeOAuthCredential(env.fakeHome);
    const credsMod = await import('../../src/auth/credentials.js');
    const unpin = seedKeytar(credsMod);
    const { cmdInit } = await import('../../src/index.js');
    try {
      await expect(
        cmdInit({
          cwd: env.fakeCwd,
          apiUrl: 'http://convo.test',
          harness: 'sdk',
          archetype: 'mootup/loop-4',
        }),
      ).rejects.toThrow(/incompatible.*host-side-solo/);
    } finally {
      unpin();
    }
  });
});
