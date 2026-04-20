export type HarnessName = 'claude-code' | 'cursor-agent' | 'cursor-ide' | 'sdk';
export type HarnessTopology = 'devcontainer-team' | 'host-side-solo';

export interface HarnessEntry {
  name: HarnessName;
  topology: HarnessTopology;
  description: string;
  paths_written: readonly string[];
}

export const HARNESS_REGISTRY: Readonly<Record<HarnessName, HarnessEntry>> = {
  'claude-code': {
    name: 'claude-code',
    topology: 'devcontainer-team',
    description: 'Claude Code agents in devcontainer (default)',
    paths_written: [
      '.devcontainer/devcontainer.json',
      '.moot/actors.json',
      '.env.product',
      '.env.leader',
      '.env.spec',
      '.env.implementation',
      '.env.qa',
      '.env.librarian',
    ],
  },
  'cursor-agent': {
    name: 'cursor-agent',
    topology: 'devcontainer-team',
    description: 'Cursor Agent agents in devcontainer (Cursor-specific tweaks)',
    paths_written: [
      '.devcontainer/devcontainer.json',
      '.moot/actors.json',
      '.env.product',
      '.env.leader',
      '.env.spec',
      '.env.implementation',
      '.env.qa',
      '.env.librarian',
    ],
  },
  'cursor-ide': {
    name: 'cursor-ide',
    topology: 'host-side-solo',
    description: 'Cursor IDE project-local MCP config (host, solo)',
    paths_written: ['.cursor/mcp.json'],
  },
  sdk: {
    name: 'sdk',
    topology: 'host-side-solo',
    description: 'SDK token for custom harness integration (stdout)',
    paths_written: [],
  },
} as const;

export const DEFAULT_HARNESS: HarnessName = 'claude-code';
export const RESERVED_BARE_NAMES: readonly string[] = ['cursor'];

export function classifyHarness(name: string): HarnessEntry {
  if (RESERVED_BARE_NAMES.includes(name)) {
    throw new Error(
      `'${name}' is ambiguous. Did you mean 'cursor-ide' (IDE integration) ` +
        `or 'cursor-agent' (devcontainer agent)?`,
    );
  }
  const entry = (HARNESS_REGISTRY as Record<string, HarnessEntry | undefined>)[name];
  if (!entry) {
    const known = Object.keys(HARNESS_REGISTRY).join(', ');
    throw new Error(`Unknown harness '${name}'. Known: ${known}.`);
  }
  return entry;
}

export function validateFlagMatrix(
  harness: HarnessEntry,
  opts: { archetype?: string },
): void {
  if (harness.topology === 'host-side-solo' && opts.archetype) {
    throw new Error(
      `--archetype is incompatible with --harness ${harness.name} ` +
        `(host-side-solo; no team to archetype).`,
    );
  }
}
