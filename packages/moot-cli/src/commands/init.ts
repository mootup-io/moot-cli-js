import {
  mkdirSync,
  existsSync,
  writeFileSync,
  chmodSync,
  copyFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { createMootupClient, type MootupClient } from '@mootup/moot-sdk';
import { getTemplatesDir } from '@mootup/moot-templates';
import { loadCredential } from '../credential.js';

export interface InitOptions {
  force?: boolean;
  yes?: boolean;
  apiUrl?: string;
  cwd?: string;
  fetch?: typeof globalThis.fetch;
  confirm?: (prompt: string) => Promise<boolean>;
}

interface Agent {
  actor_id: string;
  display_name: string;
  actor_type?: string;
  api_key_prefix?: string | null;
}

async function defaultConfirm(prompt: string): Promise<boolean> {
  const { createInterface } = await import('node:readline/promises');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(prompt)).trim().toLowerCase();
  rl.close();
  return answer === 'y' || answer === 'yes';
}

export async function cmdInit(opts: InitOptions): Promise<void> {
  const cwd = opts.cwd ?? process.cwd();
  const force = opts.force ?? false;
  const yes = opts.yes ?? false;
  const confirm = opts.confirm ?? defaultConfirm;

  if (!existsSync(join(cwd, '.git'))) {
    console.warn(
      "Warning: this doesn't look like a git repository; " +
      '.moot/ entries will not be versioned.',
    );
  }

  const actorsPath = join(cwd, '.moot', 'actors.json');
  if (existsSync(actorsPath) && !force) {
    console.error(
      `Error: ${actorsPath} already exists.\n` +
      `Use 'mootup init --force' to rotate keys (invalidates the current set).`,
    );
    throw new Error('actors.json already exists (use --force)');
  }

  const cred = loadCredential();
  if (!cred) {
    console.error("Error: not logged in. Run 'mootup login' first.");
    throw new Error('not logged in');
  }

  const apiUrl = opts.apiUrl ?? cred.api_url;
  const token = cred.token;
  const client = createMootupClient({
    baseUrl: apiUrl,
    apiKey: token,
    ...(opts.fetch ? { fetch: opts.fetch } : {}),
  });

  console.log(`Using profile default (authenticated on ${apiUrl})`);
  const { spaceId } = await fetchActorAndSpace(client);
  const spaceName = spaceId;
  console.log(`Fetched your default space: ${spaceId}`);

  const keyless = await fetchKeylessAgents(client, force);
  if (keyless.length === 0) {
    if (force) {
      console.error('Error: no agents found in your default space to adopt.');
    } else {
      console.error(
        'Error: no keyless agents found in your default space.\n' +
        "If you've run 'mootup init' before on this space, use " +
        "'mootup init --force' to rotate the existing keys.",
      );
    }
    throw new Error('no agents to adopt');
  }

  console.log(
    `Found ${keyless.length} ${force ? 'agents' : 'keyless agents'} in default space:`,
  );
  for (const a of keyless) {
    console.log(`  - ${a.display_name.padEnd(16)} (${a.actor_id})`);
  }

  if (force && !yes) {
    const ok = await confirm(
      `This will rotate keys for ${keyless.length} agents. ` +
      `Currently-connected agents will disconnect. Continue? [y/N] `,
    );
    if (!ok) {
      console.log('Aborted.');
      return;
    }
  }

  console.log('\nRotating keys for keyless agents...');
  const adopted = await rotateKeys(client, keyless, force);

  writeActorsJson({
    cwd,
    spaceId,
    spaceName,
    apiUrl,
    adopted,
  });
  console.log(
    `Wrote .moot/actors.json        (${Object.keys(adopted).length} agents, chmod 600)`,
  );

  installDevcontainer({ cwd, overwrite: false });

  console.log("\nDone. Run 'mootup up' to bring your team online.");
}

interface ActorAndSpace {
  actor: Record<string, unknown>;
  spaceId: string;
}

async function fetchActorAndSpace(client: MootupClient): Promise<ActorAndSpace> {
  const { data, response } = await client.GET('/api/actors/me');
  if (response.status !== 200) {
    throw new Error(
      `Could not fetch your account (${response.status}). ` +
      `Your credential may have expired — run 'mootup login' again.`,
    );
  }
  const actor = data as Record<string, unknown> | undefined;
  const spaceId = actor?.default_space_id;
  if (typeof spaceId !== 'string') {
    throw new Error(
      'Your account has no default space. Contact support.',
    );
  }
  return { actor: actor ?? {}, spaceId };
}

