import { createInterface } from 'node:readline/promises';
import { createMootupClient } from '@mootup/moot-sdk';
import {
  storeCredential,
  PAT_PREFIX,
  DEFAULT_API_URL,
} from '../credential.js';

export interface LoginOptions {
  token?: string;
  apiUrl?: string;
  profile?: string;
  fetch?: typeof globalThis.fetch;
  readToken?: () => Promise<string>;
}

async function defaultReadToken(): Promise<string> {
  console.log(
    'Create a personal access token at https://mootup.io/settings/api-keys',
  );
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const answer = await rl.question('Paste your token: ');
  rl.close();
  return answer.trim();
}

export async function cmdLogin(opts: LoginOptions): Promise<void> {
  const apiUrl = opts.apiUrl ?? DEFAULT_API_URL;
  const token = opts.token ?? (await (opts.readToken ?? defaultReadToken)());

  if (!token.startsWith(PAT_PREFIX)) {
    console.error(
      "That doesn't look like a Moot personal access token.\n" +
      "Tokens start with 'mootup_pat_' — did you paste an agent " +
      "API key (convo_key_...) by mistake?",
    );
    throw new Error('invalid PAT prefix');
  }

  const client = createMootupClient({
    baseUrl: apiUrl,
    apiKey: token,
    ...(opts.fetch ? { fetch: opts.fetch } : {}),
  });
  const { data, response } = await client.GET('/api/actors/me');
  if (response.status !== 200) {
    console.error(`Error: authentication failed (${response.status})`);
    throw new Error(`authentication failed (${response.status})`);
  }
  const actor = data as { actor_id?: string; display_name?: string } | undefined;
  if (!actor || typeof actor.actor_id !== 'string' || typeof actor.display_name !== 'string') {
    throw new Error('unexpected /api/actors/me response shape');
  }

  storeCredential(
    {
      api_url: apiUrl,
      token,
      user_id: actor.actor_id,
      credential_type: 'static_token',
    },
    opts.profile ?? 'default',
  );
  console.log(
    `Authenticated as ${actor.display_name} (${actor.actor_id}) on ${apiUrl}`,
  );
}
