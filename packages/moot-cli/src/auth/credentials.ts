import {
  loadCredential,
  storeCredential,
  deleteCredential,
  type Credential,
} from '../credential.js';

export const KEYTAR_SERVICE = 'mootup-cli';

export interface OAuthCredentialBundle {
  api_url: string;
  user_id: string;
  access_token: string;
  refresh_token: string;
  access_token_expires_at: number;
  installation_id?: string;
}

const sessionRefreshTokenMemory = new Map<string, string>();

type KeytarLike = {
  setPassword: (service: string, account: string, password: string) => Promise<void>;
  getPassword: (service: string, account: string) => Promise<string | null>;
  deletePassword: (service: string, account: string) => Promise<boolean>;
};

let keytarOverride: KeytarLike | null = null;

export function __setKeytarForTest(k: KeytarLike | null): void {
  keytarOverride = k;
}

async function loadKeytar(): Promise<KeytarLike | null> {
  if (keytarOverride) return keytarOverride;
  try {
    // keytar is an optionalDependency; dynamic import keeps it optional at build time.
    const modName = 'keytar';
    const mod = (await import(/* @vite-ignore */ modName)) as unknown as {
      default?: KeytarLike;
    } & KeytarLike;
    return mod.default ?? mod;
  } catch {
    return null;
  }
}

function keychainRef(profile: string): string {
  return `${KEYTAR_SERVICE}:${profile}:refresh`;
}

export async function storeOAuthCredential(
  profile: string,
  creds: OAuthCredentialBundle,
): Promise<void> {
  const keytar = await loadKeytar();
  let refresh_token_ref: string | undefined;

  if (keytar) {
    const ref = keychainRef(profile);
    try {
      await keytar.setPassword(KEYTAR_SERVICE, ref, creds.refresh_token);
      refresh_token_ref = ref;
    } catch (err) {
      printKeychainFallback(err);
      sessionRefreshTokenMemory.set(profile, creds.refresh_token);
      refresh_token_ref = undefined;
    }
  } else {
    printKeychainFallback(new Error('keytar module not installed'));
    sessionRefreshTokenMemory.set(profile, creds.refresh_token);
  }

  const cred: Credential = {
    api_url: creds.api_url,
    token: creds.access_token,
    user_id: creds.user_id,
    credential_type: 'oauth',
    access_token_expires_at: creds.access_token_expires_at,
  };
  if (refresh_token_ref !== undefined) cred.refresh_token_ref = refresh_token_ref;
  if (creds.installation_id !== undefined) cred.installation_id = creds.installation_id;

  storeCredential(cred, profile);
}

function printKeychainFallback(err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  const filePath = `${process.env.HOME ?? '~'}/.mootup/credentials.json`;
  console.error(
    `note: keychain unavailable (${msg}); refresh-token lives in memory ` +
    `for this session only. Re-authenticate on next session. ` +
    `(using file-based storage at ${filePath} for non-secret fields only)`,
  );
}

export async function loadRefreshToken(profile: string): Promise<string | null> {
  const cred = loadCredential(profile);
  if (!cred || cred.credential_type !== 'oauth' || !cred.refresh_token_ref) {
    return sessionRefreshTokenMemory.get(profile) ?? null;
  }
  const keytar = await loadKeytar();
  if (!keytar) return sessionRefreshTokenMemory.get(profile) ?? null;
  try {
    return await keytar.getPassword(KEYTAR_SERVICE, cred.refresh_token_ref);
  } catch {
    return null;
  }
}

export async function deleteOAuthCredential(profile: string): Promise<void> {
  const cred = loadCredential(profile);
  if (cred?.refresh_token_ref) {
    const keytar = await loadKeytar();
    if (keytar) {
      try {
        await keytar.deletePassword(KEYTAR_SERVICE, cred.refresh_token_ref);
      } catch {
        // best-effort
      }
    }
  }
  sessionRefreshTokenMemory.delete(profile);
  deleteCredential(profile);
}

export function __clearSessionMemoryForTest(): void {
  sessionRefreshTokenMemory.clear();
}
