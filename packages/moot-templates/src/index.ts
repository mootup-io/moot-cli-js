import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Absolute path to the bundled templates root.
 *
 * After `npm install`, the package layout on consumers' disk is:
 *   node_modules/@mootup/moot-templates/
 *     dist/index.js          <- this module after build
 *     templates/             <- vendored template tree
 *
 * `dirname(import.meta.url)` resolves to .../dist; `../templates` reaches
 * the sibling directory. Works identically in the source layout during
 * development (src/index.ts is under packages/moot-templates/src, and
 * templates/ is the sibling — but production always runs from dist/).
 */
export function getTemplatesDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '..', 'templates');
}

/**
 * Canonical bundled-skills list. Mirrors the convo `.claude/skills/` SOT
 * via `sync:skills`. The parity test enforces that every name listed here
 * has a corresponding directory under `templates/skills/`.
 */
export const BUNDLED_SKILLS: readonly string[] = [
  'doc-curation',
  'handoff',
  'implementation-workflow',
  'leader-workflow',
  'librarian-workflow',
  'memory-audit',
  'merge-to-main',
  'product-workflow',
  'spec-checklist',
  'stack-reset',
  'verify',
] as const;
