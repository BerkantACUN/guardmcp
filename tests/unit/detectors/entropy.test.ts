import { describe, expect, it } from 'vitest';
import { shannonEntropy } from '../../../src/detectors/entropy.js';

describe('shannonEntropy', () => {
  it('is 0 for an empty string', () => {
    expect(shannonEntropy('')).toBe(0);
  });

  it('is 0 for a single repeated character (fully predictable)', () => {
    expect(shannonEntropy('aaaaaaaa')).toBe(0);
  });

  it('is higher for a random-looking string than for an English word of similar length', () => {
    const word = 'production';
    const random = 'x7Qz9pLk2m';
    expect(shannonEntropy(random)).toBeGreaterThan(shannonEntropy(word));
  });

  it('is exactly 1 bit for a 50/50 two-symbol string', () => {
    expect(shannonEntropy('abababab')).toBeCloseTo(1, 5);
  });
});
