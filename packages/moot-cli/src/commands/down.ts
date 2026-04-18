import {
  requireContainerId,
  execInContainer,
  type DockerDeps,
} from '../docker.js';

export interface DownOptions {
  role?: string;
  cwd?: string;
  docker?: DockerDeps;
}

export async function cmdDown(opts: DownOptions): Promise<void> {
  const cwd = opts.cwd ?? process.cwd();
  const docker = opts.docker ?? {};
  const cid = requireContainerId(cwd, docker);
  const args = opts.role ? ['moot', 'down', opts.role] : ['moot', 'down'];
  const code = await execInContainer(cid, args, {}, docker);
  if (code !== 0) {
    throw new Error(`moot down failed (exit code ${code})`);
  }
}
