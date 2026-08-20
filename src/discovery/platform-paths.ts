import { posix, win32 } from 'node:path';

type Env = Readonly<Record<string, string | undefined>>;

/**
 * Candidate global (machine-wide, not project-scoped) MCP config paths for
 * Claude Desktop, Cursor, and Windsurf, across Windows/macOS/Linux. VS Code's
 * MCP support is project-scoped (.vscode/mcp.json — see
 * discovery/locators/project.ts) plus a user-profile location we don't yet
 * cover; Claude Code's own config lives under ~/.claude, out of scope here
 * since it's not a distinct *client* to scan for.
 *
 * Deliberately over-inclusive: some paths below are unconfirmed for one OS
 * or the other (community docs disagree, e.g. on exactly where Windsurf
 * keeps its config on Windows vs macOS) or depend on install method (the
 * MSIX/Store build of Claude Desktop uses a different Windows path than the
 * regular installer). Every path here is filtered down to ones that
 * actually exist on disk by the caller (see locators/global.ts) — an extra
 * wrong guess costs one stat() call; a missing right one costs a user's
 * entire client silently going unscanned.
 *
 * Takes platform/home/env as explicit parameters (not read from
 * process.platform / os.homedir() / process.env internally) so this stays a
 * pure function — testable for all three OSes from one test run instead of
 * only whichever OS CI happens to execute on. Uses path.win32/path.posix
 * explicitly rather than the ambient `join`, which always uses the HOST
 * OS's separator regardless of the `platform` argument — building a
 * "darwin" path while actually running on Windows needs posix.join, not
 * plain join() (a real bug this file's own tests caught).
 */
export function globalConfigCandidatePaths(
  platform: NodeJS.Platform,
  home: string,
  env: Env,
): string[] {
  const paths: string[] = [
    ...claudeDesktopPaths(platform, home, env),
    ...cursorPaths(platform, home),
    ...windsurfPaths(platform, home, env),
  ];
  return [...new Set(paths)].filter((p) => p.length > 0);
}

function claudeDesktopPaths(platform: NodeJS.Platform, home: string, env: Env): string[] {
  switch (platform) {
    case 'win32': {
      const appData = env.APPDATA ?? win32.join(home, 'AppData', 'Roaming');
      return [
        win32.join(appData, 'Claude', 'claude_desktop_config.json'),
        // MSIX/Microsoft Store install uses an isolated per-app package path.
        win32.join(
          home,
          'AppData',
          'Local',
          'Packages',
          'Claude_pzs8sxrjxfjjc',
          'LocalCache',
          'Roaming',
          'Claude',
          'claude_desktop_config.json',
        ),
      ];
    }
    case 'darwin':
      return [
        posix.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
      ];
    default:
      return [
        posix.join(home, '.config', 'claude-desktop', 'claude_desktop_config.json'),
        posix.join(home, '.config', 'Claude', 'claude_desktop_config.json'),
      ];
  }
}

function cursorPaths(platform: NodeJS.Platform, home: string): string[] {
  // Same relative layout on every OS.
  const impl = platform === 'win32' ? win32 : posix;
  return [impl.join(home, '.cursor', 'mcp.json')];
}

function windsurfPaths(platform: NodeJS.Platform, home: string, env: Env): string[] {
  if (platform === 'win32') {
    const appData = env.APPDATA ?? win32.join(home, 'AppData', 'Roaming');
    return [
      win32.join(home, '.codeium', 'windsurf', 'mcp_config.json'),
      win32.join(appData, 'Windsurf', 'mcp.json'),
    ];
  }
  if (platform === 'darwin') {
    return [
      posix.join(home, '.codeium', 'windsurf', 'mcp_config.json'),
      posix.join(home, 'Library', 'Application Support', 'Windsurf', 'mcp.json'),
    ];
  }
  return [posix.join(home, '.codeium', 'windsurf', 'mcp_config.json')];
}
