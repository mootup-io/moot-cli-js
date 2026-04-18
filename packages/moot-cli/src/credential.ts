import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const CRED_DIR = join(homedir(), '.mootup');
export const CRED_FILE = join(CRED_DIR, 'credentials.json');
export const PAT_PREFIX = 'mootup_pat_';
export const DEFAULT_API_URL = 'https://mootup.io';

export interface Credential {
  api_url: string;
  token: string;
  user_id: string;
}

export type CredentialsFile = Record<string, Credential>;

export function loadCredential(profile = 'default'): Credential | null {
  if (!existsSync(CRED_FILE)) return null;
  const raw = readFileSync(CRED_FILE, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const cred = (parsed as Record<string, unknown>)[profile];
  if (!cred || typeof cred !== 'object') return null;
  const c = cred as Record<string, unknown>;
  if (
    typeof c.api_url !== 'string' ||
    typeof c.token !== 'string' ||
    typeof c.user_id !== 'string'
  ) {
    return null;
  }
  return { api_url: c.api_url, token: c.token, user_id: c.user_id };
}

export function storeCredential(
  cred: Credential,
  profile = 'default',
): void {
  if (!existsSync(CRED_DIR)) {
    mkdirSync(CRED_DIR, { recursive: true, mode: 0o700 });
  } else {
    chmodSync(CRED_DIR, 0o700);
  }
  let existing: CredentialsFile = {};
  if (existsSync(CRED_FILE)) {
    try {
      const raw = readFileSync(CRED_FILE, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object') {
        existing = parsed as CredentialsFile;
      }
    } catch {
      existing = {};
    }
  }
  existing[profile] = cred;
  writeFileSync(CRED_FILE, JSON.stringify(existing, null, 2) + '\n');
  chmodSync(CRED_FILE, 0o600);
}
