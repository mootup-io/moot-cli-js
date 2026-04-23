import { spawn, spawnSync, type SpawnOptions } from 'node:child_process';
import { resolve } from 'node:path';

export interface SpawnResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

export type SpawnFn = (
  cmd: string,
  args: readonly string[],
  options?: SpawnOptions,
) => SpawnResult;

export type ExecFn = (
  cmd: string,
  args: readonly string[],
  options?: { stdio?: 'inherit' | 'pipe'; env?: Record<string, string> },
) => Promise<number>;

export const defaultSpawnSync: SpawnFn = (cmd, args, options) => {
  const proc = spawnSync(cmd, [...args], {
    encoding: 'utf8',
    ...(options ?? {}),
  });
  return {
    status: proc.status,
    stdout: typeof proc.stdout === 'string' ? proc.stdout : '',
    stderr: typeof proc.stderr === 'string' ? proc.stderr : '',
  };
};

export const defaultSpawnAsync: ExecFn = (cmd, args, options) =>
  new Promise((resolveP, reject) => {
    const proc = spawn(cmd, [...args], {
      stdio: options?.stdio ?? 'inherit',
      env: { ...process.env, ...(options?.env ?? {}) },
    });
    proc.on('error', reject);
    proc.on('exit', (code) => resolveP(code ?? 1));
  });

export interface DockerDeps {
  spawnSyncFn?: SpawnFn;
  spawnAsyncFn?: ExecFn;
}

/**
 * Return the running container id for `workspace`, or null if not running.
 * Mirrors Python moot-cli's container_id_or_none: filters docker ps by the
 * `devcontainer.local_folder` label that @devcontainers/cli stamps on every
 * container it creates.
 */
export function containerIdOrNone(
  workspace: string,
  deps: DockerDeps = {},
): string | null {
  const spawnFn = deps.spawnSyncFn ?? defaultSpawnSync;
  const absPath = resolve(workspace);
  const result = spawnFn('docker', [
    'ps', '-q',
    '--filter', `label=devcontainer.local_folder=${absPath}`,
  ]);
  if (result.status !== 0) return null;
  const ids = result.stdout.trim().split('\n').filter(Boolean);
  return ids.length > 0 ? ids[0] ?? null : null;
}

/**
 * Run `devcontainer up --workspace-folder <workspace>`. Streams stdout/stderr
 * to the user's terminal. Returns the container id after up; throws if no
 * container is running after up exits 0.
 */
export async function devcontainerUp(
  workspace: string,
  deps: DockerDeps = {},
): Promise<string> {
  const spawnFn = deps.spawnAsyncFn ?? defaultSpawnAsync;
  const alreadyRunning = containerIdOrNone(workspace, deps) !== null;
  if (!alreadyRunning) {
    console.log(
      `Building devcontainer in ${workspace} ` +
      `(first launch can take 1-3 minutes)...`,
    );
  }
  const code = await spawnFn('devcontainer', [
    'up', '--workspace-folder', workspace,
  ]);
  if (code !== 0) {
    throw new Error(`devcontainer up failed (exit code ${code})`);
  }
  const cid = containerIdOrNone(workspace, deps);
  if (!cid) {
    throw new Error(
      `devcontainer up exited 0 but no running container was found for ${workspace}`,
    );
  }
  return cid;
}

/**
 * Run `docker exec --user node [-it] <cid> <args...>`. Streams output via
 * stdio: 'inherit'. Returns exit code. Interactive mode adds TERM + LANG
 * env vars so tmux attach works across host terminals (mirrors Python's
 * exec_interactive behavior).
 */
export async function execInContainer(
  cid: string,
  args: readonly string[],
  options: { interactive?: boolean } = {},
  deps: DockerDeps = {},
): Promise<number> {
  const spawnFn = deps.spawnAsyncFn ?? defaultSpawnAsync;
  const dockerArgs: string[] = ['exec'];
  if (options.interactive) {
    dockerArgs.push('-it');
  }
  dockerArgs.push('--user', 'node');
  if (options.interactive) {
    dockerArgs.push('-e', 'TERM=xterm-256color', '-e', 'LANG=C.UTF-8');
    const colorterm = process.env.COLORTERM;
    if (colorterm) dockerArgs.push('-e', `COLORTERM=${colorterm}`);
  }
  dockerArgs.push(cid, ...args);
  return spawnFn('docker', dockerArgs, { stdio: 'inherit' });
}

/**
 * Helper: look up cid for cwd or throw the standard "no container" error.
 * Used by every delegated command (down/status/attach/compact) and by up's
 * post-devcontainer-up re-lookup.
 */
export function requireContainerId(
  workspace: string,
  deps: DockerDeps = {},
): string {
  const cid = containerIdOrNone(workspace, deps);
  if (!cid) {
    throw new Error(
      `No running devcontainer found for ${resolve(workspace)}.\n` +
      `Run 'moot up' first.`,
    );
  }
  return cid;
}
