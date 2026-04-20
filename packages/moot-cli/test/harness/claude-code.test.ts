import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  makeFakeEnv,
  writeOAuthCredential,
  seedKeytar,
  makeInstallFetch,
  INSTALL_RESP,
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

describe('harness=claude-code (R1, R9)', () => {
  it('R1 — devcontainer-team happy path writes .devcontainer/, .moot/actors.json', async () => {
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
        harness: 'claude-code',
      });
    } finally {
      unpin();
    }

    const installCall = calls.find((c) => c.url.endsWith('/api/teams/install'));
    expect(installCall).toBeDefined();
    expect(installCall!.headers.get('Authorization')).toBe('Bearer acc_tok');
    expect(calls.some((c) => c.url.endsWith('/api/personal-access-tokens'))).toBe(false);

    const actorsPath = join(env.fakeCwd, '.moot', 'actors.json');
    expect(existsSync(actorsPath)).toBe(true);
    const actors = JSON.parse(readFileSync(actorsPath, 'utf8'));
    expect(actors.space_id).toBe(INSTALL_RESP.space_id);
    expect(actors.actors.leader.api_key).toBe('convo_key_1');
    expect(statSync(actorsPath).mode & 0o777).toBe(0o600);

    expect(existsSync(join(env.fakeCwd, '.devcontainer', 'devcontainer.json'))).toBe(true);
  });

  it('R9 — default (no --harness) output byte-identical to explicit claude-code', async () => {
    // Run 1: no --harness
    writeOAuthCredential(env.fakeHome);
    let credsMod = await import('../../src/auth/credentials.js');
    let unpin = seedKeytar(credsMod);
    const f1 = makeInstallFetch();
    const { cmdInit: cmdInit1 } = await import('../../src/index.js');
    try {
      await cmdInit1({
        cwd: env.fakeCwd,
        apiUrl: 'http://convo.test',
        fetch: f1.fetch,
        archetype: 'mootup/loop-4',
      });
    } finally {
      unpin();
    }
    const actors1 = readFileSync(join(env.fakeCwd, '.moot', 'actors.json'), 'utf8');
    const dc1 = readFileSync(
      join(env.fakeCwd, '.devcontainer', 'devcontainer.json'),
      'utf8',
    );

    // Fresh cwd for run 2 (reuse fakeHome so credential is still present)
    rmSync(env.fakeCwd, { recursive: true, force: true });
    const env2 = makeFakeEnv();
    try {
      // env2 pointed HOME somewhere else; restore fakeHome + credential
      env2.cleanup();
      process.env.HOME = env.fakeHome;
      vi.resetModules();
      credsMod = await import('../../src/auth/credentials.js');
      unpin = seedKeytar(credsMod);
      const f2 = makeInstallFetch();
      const { cmdInit: cmdInit2 } = await import('../../src/index.js');
      try {
        await cmdInit2({
          cwd: env2.fakeCwd,
          apiUrl: 'http://convo.test',
          fetch: f2.fetch,
          archetype: 'mootup/loop-4',
          harness: 'claude-code',
        });
      } finally {
        unpin();
      }
      const actors2 = readFileSync(join(env2.fakeCwd, '.moot', 'actors.json'), 'utf8');
      const dc2 = readFileSync(
        join(env2.fakeCwd, '.devcontainer', 'devcontainer.json'),
        'utf8',
      );
      expect(actors2).toBe(actors1);
      expect(dc2).toBe(dc1);
    } finally {
      rmSync(env2.fakeCwd, { recursive: true, force: true });
      rmSync(env2.fakeHome, { recursive: true, force: true });
      env.fakeCwd = makeFakeEnv().fakeCwd;
    }
  });
});
