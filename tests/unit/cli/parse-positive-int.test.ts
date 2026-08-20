import { describe, expect, it } from 'vitest';
import { parsePositiveInt } from '../../../src/cli/parse-positive-int.js';

describe('parsePositiveInt', () => {
  it('parses a valid positive integer string', () => {
    expect(parsePositiveInt('--live-timeout', '10000')).toBe(10000);
  });

  it('throws a clear error for a non-numeric value', () => {
    expect(() => parsePositiveInt('--live-timeout', '10s')).toThrow(
      /Invalid --live-timeout value "10s"/,
    );
  });

  it('throws for zero', () => {
    expect(() => parsePositiveInt('--live-timeout', '0')).toThrow(/Invalid --live-timeout/);
  });

  it('throws for a negative value', () => {
    expect(() => parsePositiveInt('--live-timeout', '-5')).toThrow(/Invalid --live-timeout/);
  });

  it('throws for an empty string (would otherwise become NaN and silently misbehave)', () => {
    expect(() => parsePositiveInt('live-timeout', '')).toThrow(/Invalid live-timeout/);
  });
});
