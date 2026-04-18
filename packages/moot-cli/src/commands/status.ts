import {
  requireContainerId,
  execInContainer,
  type DockerDeps,
} from '../docker.js';

export interface StatusOptions {
  cwd?: string;
  docker?: DockerDeps;
}

export async function cmdStatus(opts: StatusOptions): Promise<void> {
  const cwd = opts.cwd ?? process.cwd();
  const docker = opts.docker ?? {};
  const cid = requireContainerId(cwd, docker);
  const code = await execInContainer(cid, ['moot', 'status'], {}, docker);
  if (code !== 0) {
    throw new Error(`moot status failed (exit code ${code})`);
  }
}
