import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { discoverProjectConfigPaths } from '../../../src/discovery/locators/project.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'guardmcp-discovery-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('discoverProjectConfigPaths', () => {
  it('returns nothing when no config files exist', () => {
    expect(discoverProjectConfigPaths(dir)).toEqual([]);
  });

  it('finds .mcp.json at the project root', () => {
    writeFileSync(join(dir, '.mcp.json'), '{}');
    expect(discoverProjectConfigPaths(dir)).toEqual([join(dir, '.mcp.json')]);
  });

  it('finds .vscode/mcp.json', () => {
    mkdirSync(join(dir, '.vscode'));
    writeFileSync(join(dir, '.vscode', 'mcp.json'), '{}');
    expect(discoverProjectConfigPaths(dir)).toEqual([join(dir, '.vscode', 'mcp.json')]);
  });

  it('finds both when both exist', () => {
    writeFileSync(join(dir, '.mcp.json'), '{}');
    mkdirSync(join(dir, '.vscode'));
    writeFileSync(join(dir, '.vscode', 'mcp.json'), '{}');
    expect(discoverProjectConfigPaths(dir)).toHaveLength(2);
  });
});
