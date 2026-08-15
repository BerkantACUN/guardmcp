import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { McpConfigFileSchema } from '../model/mcp-server-def.js';
import type { ScanTarget } from '../model/scan-target.js';
import { parseJsoncDocument } from '../parsers/jsonc-document.js';

export class ScanTargetLoadError extends Error {
  constructor(
    public readonly filePath: string,
    cause: unknown,
  ) {
    super(`Failed to load MCP config at ${filePath}: ${errorMessage(cause)}`, { cause });
    this.name = 'ScanTargetLoadError';
  }
}

/**
 * Reads, parses (JSONC — comments/trailing commas are legal in some
 * clients' configs), and schema-validates one config file into a ScanTarget.
 * Throws ScanTargetLoadError on any failure; the CLI layer decides whether
 * to skip-and-warn or abort (see cli/commands/scan.ts).
 */
export function loadScanTarget(filePath: string, cwd: string): ScanTarget {
  let text: string;
  try {
    text = readFileSync(filePath, 'utf-8');
  } catch (err) {
    throw new ScanTargetLoadError(filePath, err);
  }

  const document = parseJsoncDocument(text);
  const raw = document.getValue();

  const result = McpConfigFileSchema.safeParse(raw);
  if (!result.success) {
    throw new ScanTargetLoadError(filePath, result.error);
  }

  return {
    kind: 'config-file',
    filePath,
    relativePath: relative(cwd, filePath) || filePath,
    document,
    config: result.data,
  };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export { discoverProjectConfigPaths } from './locators/project.js';
