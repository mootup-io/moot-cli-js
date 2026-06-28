import { describe, expect, it } from 'vitest';
import {
  containerIdOrNone,
  execInContainer,
  getContainerUser,
  getContainerWorkdir,
  remoteUserFromMetadata,
  type ExecFn,
  type SpawnFn,
} from '../src/docker.js';

/** Route a docker-inspect mock by its --format argument. */
function inspectRouter(byFormat: Record<string, string>): SpawnFn {
  return (_cmd, args) => {
    const fmtIdx = args.indexOf('--format');
    const fmt = fmtIdx >= 0 ? args[fmtIdx + 1] ?? '' : '';
    const stdout = byFormat[fmt] ?? '';
    return { status: 0, stdout, stderr: '' };
  };
}

const MOUNTS_JSON = JSON.stringify([
  { Type: 'bind', Source: '/host/proj', Destination: '/workspaces/proj' },
]);

describe('containerIdOrNone — T7', () => {
  it('returns first id from docker ps output', () => {
    const calls: Array<{ cmd: string; args: readonly string[] }> = [];
    const spawnSyncFn: SpawnFn = (cmd, args) => {
      calls.push({ cmd, args });
      return { status: 0, stdout: 'cid_abc\n', stderr: '' };
    };
    const id = containerIdOrNone('/home/user/project', { spawnSyncFn });
    expect(id).toBe('cid_abc');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.cmd).toBe('docker');
    expect(calls[0]!.args).toEqual([
      'ps', '-q',
      '--filter', 'label=devcontainer.local_folder=/home/user/project',
    ]);
  });

  it('returns null on empty stdout', () => {
    const spawnSyncFn: SpawnFn = () => ({ status: 0, stdout: '', stderr: '' });
    expect(containerIdOrNone('/home/user/project', { spawnSyncFn })).toBeNull();
  });

  it('returns null on non-zero exit', () => {
    const spawnSyncFn: SpawnFn = () => ({ status: 1, stdout: '', stderr: 'no docker' });
    expect(containerIdOrNone('/home/user/project', { spawnSyncFn })).toBeNull();
  });
});

const DC_META_NODE = JSON.stringify([{}, { remoteUser: 'node' }]);
const META_FMT = '{{index .Config.Labels "devcontainer.metadata"}}';
const USER_FMT = '{{.Config.User}}';

describe('getContainerUser — devcontainer remoteUser preference', () => {
  it('prefers the devcontainer remoteUser over Config.User (root)', () => {
    // The image USER is root, but the devcontainer runs as node — node must win
    // so agents don't create root-owned files / trip git dubious-ownership.
    const spawnSyncFn = inspectRouter({
      [META_FMT]: DC_META_NODE,
      [USER_FMT]: 'root\n',
    });
    expect(getContainerUser('cid', { spawnSyncFn })).toBe('node');
  });

  it('R1: falls back to Config.User when no remoteUser metadata', () => {
    const spawnSyncFn = inspectRouter({
      [META_FMT]: '',          // no devcontainer.metadata label
      [USER_FMT]: 'dev\n',
    });
    expect(getContainerUser('cid_abc', { spawnSyncFn })).toBe('dev');
  });

  it('R2: returns node for the moot-template default container', () => {
    const spawnSyncFn: SpawnFn = () => ({ status: 0, stdout: 'node\n', stderr: '' });
    expect(getContainerUser('cid', { spawnSyncFn })).toBe('node');
  });

  it('R3: falls back to node when Config.User is empty', () => {
    const spawnSyncFn: SpawnFn = () => ({ status: 0, stdout: '\n', stderr: '' });
    expect(getContainerUser('cid', { spawnSyncFn })).toBe('node');
  });

  it('R4: falls back to node when docker inspect fails (non-zero exit)', () => {
    const spawnSyncFn: SpawnFn = () => ({ status: 1, stdout: '', stderr: 'no such container' });
    expect(getContainerUser('cid', { spawnSyncFn })).toBe('node');
  });
});

describe('remoteUserFromMetadata', () => {
  it('returns the last fragment that sets remoteUser (merge order)', () => {
    const meta = JSON.stringify([
      { remoteUser: 'vscode' },
      {},
      { remoteUser: 'node' },
    ]);
    expect(remoteUserFromMetadata(meta)).toBe('node');
  });

  it('returns null for empty, non-array, or remoteUser-less metadata', () => {
    expect(remoteUserFromMetadata('')).toBeNull();
    expect(remoteUserFromMetadata('not json')).toBeNull();
    expect(remoteUserFromMetadata(JSON.stringify([{}, { containerUser: 'x' }]))).toBeNull();
    expect(remoteUserFromMetadata(JSON.stringify({ remoteUser: 'node' }))).toBe('node');
  });
});

