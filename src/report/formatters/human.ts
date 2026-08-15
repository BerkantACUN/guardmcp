import pc from 'picocolors';
import type { ScanResult } from '../../core/engine.js';
import type { Finding } from '../../core/finding.js';
import type { Severity } from '../../core/severity.js';

const SEVERITY_STYLE: Record<Severity, (text: string) => string> = {
  critical: (t) => pc.bold(pc.red(t)),
  high: pc.red,
  medium: pc.yellow,
  low: pc.blue,
  info: pc.gray,
};

export function formatHuman(result: ScanResult): string {
  if (result.findings.length === 0) {
    return `${pc.green('✔')} No findings across ${result.targetsScanned} scanned file(s).`;
  }

  const lines: string[] = [];
  for (const [file, findings] of groupByFile(result.findings)) {
    lines.push(file);
    for (const finding of findings) {
      lines.push(formatFinding(finding));
    }
    lines.push('');
  }
  lines.push(summaryLine(result));
  return lines.join('\n').trimEnd();
}

function formatFinding(finding: Finding): string {
  const label = SEVERITY_STYLE[finding.severity](finding.severity.toUpperCase());
  const position = `${finding.location.line}:${finding.location.column}`;
  const evidenceSuffix = finding.evidence ? `  ${pc.dim(finding.evidence)}` : '';
  return [
    `  ${label}  ${pc.bold(finding.ruleId)}  ${finding.message}`,
    `    ${pc.dim(position)}${evidenceSuffix}`,
    `    ${pc.dim('Fix:')} ${finding.remediation}`,
  ].join('\n');
}

function summaryLine(result: ScanResult): string {
  const counts = countBySeverity(result.findings);
  const parts = (['critical', 'high', 'medium', 'low', 'info'] as const)
    .filter((severity) => counts[severity] > 0)
    .map((severity) => `${counts[severity]} ${severity}`);
  return `${parts.join(', ')} — ${result.findings.length} finding(s) across ${result.targetsScanned} file(s)`;
}

function countBySeverity(findings: readonly Finding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const finding of findings) {
    counts[finding.severity]++;
  }
  return counts;
}

function groupByFile(findings: readonly Finding[]): Map<string, Finding[]> {
  const byFile = new Map<string, Finding[]>();
  for (const finding of findings) {
    const bucket = byFile.get(finding.location.file);
    if (bucket) {
      bucket.push(finding);
    } else {
      byFile.set(finding.location.file, [finding]);
    }
  }
  return byFile;
}
