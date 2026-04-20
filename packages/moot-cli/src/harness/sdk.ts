export interface GenerateSdkArgs {
  token: string;
  apiUrl: string;
  showToken?: boolean;
}

const CONFIG_PATH_HINT = '~/.config/moot/sdk-credentials.toml';

export async function generateSdk(args: GenerateSdkArgs): Promise<void> {
  const showToken = args.showToken ?? false;
  if (showToken) {
    console.log(args.token);
  } else {
    const suffix = args.token.slice(-4);
    console.log(`Token suffix: ...${suffix} (4 chars)`);
  }
  console.log(`Config path hint: ${CONFIG_PATH_HINT} (or set MOOTUP_PAT env)`);
  console.log(`Revoke at: ${args.apiUrl}/settings/access`);
  if (showToken) {
    console.log(
      `Warning: --show-token printed the full token to stdout; ` +
        `it may be captured in shell history.`,
    );
  }
}
