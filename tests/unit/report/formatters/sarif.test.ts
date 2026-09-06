import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createFinding } from '../../../../src/core/finding.js';
import { formatSarif } from '../../../../src/report/formatters/sarif.js';

// ajv/ajv-formats are CJS-only with no "exports" map — under this project's
// moduleResolution:"NodeNext" + "type":"module", TS's dual-package-hazard
// detection mistypes a plain `import Ajv from 'ajv'` (a known ecosystem pain
// point). Test-only code, so require() via createRequire sidesteps it
// entirely rather than fighting the type resolver.
const require = createRequire(import.meta.url);
// biome-ignore lint/suspicious/noExplicitAny: see comment above — CJS interop escape hatch, test-only
const AjvCtor = require('ajv').default as any;
// biome-ignore lint/suspicious/noExplicitAny: same as above
const addFormats = require('ajv-formats').default as any;

const schemaPath = fileURLToPath(
  new URL('../../../fixtures/schemas/sarif-schema-2.1.0.json', import.meta.url),
);
const sarifSchema = JSON.parse(readFileSync(schemaPath, 'utf-8'));

const ajv = new AjvCtor({ strict: false, allErrors: true });
addFormats(ajv);
const validateSarif = ajv.compile(sarifSchema);

const RULES = [
  {
    id: 'MCPG-101',
    title: 'Hardcoded secret in MCP server config',
    severity: 'critical' as const,
    docsUrl: 'https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-101.md',
    owasp: ['MCP01'] as const,
  },
  {
    id: 'MCPG-105',
    title: 'Unpinned package version',
    severity: 'medium' as const,
    docsUrl: 'https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-105.md',
    owasp: ['MCP04'] as const,
  },
];

function sampleResult() {
  return {
    targetsScanned: 2,
    findings: [
      createFinding({
        ruleId: 'MCPG-101',
        severity: 'critical',
        confidence: 'high',
        message: 'Hardcoded GitHub token.',
        remediation: 'Rotate it.',
        location: { file: '.mcp.json', line: 7, column: 25, endLine: 7, endColumn: 42 },
        logicalPath: '/mcpServers/example/env/GITHUB_TOKEN',
        evidence: 'ghp_…yz12',
      }),
      createFinding({
        ruleId: 'MCPG-105',
        severity: 'medium',
        confidence: 'medium',
        message: 'Unpinned package.',
        remediation: 'Pin it.',
        location: { file: '.vscode/mcp.json', line: 3, column: 10 },
        logicalPath: '/mcpServers/other/args/1',
      }),
    ],
  };
}

