import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

describe('publish workflow', () => {
  // T6: .github/workflows/publish.yml publishes both moot-sdk and moot-templates
  it('includes a publish step for @mootup/moot-templates with NODE_AUTH_TOKEN', () => {
    const workflowPath = resolve(pkgRoot, '..', '..', '.github', 'workflows', 'publish.yml');
    const yaml = readFileSync(workflowPath, 'utf8');
    expect(yaml).toMatch(/npm publish --access public -w @mootup\/moot-templates/);
    expect(yaml).toMatch(/NODE_AUTH_TOKEN:\s*\$\{\{\s*secrets\.NPM_TOKEN\s*\}\}/);
  });
});
