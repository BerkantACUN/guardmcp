import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { globalConfigCandidatePaths } from '../platform-paths.js';

/**
 * Existing global (Claude Desktop / Cursor / Windsurf) config files on this
 * machine. Defaults to the real platform/home/env; parameters exist so
 * tests can inject a fake filesystem-adjacent environment without touching
 * the actual OS.
 */
export function discoverGlobalConfigPaths(
  platform: NodeJS.Platform = process.platform,
  home: string = homedir(),
  env: Readonly<Record<string, string | undefined>> = process.env,
): string[] {
  return globalConfigCandidatePaths(platform, home, env).filter((path) => existsSync(path));
}
