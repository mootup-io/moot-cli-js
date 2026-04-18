# @mootup/moot-cli

Host-side operator CLI for the Moot agent team workflow. Bin name: `mootup`.

## Install

One-off via `npx`:

    npx @mootup/moot-cli login
    npx @mootup/moot-cli init

Or global install:

    npm i -g @mootup/moot-cli
    mootup login
    mootup init

Requires Node ≥ 20, Docker, and [`@devcontainers/cli`](https://github.com/devcontainers/cli) on `PATH`:

    npm i -g @devcontainers/cli

## First-use flow

```bash
# 1. Create a personal access token at https://mootup.io/settings/api-keys
# 2. Authenticate (stored under ~/.mootup/credentials.json, mode 0600):
mootup login

# 3. Provision actors and install .devcontainer/ in your repo:
cd my-project
mootup init

# 4. Bring the devcontainer up and start the agent team:
mootup up

# 5. Inspect, attach, compact as needed:
mootup status
mootup attach leader
mootup compact spec

# 6. Stop everything:
mootup down
```

## Command reference

| Command | Runs | Delegates to |
|---|---|---|
| `mootup login [--token <pat>] [--api-url <url>]` | host | writes `~/.mootup/credentials.json` |
| `mootup init [--force] [--yes] [--api-url <url>]` | host | rotates actor keys, writes `.moot/actors.json`, copies `.devcontainer/` |
| `mootup up` | host → container | `devcontainer up` + `docker exec <cid> moot up` |
| `mootup down [role]` | container | `docker exec <cid> moot down [role]` |
| `mootup status` | container | `docker exec <cid> moot status` |
| `mootup attach <role>` | container | `docker exec -it <cid> moot attach <role>` |
| `mootup compact [role]` | container | `docker exec <cid> moot compact [role]` |

The `up`, `down`, `status`, `attach`, and `compact` commands look up the running container by the `devcontainer.local_folder` label the devcontainer CLI stamps on each container; no container → clear error prompting `mootup up`.

## Scope vs the Python CLI

`@mootup/moot-cli` covers only the host-side operator surface. The Python `moot` CLI inside the devcontainer remains canonical for in-container orchestration (tmux, MCP adapter, channel adapter, hooks, team profile). `mootup init` in v0.1.0-rc.0 installs `.moot/actors.json` + `.devcontainer/` only; skill / CLAUDE.md / hook bundle installation is tracked as a follow-up run (v0.2.0).

## Manual smoke test (operator)

Run from a fresh test directory after logging in:

    mkdir /tmp/mootup-smoke && cd /tmp/mootup-smoke
    git init
    mootup init
    test -f .moot/actors.json && echo "actors.json ✓"
    test -d .devcontainer && echo "devcontainer ✓"
    mootup up
    mootup status
    mootup down

`mootup init` hits the authenticated `/api/actors/me`, `/api/actors/me/agents`, `/api/actors/{id}/rotate-key` endpoints against the API URL stored at login time. A reachable backend is required.
