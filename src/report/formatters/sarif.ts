import type { Log, ReportingDescriptor, Result } from 'sarif';
import type { ScanResult } from '../../core/engine.js';
import type { Finding } from '../../core/finding.js';
import type { Severity } from '../../core/severity.js';
import { PACKAGE_HOMEPAGE, PACKAGE_NAME, PACKAGE_VERSION } from '../../package-info.js';

const SARIF_SCHEMA_URI =
  'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json';

/** Minimal shape both `Rule` and `ToolRule` satisfy — the formatter only
 * needs catalog metadata, not the `check()` function. */
export interface RuleCatalogEntry {
  readonly id: string;
  readonly title: string;
  readonly severity: Severity;
  readonly docsUrl: string;
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
    return {
      id,
      name: id,
      shortDescription: { text: rule?.title ?? id },
      helpUri: rule?.docsUrl ?? PACKAGE_HOMEPAGE,
      defaultConfiguration: {
        level: rule ? SEVERITY_TO_SARIF_LEVEL[rule.severity] : 'warning',
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
