import { loadCredential } from '../credential.js';
import {
  loadRefreshToken,
  storeOAuthCredential,
  type OAuthCredentialBundle,
} from '../auth/credentials.js';
import { refreshAccessToken } from '../auth/oauth.js';
import { validateProfile } from '../auth/profile.js';

export interface RefreshOptions {
  profile?: string;
  fetch?: typeof globalThis.fetch;
}

export async function cmdRefresh(opts: RefreshOptions): Promise<void> {
  const profile = opts.profile ?? 'default';
  validateProfile(profile);
  const cred = loadCredential(profile);
  if (!cred) {
    console.error(`Error: no credential for profile '${profile}'. Run 'mootup init' first.`);
    throw new Error(`no credential for profile '${profile}'`);
  }
  if (cred.credential_type !== 'oauth') {
    console.error(
      `Error: profile '${profile}' uses a personal access token; refresh not applicable.`,
    );
    throw new Error('profile is not OAuth');
  }

  const refreshToken = await loadRefreshToken(profile);
  if (!refreshToken) {
    console.error(
      `Error: no refresh token available for profile '${profile}'. Run 'mootup init' again.`,
    );
    throw new Error('no refresh token');
  }

  let result;
  try {
    result = await refreshAccessToken({
      apiUrl: cred.api_url,
      refreshToken,
      ...(opts.fetch ? { fetchImpl: opts.fetch } : {}),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('invalid_grant') || msg.includes('(400') || msg.includes('(401')) {
      console.error(
        `Installation ${cred.installation_id ?? ''} has been revoked. ` +
        `Run 'mootup init --profile ${profile}' to reinstall, ` +
        `or 'mootup logout --profile ${profile}' to clean up local state.`,
      );
      throw new Error('refresh rejected (revoked)');
    }
    throw err;
  }

  const bundle: OAuthCredentialBundle = {
    api_url: cred.api_url,
    user_id: cred.user_id,
    access_token: result.access_token,
    refresh_token: result.refresh_token,
    access_token_expires_at: result.access_token_expires_at,
  };
  if (cred.installation_id !== undefined) bundle.installation_id = cred.installation_id;
  await storeOAuthCredential(profile, bundle);

  const expiresAt = new Date(result.access_token_expires_at * 1000).toISOString();
  console.log(`Refreshed. Access token valid until ${expiresAt}.`);
}
