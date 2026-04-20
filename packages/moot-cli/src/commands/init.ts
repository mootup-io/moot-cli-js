import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createMootupClient, type MootupClient } from '@mootup/moot-sdk';
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
import { PROFILE_RE, validateProfile } from '../auth/profile.js';
import {
  classifyHarness,
  DEFAULT_HARNESS,
  validateFlagMatrix,
  type HarnessEntry,
} from '../harness/index.js';
import {
  generateClaudeCode,
  writeActorsJson,
  installDevcontainer,
  type InstallResponse,
} from '../harness/claude-code.js';
import { generateCursorAgent } from '../harness/cursor-agent.js';
import { generateCursorIde } from '../harness/cursor-ide.js';
import { generateSdk } from '../harness/sdk.js';

export interface InitOptions {
  force?: boolean;
  yes?: boolean;
  apiUrl?: string;
  cwd?: string;
  profile?: string;
  archetype?: string;
  harness?: string;
  showToken?: boolean;
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
  validateProfile(profile);

  const harnessName = opts.harness ?? DEFAULT_HARNESS;
  const harness = classifyHarness(harnessName);
  validateFlagMatrix(harness, opts.archetype ? { archetype: opts.archetype } : {});

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

  // Legacy keyless flow: pre-OAuth static-token credential on default (claude-code) devcontainer-team path.
  if (isStaticToken && !opts.archetype && harness.name === 'claude-code') {
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

  if (harness.topology === 'devcontainer-team') {
    await devcontainerTeamFlow({
      cwd,
      harness,
      credential: credAfter,
      apiUrl,
      profile,
      force,
      yes,
      confirm,
      ...(opts.fetch ? { fetch: opts.fetch } : {}),
      ...(opts.promptArchetype ? { promptArchetype: opts.promptArchetype } : {}),
      ...(opts.archetype ? { archetype: opts.archetype } : {}),
    });
  } else {
    await hostSideSoloFlow({
      cwd,
      harness,
      credential: credAfter,
      apiUrl,
      profile,
      force,
      yes,
      confirm,
      showToken: opts.showToken ?? false,
      ...(opts.fetch ? { fetch: opts.fetch } : {}),
    });
  }
}

interface DevcontainerTeamArgs {
  cwd: string;
  harness: HarnessEntry;
  credential: Credential;
  apiUrl: string;
  profile: string;
  force: boolean;
  yes: boolean;
  confirm: (prompt: string) => Promise<boolean>;
  fetch?: typeof globalThis.fetch;
  promptArchetype?: (q: string) => Promise<string>;
  archetype?: string;
}

async function devcontainerTeamFlow(args: DevcontainerTeamArgs): Promise<void> {
  const archetype = await resolveArchetype({
    ...(args.archetype !== undefined ? { archetype: args.archetype } : {}),
    yes: args.yes,
    ...(args.promptArchetype ? { promptArchetype: args.promptArchetype } : {}),
  });

  const actorsPath = join(args.cwd, '.moot', 'actors.json');
  if (existsSync(actorsPath) && !args.force) {
    console.error(
      `Error: ${actorsPath} already exists.\n` +
      `Use 'mootup init --force' to rotate keys (invalidates the current set).`,
    );
    throw new Error('actors.json already exists (use --force)');
  }

  const fetchImpl = args.fetch ?? globalThis.fetch;
  const idempotencyKey = generateIdempotencyKey();

  console.log(`Using profile '${args.profile}' (authenticated on ${args.apiUrl})`);
  console.log(`Installing archetype ${archetype.id}@${archetype.version}...`);

  const res = await fetchImpl(`${args.apiUrl}/api/teams/install`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${args.credential.token}`,
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
        `Installation ${args.credential.installation_id ?? ''} has been revoked. ` +
        `Run 'mootup init --profile ${args.profile}' again to reinstall.`,
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

  const installResp = (await res.json()) as InstallResponse;

  if (installResp.installation_id) {
    const updated: Credential = {
      ...args.credential,
      installation_id: installResp.installation_id,
    };
    const { storeCredential } = await import('../credential.js');
    storeCredential(updated, args.profile);
  }

  const generatorArgs = {
    installResp,
    cwd: args.cwd,
    force: args.force,
    yes: args.yes,
    confirm: args.confirm,
    apiUrl: args.apiUrl,
  };
  if (args.harness.name === 'cursor-agent') {
    await generateCursorAgent(generatorArgs);
  } else {
    await generateClaudeCode(generatorArgs);
  }

  console.log("\nDone. Run 'mootup up' to bring your team online.");
}

interface HostSideSoloArgs {
  cwd: string;
  harness: HarnessEntry;
  credential: Credential;
  apiUrl: string;
  profile: string;
  force: boolean;
  yes: boolean;
  confirm: (prompt: string) => Promise<boolean>;
  showToken: boolean;
  fetch?: typeof globalThis.fetch;
}

async function hostSideSoloFlow(args: HostSideSoloArgs): Promise<void> {
  const fetchImpl = args.fetch ?? globalThis.fetch;
  const patName = `mootup-${args.harness.name}-${args.profile}-${Date.now()}`;
  const res = await fetchImpl(`${args.apiUrl}/api/personal-access-tokens`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${args.credential.token}`,
    },
    body: JSON.stringify({ name: patName }),
  });
  if (res.status !== 200 && res.status !== 201) {
    const body = await res.text();
    throw new Error(`PAT mint failed (${res.status}): ${body}`);
  }
  const patResp = (await res.json()) as { token: string; pat_id?: string };

  if (args.harness.name === 'cursor-ide') {
    await generateCursorIde({
      token: patResp.token,
      apiUrl: args.apiUrl,
      cwd: args.cwd,
      force: args.force,
      yes: args.yes,
      confirm: args.confirm,
    });
  } else {
    await generateSdk({
      token: patResp.token,
      apiUrl: args.apiUrl,
      showToken: args.showToken,
    });
  }

  console.log(`PAT minted (prefix: ${patResp.token.slice(0, 12)}…).`);
  console.log(
    `Revoke at ${args.apiUrl}/settings/access if compromised or no longer needed.`,
  );
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

interface ResolveArchetypeOpts {
  archetype?: string;
  yes?: boolean;
  promptArchetype?: (q: string) => Promise<string>;
}

async function resolveArchetype(opts: ResolveArchetypeOpts): Promise<ArchetypeEntry> {
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

  installDevcontainer({ cwd, templateName: 'devcontainer', overwrite: false });

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

// Inv 10: keep PROFILE_RE referenced in this module for grep-backed tests.
void PROFILE_RE;
