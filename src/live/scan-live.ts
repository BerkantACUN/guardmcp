import type { ServerCapabilities } from '@modelcontextprotocol/sdk/types.js';
import type { Finding } from '../core/finding.js';
import { isHttpServerDef, isStdioServerDef } from '../model/mcp-server-def.js';
import type { PromptDefinition } from '../model/prompt-definition.js';
import type {
  ResourceDefinition,
  ResourceTemplateDefinition,
} from '../model/resource-definition.js';
import type { ScanTarget } from '../model/scan-target.js';
import { serverKey } from '../model/server-key.js';
import type { ToolDefinition } from '../model/tool-definition.js';
import { sanitizeForDisplay } from '../report/sanitize.js';
import type { ToolRule } from '../rules/poisoning/types.js';
import type { PromptRule } from '../rules/prompts/types.js';
import type { ResourceRule } from '../rules/resources/types.js';
import {
  DEFAULT_LIVE_TIMEOUT_MS,
  introspectHttpServer,
  introspectStdioServer,
} from './introspect.js';

export interface LiveScanOptions {
  readonly timeoutMs?: number;
  /** Passed through to the connect policy — see live/connect-policy.ts. */
  readonly allowUnsafeRemote?: boolean;
}

export interface LiveScanOutcome {
  /** Successfully introspected tools, keyed by serverKey(target.relativePath, serverName) — Phase 3 rug-pull pinning (src/pin) compares against this per-server. */
  readonly toolsByServerKey: ReadonlyMap<string, readonly ToolDefinition[]>;
  /** Every successfully introspected tool, flattened — what cross-server ToolRules (e.g. tool-shadowing) need to compare against each other. */
  readonly allTools: readonly ToolDefinition[];
  /** Every successfully introspected prompt, flattened. Empty for the common
   * case of servers that advertise tools only. */
  readonly allPrompts: readonly PromptDefinition[];
  /** Every successfully introspected resource, flattened. */
  readonly allResources: readonly ResourceDefinition[];
  /** Prompts and resources keyed the same way tools are. Two configs can
   * declare the same server name, so grouping by name alone would merge
   * them — `guardmcp inventory` needs them kept apart. */
  readonly promptsByServerKey: ReadonlyMap<string, readonly PromptDefinition[]>;
  readonly resourcesByServerKey: ReadonlyMap<string, readonly ResourceDefinition[]>;
  /** Why a given server could not be introspected, keyed the same way. */
  readonly errorsByServerKey: ReadonlyMap<string, string>;
  /** Every resource template advertised across all servers, flattened. */
  readonly allResourceTemplates: readonly ResourceTemplateDefinition[];
  /** What each server declared at `initialize`. MCPG-702 reads `logging`. */
  readonly capabilitiesByServerKey: ReadonlyMap<string, ServerCapabilities>;
  /** Human-readable, non-fatal problems (unsupported transport, connect failure, timeout) — one server failing must never abort the rest of the scan. */
  readonly warnings: readonly string[];
  /**
   * Total servers this call attempted to connect to, stdio and remote alike
   * (successes + failures). Callers print this
   * unconditionally — see SECURITY.md's transparency guarantee for --live:
   * a user must always be able to see that guardmcp actually connected out
   * to real processes, not only when something went wrong.
   */
  readonly serversAttempted: number;
}

