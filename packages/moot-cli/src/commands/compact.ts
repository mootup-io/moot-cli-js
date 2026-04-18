import {
  requireContainerId,
  execInContainer,
  type DockerDeps,
} from '../docker.js';

export interface CompactOptions {
  role?: string;
  cwd?: string;
  docker?: DockerDeps;
}

export async function cmdCompact(opts: CompactOptions): Promise<void> {
  const cwd = opts.cwd ?? process.cwd();
  const docker = opts.docker ?? {};
  const cid = requireContainerId(cwd, docker);
  const args = opts.role
    ? ['moot', 'compact', opts.role]
    : ['moot', 'compact'];
  const code = await execInContainer(cid, args, {}, docker);
  if (code !== 0) {
    throw new Error(`moot compact failed (exit code ${code})`);
  }
}
