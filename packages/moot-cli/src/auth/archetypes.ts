import { createInterface } from 'node:readline/promises';

export interface ArchetypeEntry {
  id: string;
  version: string;
  description: string;
}

export const ARCHETYPE_CATALOG: readonly ArchetypeEntry[] = [
  { id: 'mootup/loop-6',              version: '1.0', description: 'Recommended default — core pipeline with librarian + dedicated leader' },
  { id: 'mootup/loop-4',              version: '1.0', description: 'Core pipeline (product/spec/impl/qa)' },
  { id: 'mootup/loop-4-observer',     version: '1.0', description: 'Core + librarian' },
  { id: 'mootup/loop-4-parallel',     version: '1.0', description: 'Core + parallel impl-a/impl-b' },
  { id: 'mootup/loop-4-split-leader', version: '1.0', description: 'Core + dedicated leader' },
  { id: 'mootup/loop-3',              version: '1.0', description: 'Minimal (leader/impl/qa)' },
] as const;

export const DEFAULT_ARCHETYPE = 'mootup/loop-6';

export function findArchetype(id: string): ArchetypeEntry | null {
  return ARCHETYPE_CATALOG.find((a) => a.id === id) ?? null;
}

export async function promptArchetype(
  prompt?: (q: string) => Promise<string>,
): Promise<ArchetypeEntry> {
  const ask = prompt ?? defaultPrompt;
  console.log('Available team archetypes:');
  ARCHETYPE_CATALOG.forEach((a, i) => {
    const marker = a.id === DEFAULT_ARCHETYPE ? ' (default)' : '';
    console.log(`  ${i + 1}. ${a.id}${marker} — ${a.description}`);
  });
  const answer = (
    await ask(`Select archetype [1-${ARCHETYPE_CATALOG.length}, default=${DEFAULT_ARCHETYPE}]: `)
  ).trim();
  if (!answer) return findArchetype(DEFAULT_ARCHETYPE)!;
  const idx = Number.parseInt(answer, 10);
  if (Number.isFinite(idx) && idx >= 1 && idx <= ARCHETYPE_CATALOG.length) {
    return ARCHETYPE_CATALOG[idx - 1]!;
  }
  const byId = findArchetype(answer);
  if (byId) return byId;
  throw new Error(`Unknown archetype: ${answer}`);
}

async function defaultPrompt(q: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(q);
  rl.close();
  return answer;
}
