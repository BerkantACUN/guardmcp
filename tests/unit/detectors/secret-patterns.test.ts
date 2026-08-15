import { describe, expect, it } from 'vitest';
import { findSecrets, redact } from '../../../src/detectors/secret-patterns.js';

describe('findSecrets', () => {
  it.each([
    ['github-token', 'ghp_1234567890abcdefghijklmnopqrstuvwxyz12'],
    ['anthropic-openai-key', 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789'],
    ['anthropic-openai-key', 'sk-abcdefghijklmnopqrstuvwx'],
    ['aws-access-key-id', 'AKIAFAKEKEY0000TEST1'],
    // Built via concatenation, not a contiguous literal: GitHub's push
    // protection treats Slack tokens as a partner pattern that can't be
    // path-excluded, and flags any full "xoxb-...-..." literal it finds in a
    // commit, real or synthetic. The regex under test still receives the
    // fully-joined string at runtime — only the on-disk bytes differ.
    ['slack-token', `xox${'b'}-1234567890-abcdefghijklmnop`],
    [
      'jwt',
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
    ],
  ])('detects a %s', (id, secret) => {
    const found = findSecrets(`some prefix ${secret} some suffix`);
    expect(found.some((f) => f.pattern.id === id && f.value === secret)).toBe(true);
  });

  it('finds multiple distinct secrets in one string', () => {
    const found = findSecrets(
      'AKIAFAKEKEY0000TEST1 and also ghp_1234567890abcdefghijklmnopqrstuvwxyz12',
    );
    expect(found).toHaveLength(2);
  });

  it('does not misfire on an ordinary command-line string', () => {
    const found = findSecrets('npx -y @modelcontextprotocol/server-github --port 3000');
    expect(found).toEqual([]);
  });

  it('does not misfire on an env-var reference (not a literal secret)', () => {
    // Built via concatenation, not a literal `${...}` string, purely so biome's
    // noTemplateCurlyInString rule doesn't (reasonably) flag it as a forgotten
    // template literal — this really is meant as inert config-file text.
    const envVarReference = '$' + '{GITHUB_TOKEN}';
    const found = findSecrets(envVarReference);
    expect(found).toEqual([]);
  });

  it('is stateless across repeated calls (regression: shared `g`-flag regex state)', () => {
    const secret = 'ghp_1234567890abcdefghijklmnopqrstuvwxyz12';
    const first = findSecrets(secret);
    const second = findSecrets(secret);
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
  });
});

describe('redact', () => {
  it('keeps a recognizable prefix/suffix for a long secret', () => {
    expect(redact('ghp_1234567890abcdefghijklmnopqrstuvwxyz12')).toBe('ghp_…yz12');
  });

  it('fully masks short values instead of leaking them via 4+4 slicing', () => {
    expect(redact('abcd1234')).toBe('********');
  });

  it('never returns the original value unchanged for a plausible secret length', () => {
    const secret = 'AKIAFAKEKEY0000TEST1';
    expect(redact(secret)).not.toBe(secret);
    expect(redact(secret)).not.toContain(secret);
  });
});
