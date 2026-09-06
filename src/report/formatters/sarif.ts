import type { Log, ReportingDescriptor, Result, ToolComponent } from 'sarif';
import type { ScanResult } from '../../core/engine.js';
import type { Finding } from '../../core/finding.js';
import type { Severity } from '../../core/severity.js';
import { PACKAGE_HOMEPAGE, PACKAGE_NAME, PACKAGE_VERSION } from '../../package-info.js';
import {
  OWASP_MCP_TAXONOMY_COMMIT,
  OWASP_MCP_TAXONOMY_NAME,
  OWASP_MCP_TAXONOMY_SOURCE_URL,
  OWASP_MCP_TAXONOMY_URL,
  OWASP_MCP_TAXONOMY_VERSION,
  OWASP_MCP_TOP_10,
  type OwaspMcpId,
} from '../../rules/owasp.js';

const SARIF_SCHEMA_URI =
  'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json';

/** Minimal shape both `Rule` and `ToolRule` satisfy — the formatter only
 * needs catalog metadata, not the `check()` function. */
export interface RuleCatalogEntry {
  readonly id: string;
  readonly title: string;
  readonly severity: Severity;
  readonly docsUrl: string;
  readonly owasp: readonly OwaspMcpId[];
}

/** Stable across releases on purpose: SARIF consumers key taxonomy identity
 * off the GUID, so changing it would make old and new runs look like they
 * cite two unrelated standards. */
const OWASP_TAXONOMY_GUID = 'a3f1c8d2-6b47-4e19-9f83-2d5e7c1b0a64';

/** Position of each category in the emitted `taxa` array. SARIF addresses
 * taxa by index, so this must stay in step with OWASP_MCP_TOP_10's order —
 * which the catalog's invariant tests pin to MCP01..MCP10. */
const TAXA_INDEX: ReadonlyMap<OwaspMcpId, number> = new Map(
  OWASP_MCP_TOP_10.map((entry, index) => [entry.id, index]),
);

/** The full list is emitted every run, not just the categories that happened
 * to fire. A reader needs to see the two clean categories to know they were
 * checked and passed — an absent taxon is indistinguishable from an
 * unsupported one. */
function owaspTaxonomy(): ToolComponent {
  return {
    name: OWASP_MCP_TAXONOMY_NAME,
    guid: OWASP_TAXONOMY_GUID,
    version: OWASP_MCP_TAXONOMY_VERSION,
    organization: 'OWASP',
    informationUri: OWASP_MCP_TAXONOMY_URL,
    shortDescription: {
      text: 'The OWASP MCP Top 10 — the ten most critical security risks in Model Context Protocol deployments.',
    },
    isComprehensive: true,
    properties: {
      // Which reading of the beta this mapping was built from. `version`
      // alone is not decidable while the list is still moving under its own
      // label; the sha is.
      specCommit: OWASP_MCP_TAXONOMY_COMMIT,
      specSource: OWASP_MCP_TAXONOMY_SOURCE_URL,
    },
    taxa: OWASP_MCP_TOP_10.map((entry) => ({
      id: entry.id,
      name: entry.title,
      helpUri: entry.url,
      shortDescription: { text: entry.title },
    })),
  };
}

/** `superset` is the SARIF kind for "the target category is broader than
 * this rule" — one OWASP entry covers many concrete detections. */
function owaspRelationships(ids: readonly OwaspMcpId[]) {
  return ids.map((id) => ({
    target: {
      id,
      index: TAXA_INDEX.get(id),
      toolComponent: { name: OWASP_MCP_TAXONOMY_NAME, guid: OWASP_TAXONOMY_GUID },
    },
    kinds: ['superset'],
  }));
}

const SEVERITY_TO_SARIF_LEVEL: Record<Severity, Result['level']> = {
  critical: 'error',
  high: 'error',
  medium: 'warning',
  low: 'note',
  info: 'note',
};

export function formatSarif(result: ScanResult, allRules: readonly RuleCatalogEntry[]): string {
  const usedRuleIds = new Set(result.findings.map((f) => f.ruleId));
  const rulesById = new Map(allRules.map((r) => [r.id, r]));

  const sarifRules: ReportingDescriptor[] = [...usedRuleIds].sort().map((id) => {
    const rule = rulesById.get(id);
    const owasp = rule?.owasp ?? [];
    return {
      id,
      name: id,
      shortDescription: { text: rule?.title ?? id },
      helpUri: rule?.docsUrl ?? PACKAGE_HOMEPAGE,
      defaultConfiguration: {
        level: rule ? SEVERITY_TO_SARIF_LEVEL[rule.severity] : 'warning',
      },
      relationships: owaspRelationships(owasp),
      properties: {
        owaspMcpTop10: [...owasp],
        // GitHub's Code Scanning UI surfaces `tags` as filter chips; the
        // taxonomy relationships above are the machine-readable form, these
        // are what a human can actually click.
        tags: owasp.map((entry) => `${OWASP_MCP_TAXONOMY_NAME}/${entry}`),
      },
    };
  });

  const log: Log = {
    $schema: SARIF_SCHEMA_URI,
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: PACKAGE_NAME,
            version: PACKAGE_VERSION,
            informationUri: PACKAGE_HOMEPAGE,
            rules: sarifRules,
          },
        },
        results: result.findings.map(findingToSarifResult),
        taxonomies: [owaspTaxonomy()],
      },
    ],
  };

  return JSON.stringify(log, null, 2);
}

function findingToSarifResult(finding: Finding): Result {
  return {
    ruleId: finding.ruleId,
    level: SEVERITY_TO_SARIF_LEVEL[finding.severity],
    message: { text: finding.message },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: toPosixPath(finding.location.file) },
          region: {
            startLine: finding.location.line,
            startColumn: finding.location.column,
            ...(finding.location.endLine !== undefined
              ? { endLine: finding.location.endLine }
              : {}),
            ...(finding.location.endColumn !== undefined
              ? { endColumn: finding.location.endColumn }
              : {}),
          },
        },
      },
    ],
    partialFingerprints: {
      'guardmcpFingerprint/v1': finding.fingerprint,
    },
  };
}

/** SARIF artifact URIs are forward-slash paths regardless of host OS. */
function toPosixPath(path: string): string {
  return path.replace(/\\/g, '/');
}
