import { describe, expect, it, vi } from 'vitest';
import type { SpawnFn, ExecFn } from '../src/docker.js';
import {
  cmdUp,
  cmdDown,
  cmdStatus,
  cmdAttach,
  cmdCompact,
} from '../src/index.js';

function makeDeps(cidStdout = 'cid_abc\n') {
  const spawnCalls: Array<{ cmd: string; args: readonly string[] }> = [];
  const asyncCalls: Array<{ cmd: string; args: readonly string[] }> = [];
  const spawnSyncFn: SpawnFn = (cmd, args) => {
    spawnCalls.push({ cmd, args });
    if (cmd === 'docker' && args[0] === 'ps') {
      return { status: 0, stdout: cidStdout, stderr: '' };
    }
    return { status: 0, stdout: '', stderr: '' };
  };
  const spawnAsyncFn: ExecFn = async (cmd, args) => {
    asyncCalls.push({ cmd, args });
    return 0;
  };
  return { spawnSyncFn, spawnAsyncFn, spawnCalls, asyncCalls };
}

// T8: D-TEST-FAN-OUT-ANCHOR — 5 delegated commands each call docker exec
// with a matching argv tail. Anchor file rule: every row uses the same shape
// so a drift (e.g. unexpected --user flag change) pops on a single row.
describe('delegated commands (docker exec wrappers) — T8', () => {
  interface CmdCase {
    name: string;
    run: (deps: ReturnType<typeof makeDeps>) => Promise<void>;
    expectedTail: readonly string[];
    interactive: boolean;
  }
  const COMMANDS: readonly CmdCase[] = [
    {
      name: 'down',
      run: async ({ spawnSyncFn, spawnAsyncFn }) =>
        cmdDown({ cwd: '/tmp/ws', docker: { spawnSyncFn, spawnAsyncFn } }),
      expectedTail: ['cid_abc', 'moot', 'down'],
      interactive: false,
    },
    {
      name: 'status',
      run: async ({ spawnSyncFn, spawnAsyncFn }) =>
        cmdStatus({ cwd: '/tmp/ws', docker: { spawnSyncFn, spawnAsyncFn } }),
      expectedTail: ['cid_abc', 'moot', 'status'],
      interactive: false,
    },
    {
      name: 'attach',
      run: async ({ spawnSyncFn, spawnAsyncFn }) =>
        cmdAttach({
          role: 'leader',
          cwd: '/tmp/ws',
          docker: { spawnSyncFn, spawnAsyncFn },
        }),
      expectedTail: ['cid_abc', 'moot', 'attach', 'leader'],
      interactive: true,
    },
    {
      name: 'compact',
      run: async ({ spawnSyncFn, spawnAsyncFn }) =>
        cmdCompact({
          role: 'spec',
          cwd: '/tmp/ws',
          docker: { spawnSyncFn, spawnAsyncFn },
        }),
      expectedTail: ['cid_abc', 'moot', 'compact', 'spec'],
      interactive: false,
    },
    {
      name: 'up (post-container-exists)',
      run: async ({ spawnSyncFn, spawnAsyncFn }) =>
        cmdUp({ cwd: '/tmp/ws', docker: { spawnSyncFn, spawnAsyncFn } }),
      expectedTail: ['cid_abc', 'moot', 'up'],
      interactive: false,
    },
  ];

  it.each(COMMANDS)(
    '$name issues docker exec with expected tail',
    async (c) => {
      const deps = makeDeps('cid_abc\n');
      await c.run(deps);
      // Last async spawn call is the docker-exec invocation
      const last = deps.asyncCalls[deps.asyncCalls.length - 1];
      expect(last).toBeDefined();
      expect(last!.cmd).toBe('docker');
      const args = last!.args;
      expect(args[0]).toBe('exec');
      if (c.interactive) {
        expect(args).toContain('-it');
      } else {
        expect(args).not.toContain('-it');
      }
      // Every call ends with [cid, 'moot', <cmd>, ...role?] — the expectedTail
      expect(args.slice(-c.expectedTail.length)).toEqual([...c.expectedTail]);
    },
  );
});

// T13: up's two branches
describe('cmdUp branch coverage — T13', () => {
  it('skips devcontainer up when container already running', async () => {
    const deps = makeDeps('cid_abc\n'); // container exists
    await cmdUp({ cwd: '/tmp/ws', docker: deps });
    const devcontainerCalls = deps.asyncCalls.filter((c) => c.cmd === 'devcontainer');
    expect(devcontainerCalls).toHaveLength(0);
    const dockerExecCalls = deps.asyncCalls.filter(
      (c) => c.cmd === 'docker' && c.args[0] === 'exec',
    );
    expect(dockerExecCalls).toHaveLength(1);
  });

  it('runs devcontainer up when no container is running', async () => {
    // First call to docker ps returns empty (no container); second call after
    // devcontainer up returns cid_new
    const spawnCalls: Array<{ cmd: string; args: readonly string[] }> = [];
    const asyncCalls: Array<{ cmd: string; args: readonly string[] }> = [];
    let psInvocation = 0;
    const spawnSyncFn: SpawnFn = (cmd, args) => {
      spawnCalls.push({ cmd, args });
      if (cmd === 'docker' && args[0] === 'ps') {
        psInvocation++;
        return psInvocation === 1
          ? { status: 0, stdout: '', stderr: '' }
          : { status: 0, stdout: 'cid_new\n', stderr: '' };
      }
      return { status: 0, stdout: '', stderr: '' };
    };
    const spawnAsyncFn: ExecFn = async (cmd, args) => {
      asyncCalls.push({ cmd, args });
      return 0;
    };
    await cmdUp({ cwd: '/tmp/ws', docker: { spawnSyncFn, spawnAsyncFn } });
    const devcontainerCalls = asyncCalls.filter((c) => c.cmd === 'devcontainer');
    expect(devcontainerCalls).toHaveLength(1);
    expect(devcontainerCalls[0]!.args).toEqual([
      'up', '--workspace-folder', '/tmp/ws',
    ]);
    const dockerExecCalls = asyncCalls.filter(
      (c) => c.cmd === 'docker' && c.args[0] === 'exec',
    );
    expect(dockerExecCalls).toHaveLength(1);
    expect(dockerExecCalls[0]!.args.slice(-3)).toEqual(['cid_new', 'moot', 'up']);
  });
});
