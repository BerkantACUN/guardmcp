import { describe, expect, it } from 'vitest';
import { classifySensitiveParamName } from '../../../src/detectors/sensitive-param-name.js';

describe('classifySensitiveParamName — credentials', () => {
  it.each([
    'password',
    'passwd',
    'pwd',
    'apiKey',
    'api_key',
    'API-KEY',
    'accessToken',
    'access_token',
    'refreshToken',
    'clientSecret',
    'privateKey',
    'sessionId',
    'authorization',
    'bearerToken',
    'credentials',
  ])('flags %s as a credential', (name) => {
    expect(classifySensitiveParamName(name)?.kind, name).toBe('credential');
  });
});

describe('classifySensitiveParamName — PII', () => {
  it.each([
    'ssn',
    'socialSecurityNumber',
    'creditCard',
    'cardNumber',
    'cvv',
    'dateOfBirth',
    'passportNumber',
    'taxId',
  ])('flags %s as PII', (name) => {
    expect(classifySensitiveParamName(name)?.kind, name).toBe('pii');
  });
});

describe('classifySensitiveParamName — the AI-domain false positive trap', () => {
  it.each([
    'maxTokens',
    'max_tokens',
    'tokenCount',
    'numTokens',
    'tokenLimit',
    'tokenizer',
    'minTokens',
  ])('does NOT flag %s — these are LLM token counts, not credentials', (name) => {
    // The single most likely false positive in this domain: a scanner that
    // flags maxTokens as a leaked secret is one a user disables on day one.
    expect(classifySensitiveParamName(name), name).toBeNull();
  });
});

describe('classifySensitiveParamName — ordinary parameters', () => {
  it.each([
    'query',
    'path',
    'region',
    'limit',
    'userId',
    'fileName',
    'keyword',
    'authorName',
    'secretariat',
  ])('leaves %s alone', (name) => {
    expect(classifySensitiveParamName(name), name).toBeNull();
  });

  it('handles empty and odd input without throwing', () => {
    for (const name of ['', '_', '---', '123']) {
      expect(() => classifySensitiveParamName(name)).not.toThrow();
    }
  });
});