describe('formatSarif', () => {
  it('produces output that validates against the official SARIF 2.1.0 schema', () => {
    const output = formatSarif(sampleResult(), RULES);
    const document = JSON.parse(output);

    const valid = validateSarif(document);
    if (!valid) {
      throw new Error(
        `SARIF schema validation failed:\n${JSON.stringify(validateSarif.errors, null, 2)}`,
      );
    }
    expect(valid).toBe(true);
  });

  it('validates for a clean (zero-finding) result too', () => {
    const output = formatSarif({ targetsScanned: 3, findings: [] }, RULES);
    expect(validateSarif(JSON.parse(output))).toBe(true);
  });

  it('sets the correct SARIF version and schema URI', () => {
    const document = JSON.parse(formatSarif(sampleResult(), RULES));
    expect(document.version).toBe('2.1.0');
    expect(document.$schema).toContain('sarif-schema-2.1.0');
  });

  it('maps severity to SARIF levels correctly (critical/high -> error, medium -> warning)', () => {
    const document = JSON.parse(formatSarif(sampleResult(), RULES));
    const results = document.runs[0].results;
    expect(results.find((r: { ruleId: string }) => r.ruleId === 'MCPG-101').level).toBe('error');
    expect(results.find((r: { ruleId: string }) => r.ruleId === 'MCPG-105').level).toBe('warning');
  });

  it('includes a rule catalog entry (helpUri, name) for every rule referenced by a finding', () => {
    const document = JSON.parse(formatSarif(sampleResult(), RULES));
    const rules = document.runs[0].tool.driver.rules;
    expect(rules.map((r: { id: string }) => r.id).sort()).toEqual(['MCPG-101', 'MCPG-105']);
    expect(rules[0].helpUri).toMatch(/^https:\/\//);
  });

  it('only lists rules that actually produced a finding, not the whole registry', () => {
    const document = JSON.parse(
      formatSarif(sampleResult(), [
        ...RULES,
        {
          id: 'MCPG-999',
          title: 'Unused',
          severity: 'low' as const,
          docsUrl: 'https://example.com',
          owasp: [] as const,
        },
      ]),
    );
    const ruleIds = document.runs[0].tool.driver.rules.map((r: { id: string }) => r.id);
    expect(ruleIds).not.toContain('MCPG-999');
  });

  it('includes a stable partial fingerprint for baseline/suppression workflows', () => {
    const document = JSON.parse(formatSarif(sampleResult(), RULES));
    const [first] = document.runs[0].results;
    expect(first.partialFingerprints).toBeDefined();
    expect(Object.values(first.partialFingerprints)[0]).toMatch(/^[0-9a-f]{16}$/);
  });

  it('points the physical location at the relative file path and line/column', () => {
    const document = JSON.parse(formatSarif(sampleResult(), RULES));
    const [first] = document.runs[0].results;
    const region = first.locations[0].physicalLocation.region;
    expect(first.locations[0].physicalLocation.artifactLocation.uri).toBe('.mcp.json');
    expect(region.startLine).toBe(7);
    expect(region.startColumn).toBe(25);
  });
});

describe('formatSarif — OWASP MCP Top 10 taxonomy', () => {
  it('declares the taxonomy on the run', () => {
    const run = JSON.parse(formatSarif(sampleResult(), RULES)).runs[0];
    const taxonomy = run.taxonomies?.[0];

    expect(taxonomy).toBeDefined();
    expect(taxonomy.name).toBe('OWASP-MCP-Top-10');
    expect(taxonomy.organization).toBe('OWASP');
    expect(taxonomy.version).toBe('0.1');
    expect(taxonomy.informationUri).toBe('https://owasp.org/www-project-mcp-top-10/');
    expect(taxonomy.guid).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('carries the pinned spec revision on the taxonomy', () => {
    const run = JSON.parse(formatSarif(sampleResult(), RULES)).runs[0];
    const taxonomy = run.taxonomies[0];

    // Without this a reader knows the mapping cites "OWASP MCP Top 10 v0.1"
    // and still cannot tell WHICH v0.1 — the beta is a moving target and
    // independent tools have already diverged on the numbering.
    expect(taxonomy.properties.specCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(taxonomy.properties.specSource).toContain(taxonomy.properties.specCommit);
  });

  it('lists all ten categories as taxa, each with a helpUri', () => {
    const run = JSON.parse(formatSarif(sampleResult(), RULES)).runs[0];
    const taxa = run.taxonomies[0].taxa;

    expect(taxa).toHaveLength(10);
    expect(taxa.map((t: { id: string }) => t.id)).toEqual([
      'MCP01',
      'MCP02',
      'MCP03',
      'MCP04',
      'MCP05',
      'MCP06',
      'MCP07',
      'MCP08',
      'MCP09',
      'MCP10',
    ]);
    for (const taxon of taxa) {
      expect(taxon.name.length).toBeGreaterThan(0);
      expect(taxon.helpUri).toMatch(/^https:\/\/owasp\.org\//);
    }
  });

  it('relates each emitted rule to its OWASP categories by taxa index', () => {
    const run = JSON.parse(formatSarif(sampleResult(), RULES)).runs[0];
    const taxonomyGuid = run.taxonomies[0].guid;
    const rules = run.tool.driver.rules;

    const secret = rules.find((r: { id: string }) => r.id === 'MCPG-101');
    expect(secret.relationships).toHaveLength(1);
    expect(secret.relationships[0].kinds).toEqual(['superset']);
    expect(secret.relationships[0].target.id).toBe('MCP01');
    // index must address the taxa array: MCP01 is at position 0
    expect(secret.relationships[0].target.index).toBe(0);
    expect(secret.relationships[0].target.toolComponent.guid).toBe(taxonomyGuid);

    const unpinned = rules.find((r: { id: string }) => r.id === 'MCPG-105');
    expect(unpinned.relationships[0].target.id).toBe('MCP04');
    expect(unpinned.relationships[0].target.index).toBe(3);
  });

  it('carries the categories on the rule properties too, for consumers that ignore taxonomies', () => {
    const run = JSON.parse(formatSarif(sampleResult(), RULES)).runs[0];
    const secret = run.tool.driver.rules.find((r: { id: string }) => r.id === 'MCPG-101');

    expect(secret.properties.owaspMcpTop10).toEqual(['MCP01']);
    // GitHub surfaces `tags` in the Code Scanning UI — put them there as well.
    expect(secret.properties.tags).toContain('OWASP-MCP-Top-10/MCP01');
  });

  it('still validates against the official schema with taxonomies attached', () => {
    const document = JSON.parse(formatSarif(sampleResult(), RULES));
    const valid = validateSarif(document);
    if (!valid) {
      throw new Error(
        `SARIF schema validation failed:
${JSON.stringify(validateSarif.errors, null, 2)}`,
      );
    }
    expect(valid).toBe(true);
  });

  it('declares the taxonomy even when there are no findings', () => {
    const run = JSON.parse(formatSarif({ targetsScanned: 1, findings: [] }, RULES)).runs[0];
    expect(run.taxonomies[0].taxa).toHaveLength(10);
  });
});
