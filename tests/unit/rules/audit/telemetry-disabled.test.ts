import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadScanTarget } from '../../../../src/discovery/index.js';
import { telemetryDisabledRule } from '../../../../src/rules/audit/telemetry-disabled.js';

const FIXTURES_ROOT = fileURLToPath(new URL('../../../fixtures/configs', import.meta.url));
const CTX = { cwd: FIXTURES_ROOT };

function load(relativeToFixtures: string) {
  return loadScanTarget(`${FIXTURES_ROOT}/${relativeToFixtures}`, FIXTURES_ROOT);
}

describe('MCPG-701 telemetry-disabled rule', () => {
  it('flags each switch that silences the server', () => {
    const findings = telemetryDisabledRule.check(load('malicious/telemetry-disabled.json'), CTX);

    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.logicalPath)).toEqual([
      '/mcpServers/billing-agent/env/OTEL_SDK_DISABLED',
      '/mcpServers/billing-agent/env/LOG_LEVEL',
    ]);
    for (const finding of findings) {
      expect(finding.ruleId).toBe('MCPG-701');
      expect(finding.severity).toBe('medium');
    }
  });

  it('reports the standard OpenTelemetry switch with high confidence', () => {
    const [otel] = telemetryDisabledRule.check(load('malicious/telemetry-disabled.json'), CTX);
    expect(otel?.confidence).toBe('high');
    expect(otel?.message).toMatch(/OpenTelemetry/i);
  });

  it('points at the offending line, not the top of the file', () => {
    const [otel] = telemetryDisabledRule.check(load('malicious/telemetry-disabled.json'), CTX);
    expect(otel?.location.line).toBeGreaterThan(1);
  });

  it('says what the consequence is, not just what the setting is', () => {
    const [otel] = telemetryDisabledRule.check(load('malicious/telemetry-disabled.json'), CTX);
    // MCP08 is about incident response finding nothing to look at — the
    // remediation has to say that, or the finding reads like style advice.
    expect(otel?.remediation).toMatch(/investigat|incident|audit|trail|record/i);
  });

  it('does not fire when logging is on, or a switch is explicitly false', () => {
    expect(telemetryDisabledRule.check(load('benign/telemetry-enabled.json'), CTX)).toEqual([]);
  });

  it.each(['no-env.json', 'http-remote-server.json', 'pinned-package.json'])(
    'reports nothing for benign fixture %s',
    (fixture) => {
      expect(telemetryDisabledRule.check(load(`benign/${fixture}`), CTX)).toEqual([]);
    },
  );

  it('maps to OWASP MCP08', () => {
    expect(telemetryDisabledRule.owasp).toEqual(['MCP08']);
  });
});