/**
 * Introspects every server across all scanned targets in parallel — stdio by
 * spawning its launch command, remote by dialling its endpoint over
 * Streamable HTTP. A server that fails is recorded as a warning, never as a
 * scan-wide failure: one unreachable server must not hide the findings from
 * every other one that answered.
 *
 * Remote endpoints go through live/connect-policy.ts first, which refuses the
 * private/metadata and cleartext-with-credentials cases that MCPG-403 and
 * MCPG-401 exist to report. `--live` is where a finding becomes an action
 * this process takes, and guardmcp does not take the action it warns about.
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
      const introspectOptions = {
        timeoutMs,
        ...(options.allowUnsafeRemote === true ? { allowUnsafeRemote: true } : {}),
      };

      if (isStdioServerDef(def)) {
        jobs.push({
          job: { key, serverName },
          promise: introspectStdioServer(serverName, def, introspectOptions),
        });
        continue;
      }

      if (isHttpServerDef(def)) {
        jobs.push({
          job: { key, serverName },
          promise: introspectHttpServer(serverName, def, introspectOptions),
        });
        continue;
      }

      warnings.push(
        `Skipping live introspection of "${serverName}" in ${target.relativePath}: its definition is neither a stdio launcher nor an HTTP endpoint.`,
      );
    }
  }

  const outcomes = await Promise.all(jobs.map((j) => j.promise));

  const toolsByServerKey = new Map<string, readonly ToolDefinition[]>();
  const allTools: ToolDefinition[] = [];
  const allPrompts: PromptDefinition[] = [];
  const allResources: ResourceDefinition[] = [];
  const promptsByServerKey = new Map<string, readonly PromptDefinition[]>();
  const resourcesByServerKey = new Map<string, readonly ResourceDefinition[]>();
  const errorsByServerKey = new Map<string, string>();
  const allResourceTemplates: ResourceTemplateDefinition[] = [];
  const capabilitiesByServerKey = new Map<string, ServerCapabilities>();
  outcomes.forEach((outcome, i) => {
    const { key, serverName } = jobs[i]?.job ?? { key: '', serverName: '' };
    if (!outcome.ok) {
      // outcome.error may echo back text from the connection attempt (a
      // malicious/misbehaving server's own JSON-RPC error message) —
      // sanitized before it reaches a terminal via stderr, same rationale
      // as report/formatters/human.ts.
      warnings.push(
        `Live introspection of "${serverName}" failed: ${sanitizeForDisplay(outcome.error)}`,
      );
      errorsByServerKey.set(key, outcome.error);
      return;
    }
    toolsByServerKey.set(key, outcome.tools);
    allTools.push(...outcome.tools);
    allPrompts.push(...outcome.prompts);
    allResources.push(...outcome.resources);
    promptsByServerKey.set(key, outcome.prompts);
    resourcesByServerKey.set(key, outcome.resources);
    allResourceTemplates.push(...outcome.resourceTemplates);
    if (outcome.capabilities) capabilitiesByServerKey.set(key, outcome.capabilities);
  });

  return {
    toolsByServerKey,
    allTools,
    allPrompts,
    allResources,
    promptsByServerKey,
    resourcesByServerKey,
    errorsByServerKey,
    allResourceTemplates,
    capabilitiesByServerKey,
    warnings,
    serversAttempted: jobs.length,
  };
}

/** Runs every ToolRule against every live-introspected tool, comparing each
 * tool against the FULL cross-server tool set (`allTools`) — required by
 * MCPG-203 tool-shadowing, which flags a tool that mimics another server's
 * tool name. */
/** Runs every PromptRule against every live-introspected prompt. Passed the
 * full set for symmetry with runToolRules — no prompt rule compares across
 * servers yet, but the shadowing question (a prompt mimicking another
 * server's) is the same shape as MCPG-203 and will want it. */
export function runPromptRules(
  allPrompts: readonly PromptDefinition[],
  rules: readonly PromptRule[],
): Finding[] {
  const findings: Finding[] = [];
  for (const prompt of allPrompts) {
    for (const rule of rules) {
      findings.push(...rule.check(prompt, allPrompts));
    }
  }
  return findings;
}

/** Runs every ResourceRule against every live-introspected resource. */
export function runResourceRules(
  allResources: readonly ResourceDefinition[],
  rules: readonly ResourceRule[],
): Finding[] {
  const findings: Finding[] = [];
  for (const resource of allResources) {
    for (const rule of rules) {
      findings.push(...rule.check(resource, allResources));
    }
  }
  return findings;
}

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
