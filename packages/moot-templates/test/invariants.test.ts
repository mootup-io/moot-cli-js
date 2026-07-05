import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { getTemplatesDir } from '../src/index.js';

const pkgRoot = resolve(__dirname, '..');

describe('package manifest', () => {
  // T5: package.json `files` includes templates and dist, excludes test/scripts
  it('declares dist, templates, and README.md in files; excludes test and scripts', () => {
    const pkg = JSON.parse(readFileSync(resolve(pkgRoot, 'package.json'), 'utf8'));
    expect(pkg.files).toEqual(expect.arrayContaining(['dist', 'templates', 'README.md']));
    expect(pkg.files).not.toContain('test');
    expect(pkg.files).not.toContain('scripts');
  });
});

describe('TMPL-1 skill bundle + loop-6 template', () => {
  it('R3 — bundled skill directory count is 11', () => {
    const skillsRoot = join(getTemplatesDir(), 'skills');
    const dirs = readdirSync(skillsRoot).filter((e) =>
      statSync(join(skillsRoot, e)).isDirectory(),
    );
    expect(dirs.length).toBe(11);
    expect(dirs.sort()).toEqual([
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
    ]);
  });

  it('R5 — loop-6/team.toml declares all 6 roles', () => {
    const toml = readFileSync(
      join(getTemplatesDir(), 'teams', 'loop-6', 'team.toml'),
      'utf-8',
    );
    for (const role of ['product', 'leader', 'spec', 'implementation', 'qa', 'librarian']) {
      expect(toml).toMatch(new RegExp(`\\[\\[roles\\]\\][\\s\\S]*?name\\s*=\\s*"${role}"`));
    }
  });

  it('R6 — loop-6/team.toml: leader/qa/librarian use sonnet; product/spec/implementation use opus', () => {
    const toml = readFileSync(
      join(getTemplatesDir(), 'teams', 'loop-6', 'team.toml'),
      'utf-8',
    );
    for (const sonnetRole of ['leader', 'qa', 'librarian']) {
      const block = new RegExp(
        `\\[\\[roles\\]\\][\\s\\S]*?name\\s*=\\s*"${sonnetRole}"[\\s\\S]*?model\\s*=\\s*"sonnet"`,
      );
      expect(toml, `expected sonnet for ${sonnetRole}`).toMatch(block);
    }
    for (const opusRole of ['product', 'spec', 'implementation']) {
      const block = new RegExp(
        `\\[\\[roles\\]\\][\\s\\S]*?name\\s*=\\s*"${opusRole}"[\\s\\S]*?model\\s*=\\s*"opus"`,
      );
      expect(toml, `expected opus for ${opusRole}`).toMatch(block);
    }
  });
});


describe('codex devcontainer template', () => {
  it('installs Codex and writes user-scope MCP + sandbox config', () => {
    const postCreate = readFileSync(
      join(getTemplatesDir(), 'codex-devcontainer', 'post-create.sh'),
      'utf8',
    );
    expect(postCreate).toContain('https://chatgpt.com/codex/install.sh');
    expect(postCreate).toContain('CODEX_NON_INTERACTIVE=1');
    expect(postCreate).toContain('approval_policy = "never"');
    expect(postCreate).toContain('sandbox_mode = "workspace-write"');
    expect(postCreate).toContain('[mcp_servers.convo]');
    expect(postCreate).toContain('[mcp_servers.convo-channel]');
    expect(postCreate).toContain('run-moot-mcp.sh');
    expect(postCreate).toContain('run-moot-channel.sh');
    expect(postCreate).toContain('model_provider = "moot-llm-proxy"');
    expect(postCreate).toContain('base_url = "http://127.0.0.1:8090/v1"');
    expect(postCreate).toContain('AGENTS.md');
    expect(postCreate).toContain('.agents/skills');
    expect(postCreate).not.toContain('claude mcp add');
  });

  it('uses a Codex-specific devcontainer name', () => {
    const config = readFileSync(
      join(getTemplatesDir(), 'codex-devcontainer', 'devcontainer.json'),
      'utf8',
    );
    expect(config).toContain('moot-agent-team-codex');
    expect(config).toContain('moot-codex-${localWorkspaceFolderBasename}');
  });
});
