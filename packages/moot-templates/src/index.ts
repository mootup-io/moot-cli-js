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
 * Mirror of Python's `moot.scaffold.BUNDLED_SKILLS`. Names must stay in
 * lock-step; the parity test enforces that every name listed here has a
 * corresponding directory under `templates/skills/`.
 */
export const BUNDLED_SKILLS: readonly string[] = [
  'product-workflow',
  'spec-checklist',
  'leader-workflow',
  'librarian-workflow',
  'handoff',
  'verify',
  'doc-curation',
  'memory-audit',
] as const;
