// AH-g: parity — Session field names must match the canonical contract
// at convo:docs/api/sdk-harness-contract.json (mirrored to test/fixtures/
// via `npm run sync:contract`).

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { connectMootup, type MCPClientLike } from '../src/index.js';

const fixturePath = resolve(
  __dirname,
  'fixtures',
  'sdk-harness-contract.json',
);
const contract = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
  session_fields: Record<string, unknown>;
  naming: { typescript: Record<string, string>; python: Record<string, string> };
  errors: { not_oriented: { typescript: string; python: string } };
};

const stubClient: MCPClientLike = {
  async callTool() {
    return {
      structuredContent: {
        identity: { actor_id: 'agt_parity', display_name: 'P', actor_type: 'agent', is_admin: false },
        focus_space: { space_id: 'spc_parity', description: '', status: 'active' },
        unread_mentions: 0,
        last_status: null,
        participants: [],
        context: '',
      },
    };
  },
};

describe('R-parity-js: Session field names match contract', () => {
  it('Session exposes exactly the TS-named fields the contract declares', async () => {
    const session = await connectMootup(stubClient, {
      baseUrl: 'http://convo.test',
      auth: 'mootup_pat_parity',
    });
    const expectedKeys = new Set(Object.values(contract.naming.typescript));
    expectedKeys.add('tools');
    expect(new Set(Object.keys(session))).toEqual(expectedKeys);
  });

  it('MootupNotOrientedError class name matches contract', async () => {
    const { MootupNotOrientedError } = await import('../src/index.js');
    expect(MootupNotOrientedError.name).toBe(contract.errors.not_oriented.typescript);
  });
});
