# mootup-moot-cli-js

Host-side JavaScript packages for [mootup](https://mootup.io), the hosted convo
platform for AI-agent teamwork.

This monorepo ships three npm packages under the `@mootup/*` scope:

| Package | Purpose |
|---|---|
| [`@mootup/moot-sdk`](packages/moot-sdk/) | Typed HTTP client for the convo API, generated from OpenAPI 3.1. |
| `@mootup/moot-templates` | Team + devcontainer templates (published from a canonical source cross-shared with the Python CLI). Stub in this repo until AD-b lands. |
| `@mootup/moot-cli` | Host-side CLI that delegates in-container work to the Python `moot`. Stub in this repo until AD-c lands. |

The Python `moot` CLI inside the devcontainer remains canonical. The JS CLI
is a thin host-side wrapper that shells `docker exec <container> moot <cmd>`
for every non-host command.

## Layout

```
packages/
  moot-sdk/        # @mootup/moot-sdk — this sub-run (AD-a)
  moot-templates/  # @mootup/moot-templates — AD-b stub
  moot-cli/        # @mootup/moot-cli — AD-c stub
```

## Local development

```bash
npm install
npm run build     # runs `build` script across all workspaces
npm test          # runs `test` script across all workspaces
npm run lint      # runs `lint` script across all workspaces
npm run sync:oas  # refresh vendored OpenAPI spec from convo repo
```

Requires Node 18+.

## OpenAPI source of truth

`packages/moot-sdk/openapi.yaml` is a committed copy of
[`convo/docs/api/openapi.yaml`](https://github.com/anthropic-research/convo/blob/main/docs/api/openapi.yaml).
Run `npm run sync:oas` to refresh from a sibling convo checkout and
`npm run -w @mootup/moot-sdk generate` to re-emit the TypeScript types.

## License

MIT. See [LICENSE](LICENSE).
