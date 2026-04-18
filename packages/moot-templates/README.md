# @mootup/moot-templates

Canonical project templates for [`@mootup/moot-cli`](https://www.npmjs.com/package/@mootup/moot-cli) — skills, team layouts, devcontainer scaffolding, and Claude Code hooks.

The templates are the single source of truth for `moot init` scaffolding on both the Python and JavaScript sides of the mootup toolchain. The canonical tree lives in [`mootup-io/moot`](https://github.com/mootup-io/moot) at `src/moot/templates/`; this package vendors a byte-identical copy for JS consumers.

## Install

```bash
npm install @mootup/moot-templates
```

## Usage

```js
import { getTemplatesDir, BUNDLED_SKILLS } from '@mootup/moot-templates';

console.log(getTemplatesDir());
// /absolute/path/to/node_modules/@mootup/moot-templates/templates

console.log(BUNDLED_SKILLS);
// ['product-workflow', 'spec-checklist', ...]
```

## What's bundled

- `templates/CLAUDE.md` — default CLAUDE.md for new projects
- `templates/claude/` — Claude Code settings + hooks
- `templates/devcontainer/` — devcontainer.json + runner scripts
- `templates/skills/` — 8 bundled agent-workflow skills
- `templates/teams/` — 5 team topologies (loop-3, loop-4, loop-4-observer, loop-4-parallel, loop-4-split-leader)

## Maintenance

Contributors: templates live canonically in `mootup-io/moot/src/moot/templates/`. Edits land there. To refresh this package's vendored copy:

```bash
# From the mootup-io/moot-cli-js monorepo root:
npm run -w @mootup/moot-templates sync:templates
```

The parity test (`test/parity.test.ts`) enforces byte-identical equality between the vendored copy and the canonical source on every CI run.
