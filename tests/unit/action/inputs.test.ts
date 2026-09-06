import { describe, expect, it } from 'vitest';
import { splitIds, splitPaths } from '../../../action/inputs.js';

describe('splitPaths', () => {
  it('keeps a single path containing spaces intact', () => {
    // The bug this guards: a repo checked out to "C:\...\Polly Lib\..." (or
    // any self-hosted runner workspace with a space) was split mid-path and
    // every scan failed with ENOENT. GitHub-hosted runners have no space in
    // /home/runner/work/<repo>/<repo>, which is why it went unseen in CI.
    expect(splitPaths('C:Usersa bproject.mcp.json')).toEqual(['C:Usersa bproject.mcp.json']);
  });

  it('splits on newlines — the GitHub Actions convention for multi-value inputs', () => {
    expect(splitPaths('.mcp.json\n.vscode/mcp.json')).toEqual(['.mcp.json', '.vscode/mcp.json']);
  });

  it('splits on commas', () => {
    expect(splitPaths('.mcp.json,.vscode/mcp.json')).toEqual(['.mcp.json', '.vscode/mcp.json']);
  });

  it('trims surrounding whitespace on each entry without splitting inside one', () => {
    expect(splitPaths('  a b.json  \n  c d.json  ')).toEqual(['a b.json', 'c d.json']);
  });

  it('drops blank entries', () => {
    expect(splitPaths('a.json\n\n\nb.json\n')).toEqual(['a.json', 'b.json']);
  });

  it('returns an empty list for empty input', () => {
    expect(splitPaths('')).toEqual([]);
    expect(splitPaths('   \n  ')).toEqual([]);
  });
});

describe('splitIds', () => {
  it('splits rule ids on commas and whitespace alike', () => {
    // Unlike paths, a rule id can never contain a space, so the looser split
    // is safe here and keeps `rules: "MCPG-101 MCPG-105"` working.
    expect(splitIds('MCPG-101,MCPG-105')).toEqual(['MCPG-101', 'MCPG-105']);
    expect(splitIds('MCPG-101 MCPG-105')).toEqual(['MCPG-101', 'MCPG-105']);
    expect(splitIds('MCPG-101,\n MCPG-105')).toEqual(['MCPG-101', 'MCPG-105']);
  });

  it('returns an empty list for empty input', () => {
    expect(splitIds('')).toEqual([]);
  });
});
