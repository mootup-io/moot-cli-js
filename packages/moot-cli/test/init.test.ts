import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import {
  mkdtempSync,
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { server } from './setup.js';

const ORIGINAL_HOME = process.env.HOME;
let fakeHome: string;
let fakeCwd: string;

beforeEach(() => {
  fakeHome = mkdtempSync(join(tmpdir(), 'mootup-cli-home-'));
  fakeCwd = mkdtempSync(join(tmpdir(), 'mootup-cli-cwd-'));
  mkdirSync(join(fakeCwd, '.git'));
  process.env.HOME = fakeHome;
  vi.resetModules();
});

afterEach(() => {
  process.env.HOME = ORIGINAL_HOME;
  rmSync(fakeHome, { recursive: true, force: true });
  rmSync(fakeCwd, { recursive: true, force: true });
});

function writeCredential(): void {
  mkdirSync(join(fakeHome, '.mootup'), { mode: 0o700 });
  writeFileSync(
    join(fakeHome, '.mootup', 'credentials.json'),
    JSON.stringify(
      {
        default: {
          api_url: 'http://convo.test',
          token: 'mootup_pat_abc',
          user_id: 'usr_1',
        },
      },
      null,
      2,
    ),
  );
}

describe('cmdInit', () => {
  it('errors when not logged in (T3)', async () => {
    const { cmdInit } = await import('../src/index.js');
    await expect(cmdInit({ cwd: fakeCwd })).rejects.toThrow(/not logged in/);
  });

  it('rotates keys and writes .moot/actors.json (T4)', async () => {
    writeCredential();
    server.use(
      http.get('http://convo.test/api/actors/me', () =>
        HttpResponse.json({
          actor_id: 'usr_1',
          display_name: 'Test User',
          default_space_id: 'spc_abc',
        }),
      ),
      http.get('http://convo.test/api/actors/me/agents', () =>
        HttpResponse.json([
          {
            actor_id: 'act_1',
            display_name: 'Leader',
            actor_type: 'agent',
            api_key_prefix: null,
          },
          {
            actor_id: 'act_2',
            display_name: 'Spec',
            actor_type: 'agent',
            api_key_prefix: null,
          },
        ]),
      ),
      http.post('http://convo.test/api/actors/act_1/rotate-key', () =>
        HttpResponse.json({ api_key: 'convo_key_rotated_1' }),
      ),
      http.post('http://convo.test/api/actors/act_2/rotate-key', () =>
        HttpResponse.json({ api_key: 'convo_key_rotated_2' }),
      ),
    );
    const { cmdInit } = await import('../src/index.js');
    await cmdInit({ cwd: fakeCwd });
    const actorsPath = join(fakeCwd, '.moot', 'actors.json');
    expect(existsSync(actorsPath)).toBe(true);
    const parsed = JSON.parse(readFileSync(actorsPath, 'utf8'));
    expect(parsed.space_id).toBe('spc_abc');
    expect(parsed.space_name).toBe('spc_abc');
    expect(parsed.actors.leader.api_key).toBe('convo_key_rotated_1');
    expect(parsed.actors.spec.api_key).toBe('convo_key_rotated_2');
    expect(statSync(actorsPath).mode & 0o777).toBe(0o600);
    // D-INIT-MINIMAL: .devcontainer/ installed (from templates)
    expect(existsSync(join(fakeCwd, '.devcontainer'))).toBe(true);
    expect(existsSync(join(fakeCwd, '.devcontainer', 'devcontainer.json'))).toBe(true);
  });

  it('refuses when .moot/actors.json exists without --force (T5)', async () => {
    writeCredential();
    mkdirSync(join(fakeCwd, '.moot'));
    writeFileSync(join(fakeCwd, '.moot', 'actors.json'), '{}');
    const { cmdInit } = await import('../src/index.js');
    await expect(cmdInit({ cwd: fakeCwd })).rejects.toThrow(/already exists/);
  });

  it('stages .devcontainer/ when it already exists (T6)', async () => {
    writeCredential();
    mkdirSync(join(fakeCwd, '.devcontainer'));
    writeFileSync(
      join(fakeCwd, '.devcontainer', 'devcontainer.json'),
      '{"preserved": true}',
    );
    server.use(
      http.get('http://convo.test/api/actors/me', () =>
        HttpResponse.json({
          actor_id: 'usr_1',
          display_name: 'Test User',
          default_space_id: 'spc_abc',
        }),
      ),
      http.get('http://convo.test/api/actors/me/agents', () =>
        HttpResponse.json([
          {
            actor_id: 'act_1',
            display_name: 'Leader',
            actor_type: 'agent',
            api_key_prefix: null,
          },
        ]),
      ),
      http.post('http://convo.test/api/actors/act_1/rotate-key', () =>
        HttpResponse.json({ api_key: 'convo_key_rotated_1' }),
      ),
    );
    const { cmdInit } = await import('../src/index.js');
    await cmdInit({ cwd: fakeCwd });
    // Operator's existing .devcontainer/ preserved
    const preserved = readFileSync(
      join(fakeCwd, '.devcontainer', 'devcontainer.json'),
      'utf8',
    );
    expect(preserved).toContain('preserved');
    // Staged copy under .moot/suggested-devcontainer/
    expect(
      existsSync(join(fakeCwd, '.moot', 'suggested-devcontainer', 'devcontainer.json')),
    ).toBe(true);
  });
});
