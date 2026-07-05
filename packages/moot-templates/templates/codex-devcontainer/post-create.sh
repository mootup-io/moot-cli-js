#!/bin/bash
set -euo pipefail

# System packages
sudo apt-get update && sudo apt-get install -y tmux curl

# Codex CLI — standalone installer in non-interactive mode. The installer
# places `codex` in ~/.local/bin by default, which bash -lc picks up through
# the devcontainer user's standard profile.
curl -fsSL https://chatgpt.com/codex/install.sh | CODEX_NON_INTERACTIVE=1 sh

# Python tooling
pip install uv

# Install moot package
pip install mootup

# Register MCP servers for Codex at user scope so Codex finds them regardless
# of cwd (agents launch in worktrees under .worktrees/, not the project root).
# The wrappers read CONVO_ROLE at runtime to look up the per-role API key from
# .moot/actors.json.
DEVCONTAINER_DIR="$(realpath .devcontainer)"
mkdir -p /home/node/.codex
chmod 700 /home/node/.codex
cat > /home/node/.codex/config.toml <<CODEX_CONFIG
approval_policy = "never"
sandbox_mode = "workspace-write"

# Optional: uncomment when this devcontainer runs the moot LLM proxy and you
# want Codex to use it as an OpenAI-compatible provider. The proxy expects
# LLM_PROXY_SHARED_SECRET in the Codex process environment.
# model_provider = "moot-llm-proxy"
#
# [model_providers.moot-llm-proxy]
# name = "Moot LLM proxy"
# base_url = "http://127.0.0.1:8090/v1"
# env_key = "LLM_PROXY_SHARED_SECRET"

[mcp_servers.convo]
command = "$DEVCONTAINER_DIR/run-moot-mcp.sh"
startup_timeout_sec = 30

[mcp_servers.convo-channel]
command = "$DEVCONTAINER_DIR/run-moot-channel.sh"
startup_timeout_sec = 30
CODEX_CONFIG
chmod 600 /home/node/.codex/config.toml

# Codex reads AGENTS.md. Keep existing Claude guidance usable when present,
# without overwriting a project that already has Codex-native guidance.
if [ -f CLAUDE.md ] && [ ! -e AGENTS.md ]; then
  ln -s CLAUDE.md AGENTS.md
fi

# Codex reads skills from .agents/skills. Reuse checked-in Claude skills when a
# project has them, without copying or making either location canonical.
if [ -d .claude/skills ] && [ ! -e .agents/skills ]; then
  mkdir -p .agents
  ln -s ../.claude/skills .agents/skills
fi

# Rebind tmux prefix to Ctrl-Space. Ctrl-Space is rarely claimed by TUIs and
# leaves readline-style editing bindings (Ctrl-A/E/etc.) untouched inside Codex.
cat > /home/node/.tmux.conf <<'TMUX_CONF'
unbind C-b
set -g prefix C-Space
bind C-Space send-prefix

# Mouse on: scroll-wheel scrolls the pane, click selects a pane/window,
# drag copies. Without this, scrollback is only reachable via copy mode.
set -g mouse on
TMUX_CONF

echo "Container ready. Run 'codex login' in the devcontainer before starting agents."
