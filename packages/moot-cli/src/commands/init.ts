import {
  mkdirSync,
  existsSync,
  writeFileSync,
  chmodSync,
  copyFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';
import { createMootupClient, type MootupClient } from '@mootup/moot-sdk';
import { getTemplatesDir } from '@mootup/moot-templates';
import { loadCredential, type Credential } from '../credential.js';
import {
  storeOAuthCredential,
  loadRefreshToken,
  type OAuthCredentialBundle,
} from '../auth/credentials.js';
import {
  runBrowserFlow,
  refreshAccessToken,
  generateIdempotencyKey,
  shouldUseBrowser,
} from '../auth/oauth.js';
import {
  ARCHETYPE_CATALOG,
  DEFAULT_ARCHETYPE,
  findArchetype,
  promptArchetype,
  type ArchetypeEntry,
} from '../auth/archetypes.js';

const PROFILE_RE = /^[a-z0-9_-]+$/;

export interface InitOptions {
  force?: boolean;
  yes?: boolean;
  apiUrl?: string;
  cwd?: string;
  profile?: string;
  archetype?: string;
  fetch?: typeof globalThis.fetch;
  openBrowser?: (url: string) => Promise<void>;
  waitForCallback?: (expectedState: string) => Promise<string>;
  confirm?: (prompt: string) => Promise<boolean>;
  promptArchetype?: (q: string) => Promise<string>;
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
  const profile = opts.profile ?? 'default';
  if (!PROFILE_RE.test(profile)) {
    throw new Error(`invalid profile name '${profile}' (must match ${PROFILE_RE})`);
  }

  if (!existsSync(join(cwd, '.git'))) {
    console.warn(
      "Warning: this doesn't look like a git repository; " +
      '.moot/ entries will not be versioned.',
    );
  }

  const existing = loadCredential(profile);

  const isOAuth = existing?.credential_type === 'oauth' || Boolean(existing?.refresh_token_ref);
  const isStaticToken = Boolean(existing) && !isOAuth;

  if (!existing) {
    await runOAuthFlowAndStore(profile, opts);
  } else if (isOAuth) {
    await maybeRefreshAccessToken(profile, existing!, opts);
  }

  const credAfter = loadCredential(profile);
  if (!credAfter) {
    throw new Error('credential missing after authentication');
  }

  const apiUrl = opts.apiUrl ?? credAfter.api_url;

  if (isStaticToken && !opts.archetype) {
    await legacyKeylessFlow({
      cwd,
      credential: credAfter,
      apiUrl,
      force,
      yes,
      confirm,
      ...(opts.fetch ? { fetch: opts.fetch } : {}),
    });
    return;
  }

  const archetype = await resolveArchetype(opts);

  const actorsPath = join(cwd, '.moot', 'actors.json');
  if (existsSync(actorsPath) && !force) {
    console.error(
      `Error: ${actorsPath} already exists.\n` +
      `Use 'mootup init --force' to rotate keys (invalidates the current set).`,
    );
    throw new Error('actors.json already exists (use --force)');
  }

  const fetchImpl = opts.fetch ?? globalThis.fetch;
  const idempotencyKey = generateIdempotencyKey();

  console.log(`Using profile '${profile}' (authenticated on ${apiUrl})`);
  console.log(`Installing archetype ${archetype.id}@${archetype.version}...`);

  const res = await fetchImpl(`${apiUrl}/api/teams/install`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${credAfter.token}`,
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({
      archetype_id: archetype.id,
      archetype_version: archetype.version,
    }),
  });

  if (res.status === 401) {
    const body = await res.text();
    if (body.includes('revoked_installation')) {
      console.error(
        `Installation ${credAfter.installation_id ?? ''} has been revoked. ` +
        `Run 'mootup init --profile ${profile}' again to reinstall.`,
      );
    } else {
      console.error('Authorization failed. Run `mootup init` again to re-authenticate.');
    }
    throw new Error(`install failed (${res.status})`);
  }
  if (res.status !== 200 && res.status !== 201) {
    const body = await res.text();
    throw new Error(`/api/teams/install failed (${res.status}): ${body}`);
  }

  const installResp = (await res.json()) as {
    installation_id: string;
    team_id: string;
    space_id: string;
    space_name?: string;
    actors: Record<string, { actor_id: string; api_key: string; display_name: string }>;
  };

  if (installResp.installation_id) {
    const updated: Credential = { ...credAfter, installation_id: installResp.installation_id };
    const { storeCredential } = await import('../credential.js');
    storeCredential(updated, profile);
  }

  writeActorsJson({
    cwd,
    spaceId: installResp.space_id,
    spaceName: installResp.space_name ?? installResp.space_id,
    apiUrl,
    adopted: installResp.actors,
  });
  console.log(
    `Wrote .moot/actors.json        (${Object.keys(installResp.actors).length} agents, chmod 600)`,
  );

  installDevcontainer({ cwd, overwrite: false });

  console.log("\nDone. Run 'mootup up' to bring your team online.");
}

async function runOAuthFlowAndStore(profile: string, opts: InitOptions): Promise<void> {
  if (!shouldUseBrowser()) {
    throw new Error(
      'Headless environment detected (no DISPLAY/WAYLAND_DISPLAY); browser OAuth flow unavailable. ' +
      "Install on a host with browser access, or use 'mootup login --token <PAT>' to fall back to a personal access token.",
    );
  }
  const apiUrl = opts.apiUrl ?? 'https://mootup.io';
  const flow = await runBrowserFlow({
    apiUrl,
    ...(opts.fetch ? { fetchImpl: opts.fetch } : {}),
    ...(opts.openBrowser ? { openImpl: opts.openBrowser } : {}),
    ...(opts.waitForCallback ? { waitForCallbackImpl: opts.waitForCallback } : {}),
  });
  const userId = await fetchUserId(apiUrl, flow.access_token, opts.fetch);
  const bundle: OAuthCredentialBundle = {
    api_url: apiUrl,
    user_id: userId,
    access_token: flow.access_token,
    refresh_token: flow.refresh_token,
    access_token_expires_at: flow.access_token_expires_at,
  };
  await storeOAuthCredential(profile, bundle);
}

async function maybeRefreshAccessToken(
  profile: string,
  cred: Credential,
  opts: InitOptions,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = cred.access_token_expires_at ?? 0;
  if (expiresAt > now + 60) return;
  const refreshToken = await loadRefreshToken(profile);
  if (!refreshToken) return;
  const result = await refreshAccessToken({
    apiUrl: cred.api_url,
    refreshToken,
    ...(opts.fetch ? { fetchImpl: opts.fetch } : {}),
  });
  const bundle: OAuthCredentialBundle = {
    api_url: cred.api_url,
    user_id: cred.user_id,
    access_token: result.access_token,
    refresh_token: result.refresh_token,
    access_token_expires_at: result.access_token_expires_at,
  };
  if (cred.installation_id !== undefined) bundle.installation_id = cred.installation_id;
  await storeOAuthCredential(profile, bundle);
}

async function fetchUserId(
  apiUrl: string,
  token: string,
  fetchOverride?: typeof globalThis.fetch,
): Promise<string> {
  const fetchImpl = fetchOverride ?? globalThis.fetch;
  const res = await fetchImpl(`${apiUrl}/api/actors/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status !== 200) {
    throw new Error(`/api/actors/me lookup failed (${res.status})`);
  }
  const body = (await res.json()) as { actor_id?: string };
  if (!body.actor_id) throw new Error('/api/actors/me missing actor_id');
  return body.actor_id;
}

async function resolveArchetype(opts: InitOptions): Promise<ArchetypeEntry> {
  if (opts.archetype) {
    const found = findArchetype(opts.archetype);
    if (!found) {
      const ids = ARCHETYPE_CATALOG.map((a) => a.id).join(', ');
      throw new Error(`Unknown archetype '${opts.archetype}'. Known: ${ids}`);
    }
    return found;
  }
  if (opts.yes) return findArchetype(DEFAULT_ARCHETYPE)!;
  return promptArchetype(opts.promptArchetype);
}

interface LegacyArgs {
  cwd: string;
  credential: Credential;
  apiUrl: string;
  force: boolean;
  yes: boolean;
  confirm: (prompt: string) => Promise<boolean>;
  fetch?: typeof globalThis.fetch;
}

async function legacyKeylessFlow(args: LegacyArgs): Promise<void> {
  const { cwd, credential, apiUrl, force, yes, confirm } = args;
  const actorsPath = join(cwd, '.moot', 'actors.json');
  if (existsSync(actorsPath) && !force) {
    console.error(
      `Error: ${actorsPath} already exists.\n` +
      `Use 'mootup init --force' to rotate keys (invalidates the current set).`,
    );
    throw new Error('actors.json already exists (use --force)');
  }

  const token = credential.token;
  const client = createMootupClient({
    baseUrl: apiUrl,
    apiKey: token,
    ...(args.fetch ? { fetch: args.fetch } : {}),
  });

  console.log(`Using profile default (authenticated on ${apiUrl})`);
  const { spaceId } = await fetchActorAndSpace(client);
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
    spaceName: spaceId,
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
