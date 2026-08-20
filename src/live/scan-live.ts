import type { Finding } from '../core/finding.js';
import { isStdioServerDef } from '../model/mcp-server-def.js';
import type { ScanTarget } from '../model/scan-target.js';
import { serverKey } from '../model/server-key.js';
import type { ToolDefinition } from '../model/tool-definition.js';
import type { ToolRule } from '../rules/poisoning/types.js';
import { DEFAULT_LIVE_TIMEOUT_MS, introspectStdioServer } from './introspect.js';

export interface LiveScanOptions {
  readonly timeoutMs?: number;
}

export interface LiveScanOutcome {
  /** Successfully introspected tools, keyed by serverKey(target.relativePath, serverName) — Phase 3 rug-pull pinning (src/pin) compares against this per-server. */
  readonly toolsByServerKey: ReadonlyMap<string, readonly ToolDefinition[]>;
  /** Every successfully introspected tool, flattened — what cross-server ToolRules (e.g. tool-shadowing) need to compare against each other. */
  readonly allTools: readonly ToolDefinition[];
  /** Human-readable, non-fatal problems (unsupported transport, connect failure, timeout) — one server failing must never abort the rest of the scan. */
  readonly warnings: readonly string[];
  /**
   * Total stdio servers this call attempted to connect to (successes +
   * failures, excludes skipped non-stdio ones). Callers print this
   * unconditionally — see SECURITY.md's transparency guarantee for --live:
   * a user must always be able to see that guardmcp actually connected out
   * to real processes, not only when something went wrong.
   */
  readonly serversAttempted: number;
}

/**
 * Introspects every stdio-launched server across all scanned targets in
 * parallel and returns their live tool lists. Remote (HTTP/SSE) servers are
 * skipped with a warning — not yet supported (see docs/planning
 * §6 Faz 3) — rather than silently ignored or a hard failure.
 */
export async function runLiveIntrospection(
  targets: readonly ScanTarget[],
  options: LiveScanOptions = {},
): Promise<LiveScanOutcome> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_LIVE_TIMEOUT_MS;
  const warnings: string[] = [];

  interface Job {
    readonly key: string;
    readonly serverName: string;
  }
  const jobs: Array<{ job: Job; promise: ReturnType<typeof introspectStdioServer> }> = [];

  for (const target of targets) {
    const servers = target.config.mcpServers ?? {};
    for (const [serverName, def] of Object.entries(servers)) {
      const key = serverKey(target.relativePath, serverName);
      if (!isStdioServerDef(def)) {
        warnings.push(
          `Skipping live introspection of "${serverName}" in ${target.relativePath}: only stdio-launched servers are supported by --live today (remote/HTTP support is planned).`,
        );
        continue;
      }
      jobs.push({
        job: { key, serverName },
        promise: introspectStdioServer(serverName, def, { timeoutMs }),
      });
    }
  }

  const outcomes = await Promise.all(jobs.map((j) => j.promise));

  const toolsByServerKey = new Map<string, readonly ToolDefinition[]>();
  const allTools: ToolDefinition[] = [];
  outcomes.forEach((outcome, i) => {
    const { key, serverName } = jobs[i]?.job ?? { key: '', serverName: '' };
    if (!outcome.ok) {
      warnings.push(`Live introspection of "${serverName}" failed: ${outcome.error}`);
      return;
    }
    toolsByServerKey.set(key, outcome.tools);
    allTools.push(...outcome.tools);
  });

  return { toolsByServerKey, allTools, warnings, serversAttempted: jobs.length };
}

/** Runs every ToolRule against every live-introspected tool, comparing each
 * tool against the FULL cross-server tool set (`allTools`) — required by
 * MCPG-203 tool-shadowing, which flags a tool that mimics another server's
 * tool name. */
export function runToolRules(
  allTools: readonly ToolDefinition[],
  rules: readonly ToolRule[],
): Finding[] {
  const findings: Finding[] = [];
  for (const tool of allTools) {
    for (const rule of rules) {
      findings.push(...rule.check(tool, allTools));
    }
  }
  return findings;
}
