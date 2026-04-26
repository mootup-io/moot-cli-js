import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from './setup.js';
import { exchangeRegistrationTicket } from '../src/commands/init.js';

const API_URL = 'https://api.mootup.test';

beforeEach(() => {
  server.resetHandlers();
});

afterEach(() => {
  server.resetHandlers();
});

describe('SEC-5 exchangeRegistrationTicket', () => {
  it('R13 — returns the bound api_key on 200', async () => {
    server.use(
      http.post(`${API_URL}/api/registration-tickets/:ticket_id/exchange`, () =>
        HttpResponse.json({
          actor_id: 'agt_xyz',
          api_key: 'convo_key_under_test',
          display_name: 'TestAgent',
          actor_type: 'agent',
          api_key_prefix: 'convo_key_un',
        }),
      ),
    );
    const apiKey = await exchangeRegistrationTicket(API_URL, 'tkt_abc');
    expect(apiKey).toBe('convo_key_under_test');
  });

  it('R14 — surfaces a clear error on 410 ticket_expired', async () => {
    server.use(
      http.post(`${API_URL}/api/registration-tickets/:ticket_id/exchange`, () =>
        HttpResponse.json(
          { detail: { error: 'ticket_expired', message: 'expired' } },
          { status: 410 },
        ),
      ),
    );
    await expect(exchangeRegistrationTicket(API_URL, 'tkt_dead')).rejects.toThrow(
      /5-min TTL.*re-run/i,
    );
  });

  it('R15 — surfaces a clear error on 409 ticket_already_used', async () => {
    server.use(
      http.post(`${API_URL}/api/registration-tickets/:ticket_id/exchange`, () =>
        HttpResponse.json(
          { detail: { error: 'ticket_already_used', message: 'used' } },
          { status: 409 },
        ),
      ),
    );
    await expect(exchangeRegistrationTicket(API_URL, 'tkt_used')).rejects.toThrow(
      /already used.*re-run/i,
    );
  });
});