async function fetchKeylessAgents(
  client: MootupClient,
  force: boolean,
): Promise<Agent[]> {
  const { data, response } = await client.GET('/api/actors/me/agents');
  if (response.status !== 200) {
    throw new Error(`Could not list agents (${response.status})`);
  }
  const agents = (data as unknown[] | undefined) ?? [];
  const out: Agent[] = [];
  for (const a of agents) {
    if (!a || typeof a !== 'object') continue;
    const r = a as Record<string, unknown>;
    if (
      typeof r.actor_id !== 'string' ||
      typeof r.display_name !== 'string' ||
      r.actor_type !== 'agent'
    ) continue;
    const keyed = typeof r.api_key_prefix === 'string' && r.api_key_prefix.length > 0;
    if (!force && keyed) continue;
    out.push({
      actor_id: r.actor_id,
      display_name: r.display_name,
      actor_type: 'agent',
      api_key_prefix: keyed ? (r.api_key_prefix as string) : null,
    });
  }
  return out;
}

async function rotateKeys(
  client: MootupClient,
  agents: Agent[],
  force: boolean,
): Promise<Record<string, { actor_id: string; api_key: string; display_name: string }>> {
  const adopted: Record<string, { actor_id: string; api_key: string; display_name: string }> = {};
  for (const agent of agents) {
    const roleKey = agent.display_name.toLowerCase().replace(/ /g, '_');
    const { data, response } = await client.POST(
      '/api/actors/{actor_id}/rotate-key',
      {
        params: { path: { actor_id: agent.actor_id } },
        ...(force ? { headers: { 'X-Force-Rotate': 'true' } } : {}),
      },
    );
    if (response.status !== 200 && response.status !== 201) {
      throw new Error(
        `rotate-key failed for ${agent.display_name} (${response.status})`,
      );
    }
    const body = (data as Record<string, unknown> | undefined) ?? {};
    const apiKey = typeof body.api_key === 'string' ? body.api_key : '';
    adopted[roleKey] = {
      actor_id: agent.actor_id,
      api_key: apiKey,
      display_name: agent.display_name,
    };
    console.log(`  ${agent.display_name.padEnd(16)} ✓`);
  }
  return adopted;
}

function writeActorsJson(args: {
  cwd: string;
  spaceId: string;
  spaceName: string;
  apiUrl: string;
  adopted: Record<string, { actor_id: string; api_key: string; display_name: string }>;
}): void {
  const mootDir = join(args.cwd, '.moot');
  if (!existsSync(mootDir)) {
    mkdirSync(mootDir, { recursive: true, mode: 0o700 });
  } else {
    chmodSync(mootDir, 0o700);
  }
  const content = {
    space_id: args.spaceId,
    space_name: args.spaceName,
    api_url: args.apiUrl,
    actors: args.adopted,
  };
  const actorsPath = join(mootDir, 'actors.json');
  writeFileSync(actorsPath, JSON.stringify(content, null, 2) + '\n');
  chmodSync(actorsPath, 0o600);
}

function installDevcontainer(args: { cwd: string; overwrite: boolean }): void {
  const src = join(getTemplatesDir(), 'devcontainer');
  const target = join(args.cwd, '.devcontainer');
  const staged = join(args.cwd, '.moot', 'suggested-devcontainer');

  const targetExists = existsSync(target);
  if (targetExists && !args.overwrite) {
    copyDirRecursive(src, staged);
    console.log(
      `.devcontainer/ already exists — staged at .moot/suggested-devcontainer/`,
    );
    return;
  }
  copyDirRecursive(src, target);
  const fileCount = readdirSync(target).length;
  console.log(
    `Installed .devcontainer/       (${fileCount} files)`,
  );
}

function copyDirRecursive(src: string, dest: string): void {
  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true });
  }
  for (const entry of readdirSync(src)) {
    const s = join(src, entry);
    const d = join(dest, entry);
    const stats = statSync(s);
    if (stats.isDirectory()) {
      copyDirRecursive(s, d);
    } else {
      copyFileSync(s, d);
      if (entry.endsWith('.sh')) {
        chmodSync(d, 0o755);
      }
    }
  }
}
