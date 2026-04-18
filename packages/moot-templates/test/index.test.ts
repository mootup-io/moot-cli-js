import { describe, expect, it } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { getTemplatesDir, BUNDLED_SKILLS } from '../src/index.js';

describe('getTemplatesDir()', () => {
  // T1: returns an absolute path to a real directory
  it('returns an absolute path to an existing directory', () => {
    const dir = getTemplatesDir();
    expect(isAbsolute(dir)).toBe(true);
    expect(statSync(dir).isDirectory()).toBe(true);
  });

  // T2: templates tree contains the loop-4 team layout with a valid TOML file
  it('includes a readable team.toml under teams/loop-4/', () => {
    const teamToml = join(getTemplatesDir(), 'teams', 'loop-4', 'team.toml');
    const content = readFileSync(teamToml, 'utf8');
    expect(content.length).toBeGreaterThan(0);
    // Minimal TOML sniff — a [section] header must be present
    expect(content).toMatch(/^\[[^\]]+\]/m);
  });
});

describe('BUNDLED_SKILLS', () => {
  // T3: every advertised skill has a corresponding bundled directory with SKILL.md
  it.each(BUNDLED_SKILLS)('skill %s has a SKILL.md under templates/skills/', (skill) => {
    const skillMd = join(getTemplatesDir(), 'skills', skill, 'SKILL.md');
    expect(statSync(skillMd).isFile()).toBe(true);
  });
});
