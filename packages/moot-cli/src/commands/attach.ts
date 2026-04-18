import {
  requireContainerId,
  execInContainer,
  type DockerDeps,
} from '../docker.js';

export interface AttachOptions {
  role: string;
  cwd?: string;
  docker?: DockerDeps;
}

export async function cmdAttach(opts: AttachOptions): Promise<void> {
  const cwd = opts.cwd ?? process.cwd();
  const docker = opts.docker ?? {};
  const cid = requireContainerId(cwd, docker);
  await execInContainer(
    cid,
    ['moot', 'attach', opts.role],
    { interactive: true },
    docker,
  );
}
