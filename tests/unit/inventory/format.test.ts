import { describe, expect, it } from 'vitest';
import { formatInventoryHuman, formatInventoryJson } from '../../../src/inventory/format.js';
import type { Inventory } from '../../../src/inventory/model.js';

const INVENTORY: Inventory = {
  configs: [
    {
      relativePath: '.mcp.json',
      scope: 'project',
      servers: [
        {
          name: 'api',
          transport: 'stdio',
          launch: 'node dist/server.js',
          surfaces: {
            tools: ['read_file', 'search_docs'],
            prompts: ['review_code'],
            resources: ['project-readme'],
          },
        },
        { name: 'remote', transport: 'http', launch: 'https://api.example.com/mcp' },
      ],
    },
  ],
  live: true,
};

describe('formatInventoryHuman', () => {
  it('groups servers under the config they came from', () => {
    const out = formatInventoryHuman(INVENTORY);
    expect(out).toContain('.mcp.json');
    expect(out).toContain('api');
    expect(out).toContain('node dist/server.js');
  });

  it('shows the scope, so a machine-wide server is visibly not the project’s', () => {
    expect(formatInventoryHuman(INVENTORY)).toMatch(/project/);
  });

  it('lists each surface with its count', () => {
    const out = formatInventoryHuman(INVENTORY);
    expect(out).toMatch(/tools\s+2/);
    expect(out).toMatch(/prompts\s+1/);
    expect(out).toMatch(/resources\s+1/);
  });

  it('totals everything at the end', () => {
    const out = formatInventoryHuman(INVENTORY);
    expect(out).toMatch(/2 servers/);
    expect(out).toMatch(/2 tools/);
  });

  it('says plainly that surfaces are unknown without --live', () => {
    // The difference between "this server has no tools" and "we did not ask"
    // is the whole value of an inventory. It must never be ambiguous.
    const out = formatInventoryHuman({ ...INVENTORY, live: false });
    expect(out).toMatch(/--live/);
    expect(out).not.toMatch(/tools\s+0/);
  });

  it('reports a server that failed to introspect instead of showing it as empty', () => {
    const out = formatInventoryHuman({
      live: true,
      configs: [
        {
          relativePath: '.mcp.json',
          scope: 'project',
          servers: [{ name: 'broken', transport: 'stdio', launch: 'nope', error: 'ENOENT' }],
        },
      ],
    });
    expect(out).toMatch(/could not connect|ENOENT/i);
  });

  it('handles an empty inventory without crashing', () => {
    expect(() => formatInventoryHuman({ configs: [], live: false })).not.toThrow();
    expect(formatInventoryHuman({ configs: [], live: false })).toMatch(/no MCP/i);
  });
});

describe('formatInventoryJson', () => {
  it('emits parseable JSON carrying the same facts', () => {
    const parsed = JSON.parse(formatInventoryJson(INVENTORY));
    expect(parsed.live).toBe(true);
    expect(parsed.totals).toEqual({ configs: 1, servers: 2, tools: 2, prompts: 1, resources: 1 });
    expect(parsed.configs[0].servers[0].surfaces.tools).toEqual(['read_file', 'search_docs']);
  });

  it('omits surfaces entirely when they were never asked for', () => {
    const parsed = JSON.parse(formatInventoryJson({ configs: [], live: false }));
    expect(parsed.live).toBe(false);
    expect(parsed.totals.servers).toBe(0);
  });
});
