import { describe, expect, it } from 'vitest';
import {
  findSecrets,
  isEnvVarReference,
  isTemplatePlaceholder,
} from '../../../src/detectors/secret-patterns.js';

// `${…}` strings are built by concatenation, as in secret-patterns.test.ts, so
// biome's noTemplateCurlyInString does not read them as forgotten templates.
describe('isEnvVarReference', () => {
  it.each([
    '$' + '{GITHUB_TOKEN}',
    '$GITHUB_TOKEN',
    '%GITHUB_TOKEN%',
    '$' + '{env:GITHUB_TOKEN}',
    '$' + '{input:api-key}',
    '$' + '{2Captcha_API_KEY}',
  ])('treats %s as a reference', (value) => {
    expect(isEnvVarReference(value)).toBe(true);
  });

  it.each([
    'ghp_1234567890abcdefghijklmnopqrstuvwxyz12',
    'prefix-$' + '{TOKEN}',
    '$' + '{A}$' + '{B}',
    '$' + '{ }',
    '$' + '{}',
  ])('does not treat %s as a single reference', (value) => {
    expect(isEnvVarReference(value)).toBe(false);
  });
});

describe('isTemplatePlaceholder', () => {
  it.each(['{service_api_key}', '<YOUR_API_KEY>', '[paste token here]', '  {token}  '])(
    'treats %s as a placeholder',
    (value) => {
      expect(isTemplatePlaceholder(value)).toBe(true);
    },
  );

  it.each(['Bearer {token}', 'abc{def}', '{a}{b}', 'q7Xk2pLz9Rw4VbN8mTs3Hd6', ''])(
    'does not treat %s as a placeholder',
    (value) => {
      expect(isTemplatePlaceholder(value)).toBe(false);
    },
  );
});

describe('findSecrets and references', () => {
  it('still finds a real token that is not wrapped in a reference', () => {
    expect(findSecrets('ghp_1234567890abcdefghijklmnopqrstuvwxyz12')).toHaveLength(1);
  });
});
