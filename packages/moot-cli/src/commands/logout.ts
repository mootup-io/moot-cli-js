import { loadCredential } from '../credential.js';
import { loadRefreshToken, deleteOAuthCredential } from '../auth/credentials.js';
import { revokeRefreshToken } from '../auth/oauth.js';

export interface LogoutOptions {
  profile?: string;
  all?: boolean;
  fetch?: typeof globalThis.fetch;
}

export async function cmdLogout(opts: LogoutOptions): Promise<void> {
  const profile = opts.profile ?? 'default';
  const cred = loadCredential(profile);
  if (!cred) {
    console.error(`Error: no credential for profile '${profile}'.`);
    throw new Error(`no credential for profile '${profile}'`);
  }

  const installationId = cred.installation_id;

  if (cred.credential_type === 'oauth') {
    const refreshToken = await loadRefreshToken(profile);
    if (refreshToken) {
      try {
        await revokeRefreshToken({
          apiUrl: cred.api_url,
          refreshToken,
          ...(opts.fetch ? { fetchImpl: opts.fetch } : {}),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`warning: revoke failed (${msg}); clearing local state anyway.`);
      }
    }
    await deleteOAuthCredential(profile);
  } else {
    const { deleteCredential } = await import('../credential.js');
    deleteCredential(profile);
  }

  if (installationId) {
    console.log(`Logged out; cascade-revoked ${installationId}`);
  } else {
    console.log(`Logged out profile '${profile}'.`);
  }
}
