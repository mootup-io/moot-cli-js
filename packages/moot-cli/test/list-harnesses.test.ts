import { describe, it, expect, vi } from 'vitest';
import { cmdListHarnesses } from '../src/index.js';

describe('--list-harnesses (R-LIST)', () => {
  it('R-LIST-1 — emits one line per registry entry in REGISTRY iteration order', async () => {
    const writes: string[] = [];
    const spy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: string | Uint8Array) => {
        writes.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
        return true;
      });

    try {
      cmdListHarnesses();
    } finally {
      spy.mockRestore();
    }

    const out = writes.join('');
    const lines = out.trimEnd().split('\n');
    expect(lines.length).toBe(5);
    expect(lines[0]).toMatch(/^claude-code \(devcontainer-team\):/);
    expect(lines[1]).toMatch(/^cursor-agent \(devcontainer-team\):/);
    expect(lines[2]).toMatch(/^cursor-ide \(host-side-solo\):/);
    expect(lines[3]).toMatch(/^codex \(devcontainer-team\):/);
    expect(lines[4]).toMatch(/^sdk \(host-side-solo\):/);
    expect(out.endsWith('\n')).toBe(true);
  });

  it('R-LIST-2 — output is parseable as <name> (<topology>): <desc>', () => {
    const writes: string[] = [];
    const spy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: string | Uint8Array) => {
        writes.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
        return true;
      });
    try {
      cmdListHarnesses();
    } finally {
      spy.mockRestore();
    }
    const lines = writes.join('').trimEnd().split('\n');
    for (const line of lines) {
      expect(line).toMatch(/^[a-z-]+ \((devcontainer-team|host-side-solo)\): .+/);
    }
  });
});
