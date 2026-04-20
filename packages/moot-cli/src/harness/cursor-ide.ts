import {
  mkdirSync,
  existsSync,
  writeFileSync,
  readFileSync,
  chmodSync,
} from 'node:fs';
import { join } from 'node:path';

export interface GenerateCursorIdeArgs {
  token: string;
  apiUrl: string;
  cwd: string;
  force?: boolean;
  yes?: boolean;
  confirm?: (prompt: string) => Promise<boolean>;
}

const GITIGNORE_ENTRY = '.cursor/mcp.json';

export async function generateCursorIde(args: GenerateCursorIdeArgs): Promise<void> {
  const cursorDir = join(args.cwd, '.cursor');
  const mcpPath = join(cursorDir, 'mcp.json');
  const force = args.force ?? false;
  const yes = args.yes ?? false;
  const confirm = args.confirm ?? defaultConfirm;

  if (existsSync(mcpPath) && !force) {
    const existing = readFileSync(mcpPath, 'utf8');
    console.log(`.cursor/mcp.json already exists:\n${existing}`);
    if (!yes) {
      const ok = await confirm(
        `Overwrite .cursor/mcp.json with new PAT-backed config? [y/N] `,
      );
      if (!ok) {
        console.log('Aborted.');
        return;
      }
    }
  }

  if (!existsSync(cursorDir)) {
    mkdirSync(cursorDir, { recursive: true, mode: 0o700 });
  } else {
    chmodSync(cursorDir, 0o700);
  }

  const content = {
    mcpServers: {
      convo: {
        url: `${args.apiUrl}/mcp`,
        headers: {
          Authorization: `Bearer ${args.token}`,
        },
      },
    },
  };
  writeFileSync(mcpPath, JSON.stringify(content, null, 2) + '\n');
  chmodSync(mcpPath, 0o600);
  console.log(`Wrote .cursor/mcp.json         (chmod 600)`);

  appendGitignoreEntry(args.cwd);
}

function appendGitignoreEntry(cwd: string): void {
  const gitignorePath = join(cwd, '.gitignore');
  if (existsSync(gitignorePath)) {
    const existing = readFileSync(gitignorePath, 'utf8');
    if (existing.includes(GITIGNORE_ENTRY)) {
      return;
    }
    const sep = existing.endsWith('\n') ? '' : '\n';
    writeFileSync(
      gitignorePath,
      `${existing}${sep}${GITIGNORE_ENTRY}\n`,
    );
    console.log(`Appended '${GITIGNORE_ENTRY}' to .gitignore`);
  } else {
    writeFileSync(gitignorePath, `${GITIGNORE_ENTRY}\n`);
    console.log(`Created .gitignore with '${GITIGNORE_ENTRY}' entry`);
  }
}

async function defaultConfirm(prompt: string): Promise<boolean> {
  const { createInterface } = await import('node:readline/promises');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(prompt)).trim().toLowerCase();
  rl.close();
  return answer === 'y' || answer === 'yes';
}
