import type { ScanResult } from '../../core/engine.js';

/** Bump when the shape of this document changes in a way that could break a
 * consumer parsing it programmatically (adding fields is fine; renaming/
 * removing them is not). */
const JSON_REPORT_VERSION = '1';

export function formatJson(result: ScanResult): string {
  const document = {
    version: JSON_REPORT_VERSION,
    targetsScanned: result.targetsScanned,
    findings: result.findings,
  };
  return JSON.stringify(document, null, 2);
}
