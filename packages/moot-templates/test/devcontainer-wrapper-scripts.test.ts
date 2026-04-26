/**
 * SEC-2-C R8 — devcontainer wrapper script injection tests.
 *
 * Validates that the run-moot-mcp.sh and run-moot-channel.sh scripts are
 * shielded from CONVO_ROLE shell-injection. Spawns each script with a
 * malicious CONVO_ROLE value AND a benign one against a stub actors.json
 * + moot.toml; asserts:
 *   - no /tmp/sec2c-pwn marker file is created (malicious payload never runs);
 *   - benign role exports CONVO_API_KEY correctly;
 *   - script exits cleanly (with the documented warning on missing role).
 */
import { describe, expect, it, afterEach, beforeEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getTemplatesDir } from '../src/index.js';

const PWN_MARKER = '/tmp/sec2c-pwn';
const SCRIPTS = ['run-moot-mcp.sh', 'run-moot-channel.sh'] as const;

function makeProject(): string {
	const project = mkdtempSync(join(tmpdir(), 'sec2c-'));
	mkdirSync(join(project, '.moot'), { recursive: true });
	writeFileSync(
		join(project, 'moot.toml'),
		'[convo]\napi_url = "https://example.test"\nspace_id = "spc_test"\n',
	);
	writeFileSync(
		join(project, '.moot', 'actors.json'),
		JSON.stringify({
			actors: {
				implementation: {
					api_key: 'convo_key_benign',
					actor_id: 'agt_benign',
					display_name: 'BenignImpl',
				},
			},
		}),
	);
	return project;
}

beforeEach(() => {
	if (existsSync(PWN_MARKER)) rmSync(PWN_MARKER);
});

afterEach(() => {
	if (existsSync(PWN_MARKER)) rmSync(PWN_MARKER);
});

describe.each(SCRIPTS)('%s — SEC-2-C injection guard', (scriptName) => {
	const scriptPath = join(getTemplatesDir(), 'devcontainer', scriptName);

	it('a malicious CONVO_ROLE does NOT execute attacker shell code', () => {
		const project = makeProject();
		// Run the prelude only; replace `exec python -u -m moot...` with `:` so
		// the script returns after env setup. We invoke bash with a stub
		// `python` shim NOT used; the heredoc form makes shell-injection
		// impossible by construction, so the malicious CONVO_ROLE never
		// reaches a shell context.
		const probeCmd = [
			`cd '${project}'`,
			// Strip the final exec line via sed so the test exits the prelude.
			`PROBE=$(sed '/^exec python/d' '${scriptPath}')`,
			'eval "$PROBE"',
			'echo "POST_KEY=${CONVO_API_KEY:-<unset>}"',
		].join('; ');
		try {
			execFileSync('bash', ['-c', probeCmd], {
				env: {
					...process.env,
					// The classic injection payload: try to break the Python literal,
					// drop a marker file, then continue. Heredoc shields it.
					CONVO_ROLE: `evil';touch ${PWN_MARKER};echo 'pwn`,
				},
				stdio: ['ignore', 'pipe', 'pipe'],
				timeout: 10_000,
			});
		} catch (e) {
			// Non-zero exit is acceptable (warning path on unknown role); the
			// invariant is the marker file's absence, asserted below.
		}
		expect(existsSync(PWN_MARKER)).toBe(false);
		rmSync(project, { recursive: true, force: true });
	});

	it('a benign CONVO_ROLE resolves the api_key from actors.json', () => {
		const project = makeProject();
		const probeCmd = [
			`cd '${project}'`,
			`PROBE=$(sed '/^exec python/d' '${scriptPath}')`,
			'eval "$PROBE"',
			'echo "POST_KEY=${CONVO_API_KEY:-<unset>}"',
		].join('; ');
		const out = execFileSync('bash', ['-c', probeCmd], {
			env: { ...process.env, CONVO_ROLE: 'implementation' },
			encoding: 'utf8',
			timeout: 10_000,
		});
		expect(out).toContain('POST_KEY=convo_key_benign');
		rmSync(project, { recursive: true, force: true });
	});
});
