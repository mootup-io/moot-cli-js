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
import { getTemplatesDir } from '@mootup/moot-templates';

export interface InstallResponse {
  installation_id: string;
  team_id: string;
  space_id: string;
  space_name?: string;
  actors: Record<string, { actor_id: string; api_key: string; display_name: string }>;
}

export interface GenerateArgs {
  installResp: InstallResponse;
  cwd: string;
  force?: boolean;
  yes?: boolean;
  confirm?: (prompt: string) => Promise<boolean>;
  apiUrl: string;
}

export async function generateClaudeCode(args: GenerateArgs): Promise<void> {
  writeActorsJson({
    cwd: args.cwd,
    spaceId: args.installResp.space_id,
    spaceName: args.installResp.space_name ?? args.installResp.space_id,
    apiUrl: args.apiUrl,
    adopted: args.installResp.actors,
  });
  console.log(
    `Wrote .moot/actors.json        (${Object.keys(args.installResp.actors).length} agents, chmod 600)`,
  );
  installDevcontainer({ cwd: args.cwd, templateName: 'devcontainer', overwrite: false });
}

export function writeActorsJson(args: {
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

export function installDevcontainer(args: {
  cwd: string;
  templateName: string;
  overwrite: boolean;
}): void {
  const src = join(getTemplatesDir(), args.templateName);
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
  console.log(`Installed .devcontainer/       (${fileCount} files)`);
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
