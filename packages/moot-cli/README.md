# @mootup/moot-cli

Host-side operator CLI for the Moot agent team workflow. Bin name: `moot`.

## Install

### Recommended: user-local install (no sudo)

    npm i -g --prefix ~/.local @mootup/moot-cli
    moot --version

Most Ubuntu/Debian systems already have `~/.local/bin` in PATH. If `moot --version` is not found after install, add the export to `~/.bashrc`:

    export PATH="$HOME/.local/bin:$PATH"

### Alternative: system-wide install (requires sudo)

    sudo npm i -g @mootup/moot-cli
    moot --version

### Ephemeral: npx (no install)

    npx @mootup/moot-cli login

Requires Node ≥ 18, Docker, and [`@devcontainers/cli`](https://github.com/devcontainers/cli) on PATH:

    npm i -g @devcontainers/cli

## First-use flow

```bash
# 1. Create a personal access token at https://mootup.io/settings/api-keys
# 2. Authenticate (stored under ~/.mootup/credentials.json, mode 0600):
moot login

# 3. Provision actors and install .devcontainer/ in your repo:
cd my-project
moot init

# 4. Bring the devcontainer up and start the agent team:
moot up

# 5. Inspect, attach, compact as needed:
moot status
moot attach leader
moot compact spec

# 6. Stop everything:
moot down
```

## Command reference

| Command | Runs | Delegates to |
|---|---|---|
| `moot login [--token <pat>] [--api-url <url>]` | host | writes `~/.mootup/credentials.json` |
| `moot init [--force] [--yes] [--api-url <url>]` | host | rotates actor keys, writes `.moot/actors.json`, copies `.devcontainer/` |
| `moot up` | host → container | `devcontainer up` + `docker exec <cid> moot up` |
| `moot down [role]` | container | `docker exec <cid> moot down [role]` |
| `moot status` | container | `docker exec <cid> moot status` |
| `moot attach <role>` | container | `docker exec -it <cid> moot attach <role>` |
| `moot compact [role]` | container | `docker exec <cid> moot compact [role]` |

The `up`, `down`, `status`, `attach`, and `compact` commands look up the running container by the `devcontainer.local_folder` label the devcontainer CLI stamps on each container; no container → clear error prompting `moot up`.

## Scope vs the Python CLI

`@mootup/moot-cli` covers only the host-side operator surface. The Python `moot` CLI inside the devcontainer remains canonical for in-container orchestration (tmux, MCP adapter, channel adapter, hooks, team profile). `moot init` in v0.1.0 installs `.moot/actors.json` + `.devcontainer/` only; skill / CLAUDE.md / hook bundle installation is tracked as a follow-up run.

## Manual smoke test (operator)

Run from a fresh test directory after logging in:

    mkdir /tmp/mootup-smoke && cd /tmp/mootup-smoke
    git init
    moot init
    test -f .moot/actors.json && echo "actors.json ✓"
    test -d .devcontainer && echo "devcontainer ✓"
    moot up
    moot status
    moot down

`moot init` hits the authenticated `/api/actors/me`, `/api/actors/me/agents`, `/api/actors/{id}/rotate-key` endpoints against the API URL stored at login time. A reachable backend is required.
