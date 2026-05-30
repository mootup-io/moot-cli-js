import {
  loadCredential,
  deleteCredential,
  loadDefaultProfile,
  setDefaultProfile,
  clearDefaultProfile,
  enumerateProfiles,
} from '../credential.js';
import { validateProfile } from '../auth/profile.js';
import { cmdLogin, type LoginOptions } from './login.js';

export interface AccountUseOptions { name: string; }
export interface AccountRemoveOptions { name: string; force?: boolean; }
export interface AccountAddOptions { name: string; token?: string; apiUrl?: string; }

export function cmdAccountList(): void {
  const profiles = enumerateProfiles();
  if (profiles.length === 0) {
    console.log('No profiles registered. Run `moot login --profile <name>` to add one.');
    return;
  }
  const defaultName = loadDefaultProfile() ?? 'default';
  console.log('Profiles:');
  for (const name of profiles) {
    const marker = name === defaultName ? '* ' : '  ';
    const tag = name === defaultName ? ' (current default)' : '';
    console.log(`  ${marker}${name}${tag}`);
  }
  if (!profiles.includes(defaultName)) {
    console.log(
      `\nWarning: defaultProfile = '${defaultName}' is not a registered profile. ` +
      `Next invocation without --profile will fall back to literal 'default'.`,
    );
  }
}

export function cmdAccountUse(opts: AccountUseOptions): void {
  validateProfile(opts.name);
  if (!loadCredential(opts.name)) {
    console.error(
      `Error: profile '${opts.name}' is not registered. ` +
      `Run 'moot login --profile ${opts.name}' or 'moot account add ${opts.name}' first.`,
    );
    throw new Error(`profile '${opts.name}' not registered`);
  }
  setDefaultProfile(opts.name);
  console.log(`Default profile set to '${opts.name}'.`);
}

export function cmdAccountRemove(opts: AccountRemoveOptions): void {
  validateProfile(opts.name);
  if (!loadCredential(opts.name)) {
    console.error(`Error: profile '${opts.name}' is not registered.`);
    throw new Error(`profile '${opts.name}' not registered`);
  }
  const profiles = enumerateProfiles();
  const defaultName = loadDefaultProfile() ?? 'default';
  const isLast = profiles.length <= 1;
  const isDefault = opts.name === defaultName;

  if ((isLast || isDefault) && !opts.force) {
    const reason = isLast
      ? `is the last registered profile`
      : `is the current default`;
    console.error(
      `Error: profile '${opts.name}' ${reason}. ` +
      `Re-run with --force to remove anyway.`,
    );
    throw new Error(`refusing to remove ${reason}`);
  }

  deleteCredential(opts.name);
  if (isDefault) {
    clearDefaultProfile();
    console.log(
      `Removed profile '${opts.name}'. Default profile cleared; ` +
      `next invocation without --profile falls back to literal 'default'.`,
    );
  } else {
    console.log(`Removed profile '${opts.name}'.`);
  }
}

export async function cmdAccountAdd(opts: AccountAddOptions): Promise<void> {
  validateProfile(opts.name);
  const loginOpts: LoginOptions = { profile: opts.name };
  if (opts.token !== undefined) loginOpts.token = opts.token;
  if (opts.apiUrl !== undefined) loginOpts.apiUrl = opts.apiUrl;
  await cmdLogin(loginOpts);
}
