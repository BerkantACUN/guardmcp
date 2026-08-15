import type { JsoncDocument } from '../parsers/jsonc-document.js';
import type { McpConfigFile } from './mcp-server-def.js';

/**
 * One MCP config file, already parsed and validated. Rules operate purely on
 * this — no filesystem/network access inside a rule (see docs/planning
 * §5.3's "kurallar saf fonksiyondur" contract).
 */
export interface ScanTarget {
  readonly kind: 'config-file';
  /** Absolute path — not used for display, only if a rule needs to re-read something. */
  readonly filePath: string;
  /** Path shown in reports; relative to the scan root so output isn't machine-specific. */
  readonly relativePath: string;
  readonly document: JsoncDocument;
  readonly config: McpConfigFile;
}
