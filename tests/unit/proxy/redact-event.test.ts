import { describe, expect, it } from 'vitest';
import type { ProxyEvent } from '../../../src/proxy/observer.js';
import { redactEvent, redactValue } from '../../../src/proxy/redact-event.js';

const GITHUB_TOKEN = `ghp_${'a'.repeat(36)}`;

describe('redactValue', () => {
  it('redacts strings under credential-named keys, however they look', () => {
    expect(
      redactValue({
        password: 'hunter2hunter2',
        apiKey: 'plain-looking-value',
        Authorization: 'Bearer abcdefgh1234',
        nested: { refresh_token: 'rt-1234567890' },
      }),
    ).toEqual({
      password: 'hunt…ter2',
      apiKey: 'plai…alue',
      Authorization: 'Bear…1234',
      nested: { refresh_token: 'rt-1…7890' },
    });
  });

  it('redacts known-provider secrets inside any other string', () => {
    expect(redactValue({ query: `use ${GITHUB_TOKEN} please` })).toEqual({
      query: 'use ghp_…aaaa please',
    });
    expect(redactValue([GITHUB_TOKEN])).toEqual(['ghp_…aaaa']);
  });

  it('leaves numbers, booleans and ordinary strings alone', () => {
    const value = { maxTokens: 512, stream: true, text: 'merhaba', list: [1, null] };
    expect(redactValue(value)).toEqual(value);
  });
});

describe('redactEvent', () => {
  it('redacts the message and the raw preview, and keeps everything else', () => {
    const event: ProxyEvent = {
      ts: '2026-09-24T00:00:00.000Z',
      direction: 'client->server',
      kind: 'request',
      method: 'tools/call',
      id: 3,
      bytes: 99,
      message: { params: { arguments: { token: 'secret-value-123' } } },
    };
    expect(redactEvent(event)).toEqual({
      ...event,
      message: { params: { arguments: { token: 'secr…-123' } } },
    });
    const invalid: ProxyEvent = {
      ts: event.ts,
      direction: 'client->server',
      kind: 'invalid',
      bytes: 50,
      error: 'malformed JSON',
      raw: `{"token":"${GITHUB_TOKEN}`,
    };
    expect(redactEvent(invalid).raw).toBe('{"token":"ghp_…aaaa');
  });
});
