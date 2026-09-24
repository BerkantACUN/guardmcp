import { describe, expect, it } from 'vitest';
import { createFinding } from '../../../src/core/finding.js';
import { formatEventLine, formatFindingLines } from '../../../src/proxy/format.js';

describe('proxy stderr formatting', () => {
  it('prints direction, kind, method, id and duration on one line', () => {
    const line = formatEventLine({
      ts: '2026-01-01T00:00:00.000Z',
      direction: 'server->client',
      kind: 'response',
      method: 'tools/list',
      id: 2,
      durationMs: 13,
      bytes: 100,
    });
    expect(line).toContain('server→client');
    expect(line).toContain('tools/list #2 (13 ms)');
  });

  it('strips terminal escapes a hostile peer puts in a method name or error', () => {
    const request = formatEventLine({
      ts: '',
      direction: 'client->server',
      kind: 'request',
      method: 'tools/list\u001b[2K\u001b[1Gall clear',
      id: 1,
      bytes: 1,
    });
    const invalid = formatEventLine({
      ts: '',
      direction: 'server->client',
      kind: 'invalid',
      bytes: 1,
      error: 'bad\u001b[31m',
    });
    expect(request).not.toContain('\u001b');
    expect(invalid).not.toContain('\u001b');
    expect(invalid).toContain('invalid (1 B)');
  });

  it('prints one line per finding and none when there are none', () => {
    const finding = createFinding({
      ruleId: 'MCPG-201',
      severity: 'critical',
      confidence: 'medium',
      message: 'Tool "x"\u001b[2K is poisoned',
      remediation: '',
      location: { file: 'live:demo/x', line: 1, column: 1 },
      logicalPath: '/tools/demo/x/description',
    });
    const base = { ts: '', direction: 'server->client', kind: 'response', bytes: 1 } as const;
    const lines = formatFindingLines({ ...base, findings: [finding] });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('MCPG-201 critical');
    expect(lines[0]).not.toContain('\u001b');
    expect(formatFindingLines(base)).toEqual([]);
  });
});
