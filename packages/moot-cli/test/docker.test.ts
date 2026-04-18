import { describe, expect, it } from 'vitest';
import { containerIdOrNone, type SpawnFn } from '../src/docker.js';

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
