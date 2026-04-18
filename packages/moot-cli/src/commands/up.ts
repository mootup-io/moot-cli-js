import {
  containerIdOrNone,
  devcontainerUp,
  execInContainer,
  type DockerDeps,
} from '../docker.js';

export interface UpOptions {
  cwd?: string;
  docker?: DockerDeps;
}

export async function cmdUp(opts: UpOptions): Promise<void> {
  const cwd = opts.cwd ?? process.cwd();
  const docker = opts.docker ?? {};
  let cid = containerIdOrNone(cwd, docker);
  if (!cid) {
    cid = await devcontainerUp(cwd, docker);
  }
  const code = await execInContainer(cid, ['moot', 'up'], {}, docker);
  if (code !== 0) {
    throw new Error(`moot up failed (exit code ${code})`);
  }
}
