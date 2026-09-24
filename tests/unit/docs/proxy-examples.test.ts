import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadScanTarget } from '../../../src/discovery/index.js';
import { isStdioServerDef } from '../../../src/model/mcp-server-def.js';
import { ALL_RULES } from '../../../src/rules/registry.js';

/**
 * The proxy examples are configs people will paste into their clients. They
 * have to be clean by guardmcp's own rules — an example that launches an
 * unpinned package or goes through a shell would teach exactly what `scan`
 * reports — and every entry has to actually route through the proxy.
 */
const EXAMPLES = fileURLToPath(new URL('../../../examples/proxy', import.meta.url));

function jsonFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return jsonFiles(path);
    return entry.name.endsWith('.json') ? [path] : [];
  });
}

const files = jsonFiles(EXAMPLES);

describe('examples/proxy', () => {
  it('has an example for each client the README documents', () => {
    const names = files.map((f) => relative(EXAMPLES, f).replace(/\\/g, '/')).sort();
    expect(names).toEqual([
      'claude-code/.mcp.json',
      'claude-desktop/claude_desktop_config.json',
      'claude-desktop/claude_desktop_config.windows.json',
      'cursor/mcp.json',
    ]);
  });

  describe.each(files.map((f) => [relative(EXAMPLES, f), f]))('%s', (_name, file) => {
    const target = loadScanTarget(file, EXAMPLES);

    it('passes every config rule with no findings', () => {
      const findings = ALL_RULES.flatMap((rule) => rule.check(target, { cwd: EXAMPLES }));
      expect(findings.map((f) => `${f.ruleId} ${f.logicalPath}`)).toEqual([]);
    });

    it('routes every server through guardmcp proxy, with a pinned server after --', () => {
      const servers = Object.entries(target.config.mcpServers ?? {});
      expect(servers.length).toBeGreaterThan(0);
      for (const [, def] of servers) {
        expect(isStdioServerDef(def)).toBe(true);
        if (!isStdioServerDef(def)) continue;
        const args = def.args ?? [];
        expect(args).toContain('proxy');
        const separator = args.indexOf('--');
        expect(separator).toBeGreaterThan(args.indexOf('proxy'));
        const server = args.slice(separator + 1);
        expect(server[0]).toBe('npx');
        expect(server.find((a) => a.startsWith('@modelcontextprotocol/'))).toMatch(/@\d/);
      }
    });
  });
});
