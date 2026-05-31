import { describe, expect, it } from 'vitest';
import {
  containerIdOrNone,
  execInContainer,
  getContainerUser,
  type ExecFn,
  type SpawnFn,
} from '../src/docker.js';

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

describe('getContainerUser — MCEU', () => {
  it('R1: returns the trimmed Config.User from docker inspect', () => {
    const calls: Array<{ cmd: string; args: readonly string[] }> = [];
    const spawnSyncFn: SpawnFn = (cmd, args) => {
      calls.push({ cmd, args });
      return { status: 0, stdout: 'dev\n', stderr: '' };
    };
    expect(getContainerUser('cid_abc', { spawnSyncFn })).toBe('dev');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.cmd).toBe('docker');
    expect(calls[0]!.args).toEqual([
      'inspect', '--format', '{{.Config.User}}', 'cid_abc',
    ]);
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

describe('execInContainer — MCEU user derivation', () => {
  it('R5: auto-derives the container user and passes it to docker exec --user', async () => {
    const inspectCalls: Array<readonly string[]> = [];
    const spawnSyncFn: SpawnFn = (_cmd, args) => {
      inspectCalls.push(args);
      return { status: 0, stdout: 'dev\n', stderr: '' };
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
    expect(inspectCalls).toHaveLength(1);
    expect(execArgs).toEqual(['exec', '--user', 'dev', 'cid_x', 'moot', 'status']);
  });

  it('R6: honors an explicit options.user override without consulting docker inspect', async () => {
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
      { user: 'root' },
      { spawnSyncFn, spawnAsyncFn },
    );
    expect(inspectCalled).toBe(false);
    expect(execArgs).toEqual(['exec', '--user', 'root', 'cid_x', 'whoami']);
  });
});
