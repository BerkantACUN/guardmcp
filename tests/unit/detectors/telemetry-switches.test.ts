import { describe, expect, it } from 'vitest';
import { findTelemetrySwitches } from '../../../src/detectors/telemetry-switches.js';

describe('findTelemetrySwitches', () => {
  it('flags the OpenTelemetry standard kill switch with high confidence', () => {
    const [match] = findTelemetrySwitches({ OTEL_SDK_DISABLED: 'true' });
    expect(match?.key).toBe('OTEL_SDK_DISABLED');
    expect(match?.confidence).toBe('high');
    expect(match?.label).toMatch(/OpenTelemetry/i);
  });

  it('flags DO_NOT_TRACK, the cross-vendor opt-out convention', () => {
    const [match] = findTelemetrySwitches({ DO_NOT_TRACK: '1' });
    expect(match?.key).toBe('DO_NOT_TRACK');
    expect(match?.confidence).toBe('high');
  });

  it('flags generic telemetry-disable switches with medium confidence', () => {
    for (const key of ['DISABLE_TELEMETRY', 'TELEMETRY_DISABLED', 'NEXT_TELEMETRY_DISABLED']) {
      const [match] = findTelemetrySwitches({ [key]: 'true' });
      expect(match?.key, key).toBe(key);
      expect(match?.confidence, key).toBe('medium');
    }
  });

  it('flags a log level silenced to off/silent/none', () => {
    for (const value of ['off', 'silent', 'none', 'OFF']) {
      const [match] = findTelemetrySwitches({ LOG_LEVEL: value });
      expect(match?.key, value).toBe('LOG_LEVEL');
    }
  });

  it('ignores a log level that still records something', () => {
    for (const value of ['info', 'debug', 'warn', 'error', 'trace']) {
      expect(findTelemetrySwitches({ LOG_LEVEL: value }), value).toEqual([]);
    }
  });

  it('ignores a disable switch that is explicitly turned off', () => {
    // DISABLE_TELEMETRY=false means telemetry is ON — the opposite of a finding.
    expect(findTelemetrySwitches({ DISABLE_TELEMETRY: 'false' })).toEqual([]);
    expect(findTelemetrySwitches({ OTEL_SDK_DISABLED: '0' })).toEqual([]);
  });

  it('does not fire on unrelated variables', () => {
    expect(
      findTelemetrySwitches({ HOME: '/root', LOG_FILE: '/var/log/x', API_KEY: 'abc' }),
    ).toEqual([]);
  });

  it('reports every switch present, in declaration order', () => {
    const matches = findTelemetrySwitches({
      OTEL_SDK_DISABLED: 'true',
      LOG_LEVEL: 'silent',
      HOME: '/root',
    });
    expect(matches.map((m) => m.key)).toEqual(['OTEL_SDK_DISABLED', 'LOG_LEVEL']);
  });

  it('handles an absent env block', () => {
    expect(findTelemetrySwitches(undefined)).toEqual([]);
  });
});