describe('getContainerWorkdir — multi-provider moot up fix', () => {
  it('returns the /workspaces destination from the container mounts', () => {
    const spawnSyncFn = inspectRouter({ '{{json .Mounts}}': MOUNTS_JSON });
    expect(getContainerWorkdir('cid', { spawnSyncFn })).toBe('/workspaces/proj');
  });

  it('prefers the shortest /workspaces mount (top-level workspace)', () => {
    const mounts = JSON.stringify([
      { Destination: '/workspaces/proj/.worktrees/spec' },
      { Destination: '/workspaces/proj' },
      { Destination: '/home/node/.secrets' },
    ]);
    const spawnSyncFn = inspectRouter({ '{{json .Mounts}}': mounts });
    expect(getContainerWorkdir('cid', { spawnSyncFn })).toBe('/workspaces/proj');
  });

  it('returns null when no /workspaces mount exists', () => {
    const mounts = JSON.stringify([{ Destination: '/home/node/.secrets' }]);
    const spawnSyncFn = inspectRouter({ '{{json .Mounts}}': mounts });
    expect(getContainerWorkdir('cid', { spawnSyncFn })).toBeNull();
  });

  it('returns null on inspect failure or invalid JSON', () => {
    const failFn: SpawnFn = () => ({ status: 1, stdout: '', stderr: 'boom' });
    expect(getContainerWorkdir('cid', { spawnSyncFn: failFn })).toBeNull();
    const badJson: SpawnFn = () => ({ status: 0, stdout: 'not json', stderr: '' });
    expect(getContainerWorkdir('cid', { spawnSyncFn: badJson })).toBeNull();
  });
});

describe('execInContainer — MCEU user derivation + workdir fix', () => {
  it('R5: auto-derives user AND workdir, passing both to docker exec', async () => {
    const inspectCalls: Array<readonly string[]> = [];
    const spawnSyncFn: SpawnFn = (cmd, args) => {
      inspectCalls.push(args);
      return inspectRouter({
        '{{.Config.User}}': 'dev\n',
        '{{json .Mounts}}': MOUNTS_JSON,
      })(cmd, args);
    };
    let execArgs: readonly string[] = [];
    const spawnAsyncFn: ExecFn = (_cmd, args) => {
      execArgs = args;
      return Promise.resolve(0);
    };
    const code = await execInContainer(
      'cid_x',
      ['moot', 'status'],
      {},
      { spawnSyncFn, spawnAsyncFn },
    );
    expect(code).toBe(0);
    expect(inspectCalls).toHaveLength(3); // metadata + Config.User + Mounts
    expect(execArgs).toEqual([
      'exec', '--user', 'dev', '-w', '/workspaces/proj', 'cid_x', 'moot', 'status',
    ]);
  });

  it('R6: honors explicit user + workdir overrides without consulting docker inspect', async () => {
    let inspectCalled = false;
    const spawnSyncFn: SpawnFn = () => {
      inspectCalled = true;
      return { status: 0, stdout: 'dev\n', stderr: '' };
    };
    let execArgs: readonly string[] = [];
    const spawnAsyncFn: ExecFn = (_cmd, args) => {
      execArgs = args;
      return Promise.resolve(0);
    };
    await execInContainer(
      'cid_x',
      ['whoami'],
      { user: 'root', workdir: '/workspaces/p' },
      { spawnSyncFn, spawnAsyncFn },
    );
    expect(inspectCalled).toBe(false);
    expect(execArgs).toEqual([
      'exec', '--user', 'root', '-w', '/workspaces/p', 'cid_x', 'whoami',
    ]);
  });

  it('R7: omits -w when the workspace mount cannot be resolved', async () => {
    const spawnSyncFn = inspectRouter({
      '{{.Config.User}}': 'node\n',
      '{{json .Mounts}}': JSON.stringify([{ Destination: '/data' }]),
    });
    let execArgs: readonly string[] = [];
    const spawnAsyncFn: ExecFn = (_cmd, args) => {
      execArgs = args;
      return Promise.resolve(0);
    };
    await execInContainer('cid_x', ['moot', 'up'], {}, { spawnSyncFn, spawnAsyncFn });
    expect(execArgs).toEqual(['exec', '--user', 'node', 'cid_x', 'moot', 'up']);
  });
});
