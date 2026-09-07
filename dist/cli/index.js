#!/usr/bin/env node

// src/cli/index.ts
import { existsSync as existsSync4, writeFileSync as writeFileSync3 } from "fs";
import { pathToFileURL } from "url";
import { Command } from "commander";
import pc5 from "picocolors";

// src/discovery/index.ts
import { readFileSync } from "fs";
import { relative } from "path";

// src/model/mcp-server-def.ts
import { z } from "zod";
var StdioServerDefSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional()
});
var HttpServerDefSchema = z.object({
  type: z.literal("http").optional(),
  url: z.string(),
  headers: z.record(z.string(), z.string()).optional()
});
var McpServerDefSchema = z.union([StdioServerDefSchema, HttpServerDefSchema]);
var McpConfigFileSchema = z.object({
  mcpServers: z.record(z.string(), McpServerDefSchema).optional()
});
function isStdioServerDef(def) {
  return "command" in def;
}
function isHttpServerDef(def) {
  return "url" in def;
}
function normalizeRawConfig(raw) {
  if (typeof raw !== "object" || raw === null) return {};
  const obj = raw;
  if (obj.mcpServers !== void 0) return { mcpServers: obj.mcpServers };
  if (obj.servers !== void 0) return { mcpServers: obj.servers };
  return {};
}

// src/parsers/jsonc-document.ts
import {
  findNodeAtLocation,
  getNodeValue,
  parse,
  parseTree
} from "jsonc-parser";
function parseJsoncDocument(text) {
  const root = parseTree(text);
  const lineStarts = buildLineStarts(text);
  return {
    getValue() {
      return parse(text);
    },
    locate(path) {
      if (!root) return void 0;
      const node = findNodeAtLocation(root, path);
      if (!node) return void 0;
      return nodeToRange(node, lineStarts);
    }
  };
}
function nodeToRange(node, lineStarts) {
  const start = offsetToPosition(lineStarts, node.offset);
  const end = offsetToPosition(lineStarts, node.offset + node.length);
  return { line: start.line, column: start.column, endLine: end.line, endColumn: end.column };
}
function buildLineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") starts.push(i + 1);
  }
  return starts;
}
function offsetToPosition(lineStarts, offset) {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (lineStarts[mid] <= offset) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return { line: lo + 1, column: offset - lineStarts[lo] + 1 };
}

// src/discovery/locators/global.ts
import { existsSync } from "fs";
import { homedir } from "os";

// src/discovery/platform-paths.ts
import { posix, win32 } from "path";
function globalConfigCandidatePaths(platform, home, env) {
  const paths = [
    ...claudeDesktopPaths(platform, home, env),
    ...cursorPaths(platform, home),
    ...windsurfPaths(platform, home, env)
  ];
  return [...new Set(paths)].filter((p) => p.length > 0);
}
function claudeDesktopPaths(platform, home, env) {
  switch (platform) {
    case "win32": {
      const appData = env.APPDATA ?? win32.join(home, "AppData", "Roaming");
      return [
        win32.join(appData, "Claude", "claude_desktop_config.json"),
        // MSIX/Microsoft Store install uses an isolated per-app package path.
        win32.join(
          home,
          "AppData",
          "Local",
          "Packages",
          "Claude_pzs8sxrjxfjjc",
          "LocalCache",
          "Roaming",
          "Claude",
          "claude_desktop_config.json"
        )
      ];
    }
    case "darwin":
      return [
        posix.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json")
      ];
    default:
      return [
        posix.join(home, ".config", "claude-desktop", "claude_desktop_config.json"),
        posix.join(home, ".config", "Claude", "claude_desktop_config.json")
      ];
  }
}
function cursorPaths(platform, home) {
  const impl = platform === "win32" ? win32 : posix;
  return [impl.join(home, ".cursor", "mcp.json")];
}
function windsurfPaths(platform, home, env) {
  if (platform === "win32") {
    const appData = env.APPDATA ?? win32.join(home, "AppData", "Roaming");
    return [
      win32.join(home, ".codeium", "windsurf", "mcp_config.json"),
      win32.join(appData, "Windsurf", "mcp.json")
    ];
  }
  if (platform === "darwin") {
    return [
      posix.join(home, ".codeium", "windsurf", "mcp_config.json"),
      posix.join(home, "Library", "Application Support", "Windsurf", "mcp.json")
    ];
  }
  return [posix.join(home, ".codeium", "windsurf", "mcp_config.json")];
}

// src/discovery/locators/global.ts
function discoverGlobalConfigPaths(platform = process.platform, home = homedir(), env = process.env) {
  return globalConfigCandidatePaths(platform, home, env).filter((path) => existsSync(path));
}

// src/discovery/locators/project.ts
import { existsSync as existsSync2 } from "fs";
import { join } from "path";
function discoverProjectConfigPaths(cwd) {
  const candidates = [join(cwd, ".mcp.json"), join(cwd, ".vscode", "mcp.json")];
  return candidates.filter((path) => existsSync2(path));
}

// src/discovery/index.ts
var ScanTargetLoadError = class extends Error {
  constructor(filePath, cause) {
    super(`Failed to load MCP config at ${filePath}: ${errorMessage(cause)}`, { cause });
    this.filePath = filePath;
    this.name = "ScanTargetLoadError";
  }
  filePath;
};
function loadScanTarget(filePath, cwd, scope = "explicit") {
  let text;
  try {
    text = readFileSync(filePath, "utf-8");
  } catch (err) {
    throw new ScanTargetLoadError(filePath, err);
  }
  const rawDocument = parseJsoncDocument(text);
  const raw = rawDocument.getValue();
  const normalized = normalizeRawConfig(raw);
  const result = McpConfigFileSchema.safeParse(normalized);
  if (!result.success) {
    throw new ScanTargetLoadError(filePath, result.error);
  }
  const rootKeyOnDisk = typeof raw === "object" && raw !== null && "servers" in raw ? "servers" : "mcpServers";
  const document = {
    getValue: () => rawDocument.getValue(),
    locate: (path) => {
      if (path[0] === "mcpServers" && rootKeyOnDisk !== "mcpServers") {
        return rawDocument.locate([rootKeyOnDisk, ...path.slice(1)]);
      }
      return rawDocument.locate(path);
    }
  };
  return {
    kind: "config-file",
    scope,
    filePath,
    relativePath: relative(cwd, filePath) || filePath,
    document,
    config: result.data
  };
}
function errorMessage(err) {
  return err instanceof Error ? err.message : String(err);
}

// src/package-info.ts
import { createRequire } from "module";
import { dirname, join as join2 } from "path";
import { fileURLToPath } from "url";
function findPackageJson(startDir) {
  const require2 = createRequire(import.meta.url);
  let dir = startDir;
  for (let i = 0; i < 6; i++) {
    try {
      return require2(join2(dir, "package.json"));
    } catch {
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  throw new Error(`Could not locate package.json by walking up from ${startDir}`);
}
var pkg = findPackageJson(dirname(fileURLToPath(import.meta.url)));
var PACKAGE_NAME = pkg.name;
var PACKAGE_VERSION = pkg.version;
var PACKAGE_DESCRIPTION = pkg.description;
var PACKAGE_HOMEPAGE = "https://github.com/BerkantACUN/guardmcp";

// src/pin/io.ts
import { readFileSync as readFileSync2, writeFileSync } from "fs";
import { join as join3 } from "path";

// src/pin/lockfile-schema.ts
import { z as z2 } from "zod";
var LOCK_FILE_VERSION = "1";
var LockedServerEntrySchema = z2.object({
  /** Hash of the server's static launch definition (command/args or url) — see definition-hash.ts. */
  definitionHash: z2.string(),
  /** Hash of the server's real advertised tools, present only when this
   * server was pinned with `--live` — see tools-hash.ts. */
  toolsHash: z2.string().optional()
});
var LockFileSchema = z2.object({
  version: z2.string(),
  generatedAt: z2.string(),
  servers: z2.record(z2.string(), LockedServerEntrySchema)
});

// src/pin/io.ts
var LockFileLoadError = class extends Error {
  constructor(filePath, cause) {
    super(`Failed to load lock file at ${filePath}: ${errorMessage2(cause)}`, { cause });
    this.name = "LockFileLoadError";
  }
};
function loadLockFile(filePath) {
  let raw;
  try {
    raw = JSON.parse(readFileSync2(filePath, "utf-8"));
  } catch (err) {
    throw new LockFileLoadError(filePath, err);
  }
  const result = LockFileSchema.safeParse(raw);
  if (!result.success) {
    throw new LockFileLoadError(filePath, result.error);
  }
  if (result.data.version !== LOCK_FILE_VERSION) {
    throw new LockFileLoadError(
      filePath,
      new Error(
        `Lock file version "${result.data.version}" is not supported (expected "${LOCK_FILE_VERSION}"). Re-run "guardmcp pin" to regenerate it.`
      )
    );
  }
  return result.data;
}
function writeLockFile(filePath, lock) {
  writeFileSync(filePath, `${JSON.stringify(lock, null, 2)}
`, "utf-8");
}
function defaultLockFilePath(cwd) {
  return join3(cwd, ".mcpguard-lock.json");
}
function errorMessage2(err) {
  return err instanceof Error ? err.message : String(err);
}

// src/cli/commands/init.ts
import { existsSync as existsSync3, mkdirSync, writeFileSync as writeFileSync2 } from "fs";
import { dirname as dirname2, join as join4 } from "path";

// src/cli/exit-codes.ts
var EXIT_CODES = {
  clean: 0,
  findingsAtOrAboveThreshold: 1,
  toolError: 2,
  liveConnectionError: 3
};

// src/cli/commands/init.ts
var WORKFLOW_PATH = ".github/workflows/guardmcp.yml";
function workflow(failOn) {
  return `# Generated by \`guardmcp init\` (v${PACKAGE_VERSION}).
# Scans this repository's MCP server configs on every push and pull request,
# and uploads the results to GitHub Code Scanning.
name: guardmcp

on:
  push:
    branches: [main, master]
  pull_request:
  # Configs change when dependencies do, not only when someone edits them \u2014
  # a weekly run catches a server that started advertising something new.
  schedule:
    - cron: '0 6 * * 1'

permissions:
  contents: read
  # Required to upload the SARIF report; without it the scan runs but the
  # findings never reach the Security tab.
  security-events: write

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Scan MCP configs
        id: guardmcp
        uses: BerkantACUN/guardmcp@v${PACKAGE_VERSION}
        with:
          fail-on: ${failOn}
          sarif-output: guardmcp-results.sarif
        # Upload the SARIF even when the scan fails the build, so the findings
        # are readable in the Security tab rather than only in the job log.
        continue-on-error: true

      - name: Upload SARIF
        uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: guardmcp-results.sarif
          category: guardmcp

      - name: Fail if guardmcp found issues
        if: steps.guardmcp.outcome == 'failure'
        run: exit 1
`;
}
function runInitCommand(options) {
  const failOn = options.failOn ?? "high";
  const target = join4(options.cwd, WORKFLOW_PATH);
  if (existsSync3(target) && options.force !== true) {
    options.stderr(`${WORKFLOW_PATH} already exists. Re-run with --force to overwrite it.`);
    return EXIT_CODES.toolError;
  }
  mkdirSync(dirname2(target), { recursive: true });
  writeFileSync2(target, workflow(failOn), "utf-8");
  options.stdout(
    [
      `Wrote ${WORKFLOW_PATH}`,
      "",
      "It scans on every push and pull request, uploads findings to the Security",
      `tab, and fails the build at severity "${failOn}" or above.`,
      "",
      "Two things it deliberately does not do, which you may want:",
      "  --live   connects to each server and scans its real tools, prompts and",
      "           resources. It spawns their launch commands, so enabling it is",
      "           your call, not a generator's.",
      "  pin      run `guardmcp pin` and commit .mcpguard-lock.json to turn on",
      "           rug-pull detection (MCPG-501/502).",
      ""
    ].join("\n")
  );
  return EXIT_CODES.clean;
}

// src/discovery/resolve-targets.ts
function resolveScanTargets(paths, cwd, globalConfigPaths = []) {
  const explicitPaths = paths.length > 0;
  const candidates = explicitPaths ? paths.map((path) => [path, "explicit"]) : dedupeByPath([
    ...discoverProjectConfigPaths(cwd).map((path) => [path, "project"]),
    ...globalConfigPaths.map((path) => [path, "global"])
  ]);
  const candidatePaths = candidates.map(([path]) => path);
  const targets = [];
  const warnings = [];
  for (const [path, scope] of candidates) {
    try {
      targets.push(loadScanTarget(path, cwd, scope));
    } catch (err) {
      warnings.push(err instanceof Error ? err.message : String(err));
    }
  }
  return { targets, warnings, hadCandidates: candidatePaths.length > 0 };
}
function dedupeByPath(entries) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const entry of entries) {
    if (seen.has(entry[0])) continue;
    seen.add(entry[0]);
    out.push(entry);
  }
  return out;
}

// src/inventory/format.ts
import pc from "picocolors";

// src/report/sanitize.ts
function sanitizeForDisplay(text) {
  let result = "";
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    const isControlChar = code <= 31 || code === 127;
    if (!isControlChar) {
      result += ch;
    } else if (ch === "\n" || ch === "	") {
      result += " ";
    }
  }
  return result;
}

// src/inventory/model.ts
function inventoryTotals(inventory) {
  let servers = 0;
  let tools = 0;
  let prompts = 0;
  let resources = 0;
  for (const config of inventory.configs) {
    servers += config.servers.length;
    for (const server of config.servers) {
      tools += server.surfaces?.tools.length ?? 0;
      prompts += server.surfaces?.prompts.length ?? 0;
      resources += server.surfaces?.resources.length ?? 0;
    }
  }
  return { configs: inventory.configs.length, servers, tools, prompts, resources };
}

// src/inventory/format.ts
function formatInventoryHuman(inventory) {
  const totals = inventoryTotals(inventory);
  if (totals.configs === 0) {
    return "No MCP config files found.\n";
  }
  const lines = [];
  for (const config of inventory.configs) {
    lines.push(`${pc.bold(config.relativePath)}  ${pc.dim(`(${config.scope})`)}`);
    if (config.servers.length === 0) {
      lines.push(pc.dim("  (no servers declared)"));
    }
    for (const server of config.servers) {
      lines.push(
        `  ${pc.bold(sanitizeForDisplay(server.name))}  ${pc.dim(server.transport)}  ${pc.dim(
          sanitizeForDisplay(server.launch)
        )}`
      );
      lines.push(...surfaceLines(server, inventory.live));
    }
    lines.push("");
  }
  lines.push(summary(totals, inventory.live));
  return `${lines.join("\n")}
`;
}
function surfaceLines(server, live) {
  if (server.error !== void 0) {
    return [pc.yellow(`    could not connect \u2014 ${sanitizeForDisplay(server.error)}`)];
  }
  if (!server.surfaces) {
    return live ? [pc.dim("    not introspected")] : [];
  }
  const rows = [];
  for (const [label, names] of [
    ["tools", server.surfaces.tools],
    ["prompts", server.surfaces.prompts],
    ["resources", server.surfaces.resources]
  ]) {
    if (names.length === 0) continue;
    const shown = names.slice(0, 6).map(sanitizeForDisplay).join(", ");
    const more = names.length > 6 ? pc.dim(` +${names.length - 6} more`) : "";
    rows.push(`    ${label.padEnd(10)} ${String(names.length).padStart(3)}  ${shown}${more}`);
  }
  if (rows.length === 0) rows.push(pc.dim("    advertises nothing"));
  return rows;
}
function summary(totals, live) {
  const head = `${plural(totals.servers, "server")} across ${plural(totals.configs, "config")}`;
  if (!live) {
    return `${head}
${pc.dim("Run with --live to list the tools, prompts and resources each server actually advertises.")}`;
  }
  return `${head} \u2014 ${plural(totals.tools, "tool")}, ${plural(totals.prompts, "prompt")}, ${plural(
    totals.resources,
    "resource"
  )}`;
}
function plural(count, noun) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
function formatInventoryJson(inventory) {
  return `${JSON.stringify(
    { live: inventory.live, totals: inventoryTotals(inventory), configs: inventory.configs },
    null,
    2
  )}
`;
}

// src/live/introspect.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// src/detectors/url-risk.ts
function isLoopbackHost(host) {
  const h = host.toLowerCase();
  return h === "localhost" || h === "::1" || h.startsWith("127.");
}
var IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
function isPrivateOrMetadataHost(host) {
  const h = host.toLowerCase();
  if (h === "169.254.169.254") return true;
  if (h === "0.0.0.0") return true;
  if (h.endsWith(".internal")) return true;
  const match = IPV4.exec(h);
  if (!match) return false;
  const [, aStr, bStr] = match;
  const a = Number(aStr);
  const b = Number(bStr);
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

// src/live/connect-policy.ts
var CREDENTIAL_HEADER = /(^|-)(authorization|cookie|token|key|secret|password|auth)(-|$)/i;
function carriesCredentials(headers) {
  if (!headers) return false;
  return Object.keys(headers).some((name) => CREDENTIAL_HEADER.test(name));
}
function refuseRemoteConnection(url, headers, allowUnsafe) {
  if (allowUnsafe) return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { reason: `"${url}" is not a URL guardmcp can parse, so it will not be dialled.` };
  }
  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== "http:" && protocol !== "https:") {
    return {
      reason: `the scheme "${parsed.protocol.replace(":", "")}" is not an MCP HTTP transport; only http and https are dialled.`
    };
  }
  const host = parsed.hostname;
  if (!isLoopbackHost(host) && isPrivateOrMetadataHost(host)) {
    return {
      reason: `"${host}" is a private-network or cloud-metadata address. Connecting would make guardmcp itself issue a request to internal infrastructure \u2014 the thing MCPG-403 exists to report. Re-run with --live-allow-unsafe if this is your own internal server.`
    };
  }
  if (protocol === "http:" && !isLoopbackHost(host) && carriesCredentials(headers)) {
    return {
      reason: `this endpoint is unencrypted http:// and the config attaches credential headers to it. Connecting would transmit your own credentials in the clear \u2014 the thing MCPG-401 exists to report. Fix the URL, or re-run with --live-allow-unsafe if you accept that.`
    };
  }
  return null;
}

// src/live/to-prompt-definition.ts
function toPromptDefinition(serverName, prompt) {
  return {
    serverName,
    name: prompt.name,
    // Rules scan description text unconditionally; normalising the absent
    // case here means no rule needs its own undefined guard.
    description: prompt.description ?? "",
    arguments: (prompt.arguments ?? []).map(toArgument)
  };
}
function toArgument(arg) {
  return {
    name: arg.name,
    ...arg.description !== void 0 ? { description: arg.description } : {}
  };
}

// src/live/to-resource-definition.ts
function toResourceDefinition(serverName, resource) {
  return {
    serverName,
    // A resource's name is optional in the protocol; the URI is not. Falling
    // back to it keeps every finding able to say WHICH resource it means.
    name: resource.name ?? resource.uri,
    uri: resource.uri,
    description: resource.description ?? "",
    ...resource.mimeType !== void 0 ? { mimeType: resource.mimeType } : {}
  };
}
function toResourceTemplateDefinition(serverName, template) {
  return {
    serverName,
    name: template.name ?? template.uriTemplate,
    uriTemplate: template.uriTemplate,
    description: template.description ?? "",
    ...template.mimeType !== void 0 ? { mimeType: template.mimeType } : {}
  };
}

// src/live/to-tool-definition.ts
function toToolDefinition(serverName, tool) {
  return {
    serverName,
    name: tool.name,
    ...typeof tool.title === "string" ? { title: tool.title } : {},
    description: tool.description ?? "",
    ...tool.inputSchema ? { inputSchema: { properties: mapProperties(tool.inputSchema) } } : {},
    ...tool.annotations ? { annotations: mapAnnotations(tool.annotations) } : {}
  };
}
function mapProperties(inputSchema) {
  const properties = inputSchema.properties ?? {};
  const result = {};
  for (const [key, value] of Object.entries(properties)) {
    result[key] = mapProperty(value);
  }
  return result;
}
function mapProperty(raw) {
  return {
    ...typeof raw.type === "string" ? { type: raw.type } : {},
    ...typeof raw.description === "string" ? { description: raw.description } : {},
    ...Array.isArray(raw.enum) ? { enum: raw.enum } : {},
    ...typeof raw.pattern === "string" ? { pattern: raw.pattern } : {},
    ...typeof raw.maxLength === "number" ? { maxLength: raw.maxLength } : {},
    // Kept as the raw declared value, NOT validated here: MCPG-802 needs to
    // see an empty string or one carrying a CRLF exactly as the server sent
    // it, because those are the finding.
    ...typeof raw["x-mcp-header"] === "string" ? { xMcpHeader: raw["x-mcp-header"] } : {}
  };
}
function mapAnnotations(annotations) {
  return {
    ...annotations.readOnlyHint !== void 0 ? { readOnlyHint: annotations.readOnlyHint } : {},
    ...annotations.destructiveHint !== void 0 ? { destructiveHint: annotations.destructiveHint } : {},
    ...annotations.idempotentHint !== void 0 ? { idempotentHint: annotations.idempotentHint } : {},
    ...annotations.openWorldHint !== void 0 ? { openWorldHint: annotations.openWorldHint } : {}
  };
}

// src/live/introspect.ts
var DEFAULT_LIVE_TIMEOUT_MS = 1e4;
async function introspectStdioServer(serverName, def, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_LIVE_TIMEOUT_MS;
  const transport = new StdioClientTransport({
    command: def.command,
    args: def.args ? [...def.args] : [],
    ...def.env ? { env: def.env } : {},
    // Discarding (rather than the SDK default of "inherit") keeps a noisy
    // server's stderr out of guardmcp's own output; we only care about
    // tools/list, not the server's diagnostic logging. Deliberately NOT
    // 'pipe': piping without a listener draining the stream risks a
    // full-buffer hang if a server writes a lot to stderr — 'ignore' has no
    // such risk since the OS just discards the writes.
    stderr: "ignore"
  });
  return introspectOverTransport(serverName, transport, timeoutMs);
}
async function introspectHttpServer(serverName, def, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_LIVE_TIMEOUT_MS;
  const refusal = refuseRemoteConnection(def.url, def.headers, options.allowUnsafeRemote === true);
  if (refusal) {
    return { ok: false, serverName, error: `refused to connect \u2014 ${refusal.reason}` };
  }
  const transport = new StreamableHTTPClientTransport(new URL(def.url), {
    // The config's own headers are forwarded so an authenticated server can
    // be introspected at all. They are never echoed into output; see
    // report/sanitize.ts and the redaction in the secret rules.
    ...def.headers ? { requestInit: { headers: { ...def.headers } } } : {}
  });
  return introspectOverTransport(serverName, transport, timeoutMs);
}
async function introspectOverTransport(serverName, transport, timeoutMs) {
  const client = new Client({ name: PACKAGE_NAME, version: PACKAGE_VERSION });
  try {
    const surfaces = await withTimeout(fetchSurfaces(client, transport, timeoutMs), timeoutMs);
    return {
      ok: true,
      serverName,
      tools: surfaces.tools.map((tool) => toToolDefinition(serverName, tool)),
      prompts: surfaces.prompts.map((prompt) => toPromptDefinition(serverName, prompt)),
      resources: surfaces.resources.map((resource) => toResourceDefinition(serverName, resource)),
      resourceTemplates: surfaces.resourceTemplates.map(
        (template) => toResourceTemplateDefinition(serverName, template)
      ),
      capabilities: surfaces.capabilities
    };
  } catch (err) {
    return { ok: false, serverName, error: errorMessage3(err) };
  } finally {
    await client.close().catch(() => {
    });
  }
}
async function fetchSurfaces(client, transport, timeoutMs) {
  await client.connect(transport, { timeout: timeoutMs });
  const toolsResponse = await client.listTools(void 0, { timeout: timeoutMs });
  const capabilities = client.getServerCapabilities();
  const prompts = capabilities?.prompts ? (await client.listPrompts(void 0, { timeout: timeoutMs })).prompts : [];
  const resources = capabilities?.resources ? (await client.listResources(void 0, { timeout: timeoutMs })).resources : [];
  const resourceTemplates = capabilities?.resources ? await client.listResourceTemplates(void 0, { timeout: timeoutMs }).then((r) => r.resourceTemplates).catch(() => []) : [];
  return { tools: toolsResponse.tools, prompts, resources, resourceTemplates, capabilities };
}
function withTimeout(promise, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out after ${timeoutMs}ms waiting for the server to respond.`));
    }, timeoutMs);
    timer.unref?.();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}
function errorMessage3(err) {
  return err instanceof Error ? err.message : String(err);
}

// src/model/server-key.ts
function serverKey(relativePath, serverName) {
  return `${relativePath.replace(/\\/g, "/")}::${serverName}`;
}

// src/live/scan-live.ts
async function runLiveIntrospection(targets, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_LIVE_TIMEOUT_MS;
  const warnings = [];
  const jobs = [];
  for (const target of targets) {
    const servers = target.config.mcpServers ?? {};
    for (const [serverName, def] of Object.entries(servers)) {
      const key = serverKey(target.relativePath, serverName);
      const introspectOptions = {
        timeoutMs,
        ...options.allowUnsafeRemote === true ? { allowUnsafeRemote: true } : {}
      };
      if (isStdioServerDef(def)) {
        jobs.push({
          job: { key, serverName },
          promise: introspectStdioServer(serverName, def, introspectOptions)
        });
        continue;
      }
      if (isHttpServerDef(def)) {
        jobs.push({
          job: { key, serverName },
          promise: introspectHttpServer(serverName, def, introspectOptions)
        });
        continue;
      }
      warnings.push(
        `Skipping live introspection of "${serverName}" in ${target.relativePath}: its definition is neither a stdio launcher nor an HTTP endpoint.`
      );
    }
  }
  const outcomes = await Promise.all(jobs.map((j) => j.promise));
  const toolsByServerKey = /* @__PURE__ */ new Map();
  const allTools = [];
  const allPrompts = [];
  const allResources = [];
  const promptsByServerKey = /* @__PURE__ */ new Map();
  const resourcesByServerKey = /* @__PURE__ */ new Map();
  const errorsByServerKey = /* @__PURE__ */ new Map();
  const allResourceTemplates = [];
  const capabilitiesByServerKey = /* @__PURE__ */ new Map();
  outcomes.forEach((outcome, i) => {
    const { key, serverName } = jobs[i]?.job ?? { key: "", serverName: "" };
    if (!outcome.ok) {
      warnings.push(
        `Live introspection of "${serverName}" failed: ${sanitizeForDisplay(outcome.error)}`
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
    serversAttempted: jobs.length
  };
}
function runPromptRules(allPrompts, rules) {
  const findings = [];
  for (const prompt of allPrompts) {
    for (const rule of rules) {
      findings.push(...rule.check(prompt, allPrompts));
    }
  }
  return findings;
}
function runResourceRules(allResources, rules) {
  const findings = [];
  for (const resource of allResources) {
    for (const rule of rules) {
      findings.push(...rule.check(resource, allResources));
    }
  }
  return findings;
}
function runToolRules(allTools, rules) {
  const findings = [];
  for (const tool of allTools) {
    for (const rule of rules) {
      findings.push(...rule.check(tool, allTools));
    }
  }
  return findings;
}

// src/cli/commands/inventory.ts
async function runInventoryCommand(options) {
  const { targets, warnings, hadCandidates } = resolveScanTargets(
    options.paths,
    options.cwd,
    options.globalConfigPaths ?? []
  );
  for (const warning of warnings) {
    options.stderr(`\u26A0 ${warning}`);
  }
  if (targets.length === 0 && hadCandidates) {
    options.stderr("No MCP config file could be loaded \u2014 see warnings above.");
    return EXIT_CODES.toolError;
  }
  const live = options.live === true;
  const introspection = live ? await runLiveIntrospection(targets, {
    timeoutMs: options.liveTimeoutMs ?? DEFAULT_LIVE_TIMEOUT_MS,
    ...options.allowUnsafeRemote === true ? { allowUnsafeRemote: true } : {}
  }) : void 0;
  if (introspection) {
    options.stderr(
      `\u2139 --live: connected to ${introspection.toolsByServerKey.size}/${introspection.serversAttempted} server(s).`
    );
  }
  const configs = targets.map((target) => ({
    relativePath: target.relativePath,
    scope: target.scope,
    servers: Object.entries(target.config.mcpServers ?? {}).map(([name, def]) => {
      const stdio = isStdioServerDef(def);
      const base = {
        name,
        transport: stdio ? "stdio" : "http",
        launch: stdio ? [def.command, ...def.args ?? []].join(" ") : def.url ?? "(no url)"
      };
      if (!introspection) return base;
      const key = serverKey(target.relativePath, name);
      const error = introspection.errorsByServerKey.get(key);
      if (error !== void 0) return { ...base, error };
      const tools = introspection.toolsByServerKey.get(key);
      if (!tools) return base;
      return {
        ...base,
        surfaces: {
          tools: tools.map((t) => t.name),
          prompts: (introspection.promptsByServerKey.get(key) ?? []).map((p) => p.name),
          resources: (introspection.resourcesByServerKey.get(key) ?? []).map((r) => r.name)
        }
      };
    })
  }));
  const inventory = { configs, live };
  options.stdout(
    options.format === "json" ? formatInventoryJson(inventory) : formatInventoryHuman(inventory)
  );
  return EXIT_CODES.clean;
}

// src/cli/commands/pin.ts
import pc2 from "picocolors";

// src/pin/definition-hash.ts
import { createHash } from "crypto";
function computeDefinitionHash(def) {
  const hash = createHash("sha256");
  if (isStdioServerDef(def)) {
    hash.update(
      JSON.stringify({
        kind: "stdio",
        command: def.command,
        args: def.args ?? [],
        envKeys: Object.keys(def.env ?? {}).sort()
      })
    );
  } else if (isHttpServerDef(def)) {
    hash.update(
      JSON.stringify({
        kind: "http",
        url: def.url,
        headerKeys: Object.keys(def.headers ?? {}).sort()
      })
    );
  }
  return `sha256:${hash.digest("hex")}`;
}

// src/pin/tools-hash.ts
import { createHash as createHash2 } from "crypto";
function computeToolsHash(tools) {
  const sorted = [...tools].sort((a, b) => a.name.localeCompare(b.name));
  const canonical = sorted.map((tool) => ({
    name: tool.name,
    description: tool.description,
    properties: propertySignature(tool),
    annotations: tool.annotations
  }));
  const hash = createHash2("sha256");
  hash.update(JSON.stringify(canonical));
  return `sha256:${hash.digest("hex")}`;
}
function propertySignature(tool) {
  const properties = tool.inputSchema?.properties ?? {};
  return Object.keys(properties).sort().map((key) => {
    const prop = properties[key];
    return {
      key,
      type: prop?.type,
      enum: prop?.enum,
      pattern: prop?.pattern,
      maxLength: prop?.maxLength
    };
  });
}

// src/pin/build-lock.ts
function buildLockFile(targets, liveToolsByServerKey, generatedAt) {
  const servers = {};
  for (const target of targets) {
    const entries = target.config.mcpServers ?? {};
    for (const [serverName, def] of Object.entries(entries)) {
      const key = serverKey(target.relativePath, serverName);
      const liveTools = liveToolsByServerKey?.get(key);
      servers[key] = {
        definitionHash: computeDefinitionHash(def),
        ...liveTools ? { toolsHash: computeToolsHash(liveTools) } : {}
      };
    }
  }
  return { version: LOCK_FILE_VERSION, generatedAt, servers };
}

// src/cli/commands/pin.ts
async function runPinCommand(options) {
  const { targets, warnings, hadCandidates } = resolveScanTargets(
    options.paths,
    options.cwd,
    options.globalConfigPaths ?? []
  );
  for (const warning of warnings) {
    options.stderr(pc2.yellow(`\u26A0 ${warning}`));
  }
  if (!hadCandidates) {
    options.stderr(pc2.yellow("No MCP config found to pin."));
    return EXIT_CODES.clean;
  }
  if (targets.length === 0) {
    options.stderr(pc2.red("No MCP config file could be loaded \u2014 see warnings above."));
    return EXIT_CODES.toolError;
  }
  let liveToolsByServerKey;
  if (options.live) {
    const timeoutMs = options.liveTimeoutMs ?? DEFAULT_LIVE_TIMEOUT_MS;
    const live = await runLiveIntrospection(targets, {
      timeoutMs,
      ...options.allowUnsafeRemote === true ? { allowUnsafeRemote: true } : {}
    });
    options.stderr(
      pc2.dim(
        `\u2139 --live: connected to ${live.toolsByServerKey.size}/${live.serversAttempted} server(s).`
      )
    );
    for (const warning of live.warnings) {
      options.stderr(pc2.yellow(`\u26A0 ${warning}`));
    }
    liveToolsByServerKey = live.toolsByServerKey;
  }
  const generatedAt = (options.now ?? (() => /* @__PURE__ */ new Date()))().toISOString();
  const lock = buildLockFile(targets, liveToolsByServerKey, generatedAt);
  writeLockFile(options.outputPath, lock);
  const serverCount = Object.keys(lock.servers).length;
  const liveCount = Object.values(lock.servers).filter((s) => s.toolsHash !== void 0).length;
  const liveNote = options.live ? `, ${liveCount} with live tool hashes` : "";
  options.stdout(pc2.green(`\u2714 Pinned ${serverCount} server(s)${liveNote} to ${options.outputPath}`));
  return EXIT_CODES.clean;
}

// src/cli/commands/scan.ts
import pc4 from "picocolors";

// src/baseline/lockfile.ts
import { readFileSync as readFileSync3 } from "fs";
import { z as z3 } from "zod";
var BaselineFileSchema = z3.object({
  version: z3.string(),
  fingerprints: z3.array(z3.string())
});
function loadBaseline(filePath) {
  const raw = JSON.parse(readFileSync3(filePath, "utf-8"));
  const result = BaselineFileSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Malformed baseline file at ${filePath}: ${result.error.message}`);
  }
  return new Set(result.data.fingerprints);
}
function applyBaseline(findings, baseline) {
  return findings.filter((f) => !baseline.has(f.fingerprint));
}

// src/core/engine.ts
function runScan(targets, rules, ctx) {
  const findings = [];
  for (const target of targets) {
    for (const rule of rules) {
      findings.push(...rule.check(target, ctx));
    }
  }
  return { findings, targetsScanned: targets.length };
}

// src/core/rule-filter.ts
function filterRules(rules, options) {
  const knownIds = options.knownIds ?? new Set(rules.map((r) => r.id));
  if (options.only.length > 0) {
    const unknown = options.only.filter((id) => !knownIds.has(id));
    if (unknown.length > 0) {
      throw new Error(`Unknown rule ID(s) in --rules: ${unknown.join(", ")}`);
    }
  }
  if (options.ignore.length > 0) {
    const unknown = options.ignore.filter((id) => !knownIds.has(id));
    if (unknown.length > 0) {
      throw new Error(`Unknown rule ID(s) in --ignore-rule: ${unknown.join(", ")}`);
    }
  }
  const onlySet = options.only.length > 0 ? new Set(options.only) : void 0;
  const ignoreSet = new Set(options.ignore);
  return rules.filter((rule) => {
    if (ignoreSet.has(rule.id)) return false;
    if (onlySet && !onlySet.has(rule.id)) return false;
    return true;
  });
}

// src/core/severity.ts
var SEVERITY_ORDER = ["info", "low", "medium", "high", "critical"];
function severityRank(severity) {
  return SEVERITY_ORDER.indexOf(severity);
}
function severityAtLeast(severity, threshold) {
  return severityRank(severity) >= severityRank(threshold);
}

// src/report/formatters/human.ts
import pc3 from "picocolors";
var SEVERITY_STYLE = {
  critical: (t) => pc3.bold(pc3.red(t)),
  high: pc3.red,
  medium: pc3.yellow,
  low: pc3.blue,
  info: pc3.gray
};
function formatHuman(result) {
  if (result.findings.length === 0) {
    return `${pc3.green("\u2714")} No findings across ${result.targetsScanned} scanned file(s).`;
  }
  const lines = [];
  for (const [file, findings] of groupByFile(result.findings)) {
    lines.push(sanitizeForDisplay(file));
    for (const finding of findings) {
      lines.push(formatFinding(finding));
    }
    lines.push("");
  }
  lines.push(summaryLine(result));
  return lines.join("\n").trimEnd();
}
function formatFinding(finding) {
  const label = SEVERITY_STYLE[finding.severity](finding.severity.toUpperCase());
  const position = `${finding.location.line}:${finding.location.column}`;
  const message = sanitizeForDisplay(finding.message);
  const evidenceSuffix = finding.evidence ? `  ${pc3.dim(sanitizeForDisplay(finding.evidence))}` : "";
  return [
    `  ${label}  ${pc3.bold(finding.ruleId)}  ${message}`,
    `    ${pc3.dim(position)}${evidenceSuffix}`,
    `    ${pc3.dim("Fix:")} ${sanitizeForDisplay(finding.remediation)}`
  ].join("\n");
}
function summaryLine(result) {
  const counts = countBySeverity(result.findings);
  const parts = ["critical", "high", "medium", "low", "info"].filter((severity) => counts[severity] > 0).map((severity) => `${counts[severity]} ${severity}`);
  return `${parts.join(", ")} \u2014 ${result.findings.length} finding(s) across ${result.targetsScanned} file(s)`;
}
function countBySeverity(findings) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const finding of findings) {
    counts[finding.severity]++;
  }
  return counts;
}
function groupByFile(findings) {
  const byFile = /* @__PURE__ */ new Map();
  for (const finding of findings) {
    const bucket = byFile.get(finding.location.file);
    if (bucket) {
      bucket.push(finding);
    } else {
      byFile.set(finding.location.file, [finding]);
    }
  }
  return byFile;
}

// src/report/formatters/json.ts
var JSON_REPORT_VERSION = "1";
function formatJson(result) {
  const document = {
    version: JSON_REPORT_VERSION,
    targetsScanned: result.targetsScanned,
    findings: result.findings
  };
  return JSON.stringify(document, null, 2);
}

// src/rules/owasp.ts
var OWASP_MCP_TAXONOMY_NAME = "OWASP-MCP-Top-10";
var OWASP_MCP_TAXONOMY_VERSION = "0.1";
var OWASP_MCP_TAXONOMY_COMMIT = "165fe0f78ef104459237b4a8e0f6e78db9b02391";
var OWASP_MCP_TAXONOMY_SOURCE_URL = `https://github.com/OWASP/www-project-mcp-top-10/tree/${OWASP_MCP_TAXONOMY_COMMIT}/2025`;
var OWASP_MCP_TAXONOMY_URL = "https://owasp.org/www-project-mcp-top-10/";
var BASE = "https://owasp.org/www-project-mcp-top-10/2025";
var OWASP_MCP_TOP_10 = [
  {
    id: "MCP01",
    title: "Token Mismanagement & Secret Exposure",
    url: `${BASE}/MCP01-2025-Token-Mismanagement-and-Secret-Exposure`
  },
  {
    id: "MCP02",
    title: "Privilege Escalation via Scope Creep",
    url: `${BASE}/MCP02-2025%E2%80%93Privilege-Escalation-via-Scope-Creep`
  },
  {
    id: "MCP03",
    title: "Tool Poisoning",
    url: `${BASE}/MCP03-2025%E2%80%93Tool-Poisoning`
  },
  {
    id: "MCP04",
    title: "Software Supply Chain Attacks & Dependency Tampering",
    url: `${BASE}/MCP04-2025%E2%80%93Software-Supply-Chain-Attacks%26Dependency-Tampering`
  },
  {
    id: "MCP05",
    title: "Command Injection & Execution",
    url: `${BASE}/MCP05-2025%E2%80%93Command-Injection%26Execution`
  },
  {
    id: "MCP06",
    title: "Intent Flow Subversion",
    url: `${BASE}/MCP06-2025%E2%80%93Intent-Flow-Subversion`
  },
  {
    id: "MCP07",
    title: "Insufficient Authentication & Authorization",
    url: `${BASE}/MCP07-2025%E2%80%93Insufficient-Authentication%26Authorization`
  },
  {
    id: "MCP08",
    title: "Lack of Audit and Telemetry",
    url: `${BASE}/MCP08-2025%E2%80%93Lack-of-Audit-and-Telemetry`
  },
  {
    id: "MCP09",
    title: "Shadow MCP Servers",
    url: `${BASE}/MCP09-2025%E2%80%93Shadow-MCP-Servers`
  },
  {
    id: "MCP10",
    title: "Context Injection & Over-Sharing",
    url: `${BASE}/MCP10-2025%E2%80%93ContextInjection%26OverSharing`
  }
];
var BY_ID = new Map(
  OWASP_MCP_TOP_10.map((entry) => [entry.id, entry])
);

// src/report/formatters/sarif.ts
var SARIF_SCHEMA_URI = "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json";
var OWASP_TAXONOMY_GUID = "a3f1c8d2-6b47-4e19-9f83-2d5e7c1b0a64";
var TAXA_INDEX = new Map(
  OWASP_MCP_TOP_10.map((entry, index) => [entry.id, index])
);
function owaspTaxonomy() {
  return {
    name: OWASP_MCP_TAXONOMY_NAME,
    guid: OWASP_TAXONOMY_GUID,
    version: OWASP_MCP_TAXONOMY_VERSION,
    organization: "OWASP",
    informationUri: OWASP_MCP_TAXONOMY_URL,
    shortDescription: {
      text: "The OWASP MCP Top 10 \u2014 the ten most critical security risks in Model Context Protocol deployments."
    },
    isComprehensive: true,
    properties: {
      // Which reading of the beta this mapping was built from. `version`
      // alone is not decidable while the list is still moving under its own
      // label; the sha is.
      specCommit: OWASP_MCP_TAXONOMY_COMMIT,
      specSource: OWASP_MCP_TAXONOMY_SOURCE_URL
    },
    taxa: OWASP_MCP_TOP_10.map((entry) => ({
      id: entry.id,
      name: entry.title,
      helpUri: entry.url,
      shortDescription: { text: entry.title }
    }))
  };
}
function owaspRelationships(ids) {
  return ids.map((id) => ({
    target: {
      id,
      index: TAXA_INDEX.get(id),
      toolComponent: { name: OWASP_MCP_TAXONOMY_NAME, guid: OWASP_TAXONOMY_GUID }
    },
    kinds: ["superset"]
  }));
}
var SEVERITY_TO_SARIF_LEVEL = {
  critical: "error",
  high: "error",
  medium: "warning",
  low: "note",
  info: "note"
};
function formatSarif(result, allRules) {
  const usedRuleIds = new Set(result.findings.map((f) => f.ruleId));
  const rulesById = new Map(allRules.map((r) => [r.id, r]));
  const sarifRules = [...usedRuleIds].sort().map((id) => {
    const rule = rulesById.get(id);
    const owasp = rule?.owasp ?? [];
    return {
      id,
      name: id,
      shortDescription: { text: rule?.title ?? id },
      helpUri: rule?.docsUrl ?? PACKAGE_HOMEPAGE,
      defaultConfiguration: {
        level: rule ? SEVERITY_TO_SARIF_LEVEL[rule.severity] : "warning"
      },
      relationships: owaspRelationships(owasp),
      properties: {
        owaspMcpTop10: [...owasp],
        // GitHub's Code Scanning UI surfaces `tags` as filter chips; the
        // taxonomy relationships above are the machine-readable form, these
        // are what a human can actually click.
        tags: owasp.map((entry) => `${OWASP_MCP_TAXONOMY_NAME}/${entry}`)
      }
    };
  });
  const log = {
    $schema: SARIF_SCHEMA_URI,
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: PACKAGE_NAME,
            version: PACKAGE_VERSION,
            informationUri: PACKAGE_HOMEPAGE,
            rules: sarifRules
          }
        },
        results: result.findings.map(findingToSarifResult),
        taxonomies: [owaspTaxonomy()]
      }
    ]
  };
  return JSON.stringify(log, null, 2);
}
function findingToSarifResult(finding) {
  return {
    ruleId: finding.ruleId,
    level: SEVERITY_TO_SARIF_LEVEL[finding.severity],
    message: { text: finding.message },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: toPosixPath(finding.location.file) },
          region: {
            startLine: finding.location.line,
            startColumn: finding.location.column,
            ...finding.location.endLine !== void 0 ? { endLine: finding.location.endLine } : {},
            ...finding.location.endColumn !== void 0 ? { endColumn: finding.location.endColumn } : {}
          }
        }
      }
    ],
    partialFingerprints: {
      "guardmcpFingerprint/v1": finding.fingerprint
    }
  };
}
function toPosixPath(path) {
  return path.replace(/\\/g, "/");
}

// src/core/finding.ts
import { createHash as createHash3 } from "crypto";
function createFinding(input) {
  return {
    ...input,
    fingerprint: computeFingerprint(
      input.ruleId,
      input.location.file,
      input.logicalPath,
      input.evidence
    )
  };
}
function computeFingerprint(ruleId, file, logicalPath, evidence) {
  const hash = createHash3("sha256");
  hash.update(ruleId);
  hash.update("\0");
  hash.update(file);
  hash.update("\0");
  hash.update(logicalPath);
  hash.update("\0");
  hash.update(evidence ?? "");
  return hash.digest("hex").slice(0, 16);
}

// src/detectors/imperative-phrases.ts
var IMPERATIVE_PATTERNS = [
  /ignore (all |any )?previous instructions/i,
  /do not (tell|mention|inform|disclose)\b.{0,30}(user|human)/i,
  /without (telling|informing|asking)\b.{0,20}(user|human)/i,
  /before (calling|using|invoking) (any )?other tool/i,
  /<\s*important\s*>/i,
  /read (the )?file\s+[~./][^\s"']{2,}/i
];
function findImperativePhrases(text) {
  const matches = [];
  for (const pattern of IMPERATIVE_PATTERNS) {
    const match = pattern.exec(text);
    if (match && match.index !== void 0) {
      matches.push({ pattern: pattern.source, index: match.index });
    }
  }
  return matches.sort((a, b) => a.index - b.index);
}

// src/rules/prompts/types.ts
function promptLocation(prompt) {
  return { file: `live:${prompt.serverName}/prompts/${prompt.name}`, line: 1, column: 1 };
}
function promptTextFields(prompt) {
  const base = `/prompts/${prompt.serverName}/${prompt.name}`;
  return [
    { text: prompt.description, logicalPath: `${base}/description`, where: "description" },
    ...prompt.arguments.map((arg) => ({
      text: arg.description ?? "",
      logicalPath: `${base}/arguments/${arg.name}/description`,
      where: `"${arg.name}" argument description`
    }))
  ];
}

// src/rules/prompts/hidden-instructions.ts
var promptHiddenInstructionsRule = {
  id: "MCPG-205",
  title: "Hidden instruction in prompt metadata (prompt injection)",
  severity: "critical",
  confidence: "medium",
  // pattern-matched natural language, same basis as MCPG-201
  category: "poisoning",
  docsUrl: "https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-205.md",
  /** Poisoned prompt metadata both smuggles instructions (MCP03) and
   * redirects what the model was asked to do (MCP06). */
  owasp: ["MCP03", "MCP06"],
  check(prompt, _allPrompts) {
    const findings = [];
    for (const field of promptTextFields(prompt)) {
      const matches = findImperativePhrases(field.text);
      if (matches.length === 0) continue;
      findings.push(
        createFinding({
          ruleId: promptHiddenInstructionsRule.id,
          severity: promptHiddenInstructionsRule.severity,
          confidence: promptHiddenInstructionsRule.confidence,
          // Deliberately does NOT quote the matched phrase — a report that
          // echoes an injected instruction is itself a re-injection vector
          // when an agent reads the report. Same rule as MCPG-201.
          message: `Prompt "${prompt.name}" on server "${prompt.serverName}" has a ${field.where} containing ${matches.length} instruction-like phrase(s) (override/hide-from-user/read-a-specific-file directives) \u2014 language aimed at the model rather than at the person choosing the prompt.`,
          remediation: "Read the prompt metadata directly, outside any AI context (a plain text viewer, not a chat that would act on it). A prompt template legitimately contains instructions for the task; it has no reason to contain instructions about ignoring prior context, withholding information from the user, or reading a named file.",
          location: promptLocation(prompt),
          logicalPath: field.logicalPath
        })
      );
    }
    return findings;
  }
};

// src/detectors/unicode-anomalies.ts
var ZERO_WIDTH_CHARS = [8203, 8204, 8205, 65279].map((code) => String.fromCharCode(code));
var BIDI_OVERRIDE_RANGE_START = 8234;
var BIDI_OVERRIDE_RANGE_END = 8238;
var BIDI_ISOLATE_RANGE_START = 8294;
var BIDI_ISOLATE_RANGE_END = 8297;
var ZERO_WIDTH_PATTERN = new RegExp(`[${ZERO_WIDTH_CHARS.join("")}]`, "g");
var HTML_COMMENT_PATTERN = /<!--[\s\S]*?-->/g;
var C0_CONTROL_RANGES = [
  [0, 8],
  // NUL..BS — BS erases the character before it
  [11, 12],
  // VT, FF
  [14, 31],
  // SO..US  — includes ESC (0x1b), which starts ANSI/OSC
  [127, 127]
  // DEL
];
var C0_CONTROL_CHARS = C0_CONTROL_RANGES.flatMap(
  ([lo, hi]) => Array.from({ length: hi - lo + 1 }, (_, offset) => String.fromCharCode(lo + offset))
);
var C0_CONTROL = new RegExp(`[${C0_CONTROL_CHARS.join("")}]`, "g");
var LONE_CARRIAGE_RETURN = new RegExp(
  `${String.fromCharCode(13)}(?!${String.fromCharCode(10)})`,
  "g"
);
function isBidiOverrideChar(codePoint) {
  return codePoint >= BIDI_OVERRIDE_RANGE_START && codePoint <= BIDI_OVERRIDE_RANGE_END || codePoint >= BIDI_ISOLATE_RANGE_START && codePoint <= BIDI_ISOLATE_RANGE_END;
}
function findUnicodeAnomalies(text) {
  const anomalies = [];
  for (const match of text.matchAll(ZERO_WIDTH_PATTERN)) {
    anomalies.push({ kind: "zero-width", index: match.index });
  }
  for (let i = 0; i < text.length; i++) {
    if (isBidiOverrideChar(text.charCodeAt(i))) {
      anomalies.push({ kind: "bidi-override", index: i });
    }
  }
  for (const match of text.matchAll(HTML_COMMENT_PATTERN)) {
    anomalies.push({ kind: "html-comment", index: match.index });
  }
  for (const match of text.matchAll(C0_CONTROL)) {
    anomalies.push({ kind: "terminal-control", index: match.index });
  }
  for (const match of text.matchAll(LONE_CARRIAGE_RETURN)) {
    anomalies.push({ kind: "terminal-control", index: match.index });
  }
  return anomalies.sort((a, b) => a.index - b.index);
}

// src/rules/prompts/invisible-prompt-content.ts
var KIND_LABEL = {
  "zero-width": "zero-width/invisible character(s)",
  "bidi-override": "bidirectional text override character(s)",
  "html-comment": "an HTML comment",
  "terminal-control": "terminal control/ANSI escape sequence(s), which change what a terminal shows without changing what the model reads"
};
var invisiblePromptContentRule = {
  id: "MCPG-206",
  title: "Invisible or obfuscated content in prompt metadata",
  severity: "high",
  confidence: "high",
  category: "poisoning",
  docsUrl: "https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-206.md",
  /** Invisible characters are how the poisoning is delivered unseen. */
  owasp: ["MCP03"],
  check(prompt, _allPrompts) {
    const findings = [];
    for (const field of promptTextFields(prompt)) {
      const anomalies = findUnicodeAnomalies(field.text);
      if (anomalies.length === 0) continue;
      const kinds = [...new Set(anomalies.map((a) => KIND_LABEL[a.kind] ?? a.kind))];
      findings.push(
        createFinding({
          ruleId: invisiblePromptContentRule.id,
          severity: invisiblePromptContentRule.severity,
          confidence: invisiblePromptContentRule.confidence,
          // Not quoting the hidden content — same rationale as MCPG-202.
          message: `Prompt "${prompt.name}" on server "${prompt.serverName}" has a ${field.where} containing ${kinds.join(", ")} \u2014 content invisible to a human reading it normally, but fully visible to the model that receives the raw text.`,
          remediation: "Inspect the raw bytes of the prompt metadata, not a rendered view. Invisible/directional characters and HTML comments have no legitimate reason to appear here; treat their presence as evidence of tampering rather than as a formatting quirk.",
          location: promptLocation(prompt),
          logicalPath: field.logicalPath
        })
      );
    }
    return findings;
  }
};

// src/rules/prompt-registry.ts
var ALL_PROMPT_RULES = [
  promptHiddenInstructionsRule,
  invisiblePromptContentRule
];

// src/detectors/destructive-verbs.ts
var DESTRUCTIVE = /\b(deletes?|removes?|drops?|truncates?|overwrites?|formats?|destroys?|purges?|wipes?)\b/i;
function normalizeIdentifier(value) {
  return value.replace(/[_-]/g, " ");
}
function readsAsDestructive(value) {
  return DESTRUCTIVE.test(normalizeIdentifier(value));
}

// src/rules/audit/no-logging-capability.ts
function canChangeSomething(tool) {
  if (tool.annotations?.destructiveHint === true) return true;
  if (tool.annotations?.readOnlyHint === true) return false;
  return readsAsDestructive(tool.name) || readsAsDestructive(tool.description);
}
var noLoggingCapabilityRule = {
  id: "MCPG-702",
  title: "Server can change things but declares no logging capability",
  severity: "medium",
  confidence: "high",
  // both halves are observed at initialize and tools/list
  category: "audit",
  docsUrl: "https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-702.md",
  /** Actions occur and no record of them can be produced. */
  owasp: ["MCP08"],
  check(target, ctx) {
    const capabilities = ctx.capabilitiesByServerKey;
    const liveTools = ctx.liveTools;
    if (!capabilities || !liveTools) return [];
    const findings = [];
    for (const serverName of Object.keys(target.config.mcpServers ?? {})) {
      const key = serverKey(target.relativePath, serverName);
      const declared = capabilities.get(key);
      if (!declared) continue;
      if (declared.logging !== void 0) continue;
      const mutating = (liveTools.get(key) ?? []).filter(canChangeSomething);
      if (mutating.length === 0) continue;
      const range = target.document.locate(["mcpServers", serverName]);
      findings.push(
        createFinding({
          ruleId: noLoggingCapabilityRule.id,
          severity: noLoggingCapabilityRule.severity,
          confidence: noLoggingCapabilityRule.confidence,
          message: `"${serverName}" advertises ${mutating.length} tool(s) that change things (e.g. "${mutating[0]?.name}") but declared no "logging" capability at initialize \u2014 it has no channel to report what it did, so a client has nowhere to collect a record from.`,
          remediation: "If you maintain the server, declare the `logging` capability and emit a notification per tool call. If you do not, treat this server as unauditable: whatever it does will have to be reconstructed from the client side, if at all \u2014 which is the position MCP08 exists to warn about.",
          location: range ? {
            file: target.relativePath,
            line: range.line,
            column: range.column,
            endLine: range.endLine,
            endColumn: range.endColumn
          } : { file: target.relativePath, line: 1, column: 1 },
          logicalPath: `/mcpServers/${serverName}`
        })
      );
    }
    return findings;
  }
};

// src/rules/audit/shadow-server.ts
var shadowServerRule = {
  id: "MCPG-601",
  title: "MCP server active outside the project\u2019s declared configuration",
  severity: "low",
  confidence: "medium",
  category: "governance",
  docsUrl: "https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-601.md",
  /** A server running alongside reviewed ones without having been reviewed
   * is the config-visible form of a shadow deployment. */
  owasp: ["MCP09"],
  check(target, ctx) {
    if (target.scope !== "global") return [];
    const projectServers = ctx.projectServers;
    if (!projectServers || projectServers.size === 0) return [];
    const findings = [];
    for (const serverName of Object.keys(target.config.mcpServers ?? {})) {
      if (projectServers.has(serverName)) continue;
      const range = target.document.locate(["mcpServers", serverName]);
      findings.push(
        createFinding({
          ruleId: shadowServerRule.id,
          severity: shadowServerRule.severity,
          confidence: shadowServerRule.confidence,
          message: `"${serverName}" is configured machine-wide but is not declared in this project's config \u2014 it loads alongside the project's servers, with the same reach, without having been reviewed with them.`,
          remediation: `If the project needs it, declare it in the project config so it is reviewed and pinned like the rest. If it is personal tooling, that is fine \u2014 but be aware it sees the same context as project servers do, and nobody reviewing this repository can tell it is there.`,
          location: range ? {
            file: target.relativePath,
            line: range.line,
            column: range.column,
            endLine: range.endLine,
            endColumn: range.endColumn
          } : { file: target.relativePath, line: 1, column: 1 },
          logicalPath: `/mcpServers/${serverName}`
        })
      );
    }
    return findings;
  }
};

// src/detectors/telemetry-switches.ts
var TRUTHY = /* @__PURE__ */ new Set(["1", "true", "yes", "on", "enabled"]);
var SILENT_LEVELS = /* @__PURE__ */ new Set(["off", "silent", "none", "no", "disabled", "quiet"]);
var STANDARD_SWITCHES = /* @__PURE__ */ new Map([
  ["OTEL_SDK_DISABLED", "the OpenTelemetry SDK kill switch"],
  ["DO_NOT_TRACK", "the DO_NOT_TRACK cross-vendor telemetry opt-out"]
]);
var DISABLE_NAME = /(^|_)(disable|no)_(telemetry|logging|logs|tracing|metrics|analytics)($|_)|(^|_)(telemetry|logging|logs|tracing|metrics|analytics)_disabled($|_)/i;
var LEVEL_NAME = /(^|_)log(ging)?_level($|_)|(^|_)verbosity($|_)/i;
function findTelemetrySwitches(env) {
  if (!env) return [];
  const matches = [];
  for (const [key, value] of Object.entries(env)) {
    const normalized = value.trim().toLowerCase();
    const standard = STANDARD_SWITCHES.get(key.toUpperCase());
    if (standard) {
      if (TRUTHY.has(normalized)) {
        matches.push({ key, value, label: standard, confidence: "high" });
      }
      continue;
    }
    if (DISABLE_NAME.test(key)) {
      if (TRUTHY.has(normalized)) {
        matches.push({
          key,
          value,
          label: "a telemetry/logging kill switch",
          confidence: "medium"
        });
      }
      continue;
    }
    if (LEVEL_NAME.test(key) && SILENT_LEVELS.has(normalized)) {
      matches.push({
        key,
        value,
        label: `a log level set to "${value}", which records nothing`,
        confidence: "medium"
      });
    }
  }
  return matches;
}

// src/rules/audit/telemetry-disabled.ts
var telemetryDisabledRule = {
  id: "MCPG-701",
  title: "Telemetry or logging disabled in MCP server launch environment",
  severity: "medium",
  confidence: "medium",
  category: "audit",
  docsUrl: "https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-701.md",
  /** Configured silence is the mechanism behind MCP08's scenarios: an action
   * takes place and no record of it exists to review afterwards. */
  owasp: ["MCP08"],
  check(target, _ctx) {
    const findings = [];
    const servers = target.config.mcpServers ?? {};
    for (const [serverName, def] of Object.entries(servers)) {
      if (!isStdioServerDef(def) || !def.env) continue;
      for (const match of findTelemetrySwitches(def.env)) {
        const range = target.document.locate(["mcpServers", serverName, "env", match.key]);
        findings.push(
          createFinding({
            ruleId: telemetryDisabledRule.id,
            severity: telemetryDisabledRule.severity,
            confidence: match.confidence,
            message: `"${serverName}" server sets ${match.key}=${match.value} \u2014 ${match.label}. Anything this server does will leave no record of its own.`,
            remediation: `Remove ${match.key} from the committed config, or scope it to local development only. MCP08 exists because the cost of this setting is only ever paid later: when an action is questioned, the audit trail an investigation needs was never written.`,
            location: range ? {
              file: target.relativePath,
              line: range.line,
              column: range.column,
              endLine: range.endLine,
              endColumn: range.endColumn
            } : { file: target.relativePath, line: 1, column: 1 },
            logicalPath: `/mcpServers/${serverName}/env/${match.key}`,
            evidence: `${match.key}=${match.value}`
          })
        );
      }
    }
    return findings;
  }
};

// src/rules/integrity/live-tool-drift.ts
var liveToolDriftRule = {
  id: "MCPG-502",
  title: "Server's live tool definitions changed since they were last pinned",
  severity: "critical",
  confidence: "high",
  category: "integrity",
  docsUrl: "https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-502.md",
  /** Tools that changed post-approval is the rug-pull form of tool poisoning. */
  owasp: ["MCP03", "MCP04"],
  check(target, ctx) {
    if (!ctx.lock || !ctx.liveTools) return [];
    const servers = target.config.mcpServers ?? {};
    const findings = [];
    for (const serverName of Object.keys(servers)) {
      const key = serverKey(target.relativePath, serverName);
      const pinned = ctx.lock.servers[key];
      if (!pinned?.toolsHash) continue;
      const liveTools = ctx.liveTools.get(key);
      if (!liveTools) continue;
      const currentHash = computeToolsHash(liveTools);
      if (currentHash === pinned.toolsHash) continue;
      findings.push(
        createFinding({
          ruleId: liveToolDriftRule.id,
          severity: liveToolDriftRule.severity,
          confidence: liveToolDriftRule.confidence,
          message: `"${serverName}" server's real tool definitions (name/description/input schema) differ from what was pinned \u2014 a tool now does something different from what was reviewed and approved. This is the exact signature of a rug-pull attack.`,
          remediation: `Run "guardmcp scan --live --format json" to see the current tool list and diff it against what you expect. If the change is legitimate (a real upgrade you reviewed), re-pin with "guardmcp pin --live". If not, stop using this server and rotate anything it had access to \u2014 its behavior is no longer what was approved.`,
          location: { file: `live:${serverName}`, line: 1, column: 1 },
          logicalPath: `/mcpServers/${serverName}`,
          evidence: currentHash
        })
      );
    }
    return findings;
  }
};

// src/rules/integrity/server-definition-drift.ts
var serverDefinitionDriftRule = {
  id: "MCPG-501",
  title: "Server definition changed since it was last pinned",
  severity: "high",
  confidence: "high",
  category: "integrity",
  docsUrl: "https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-501.md",
  /** A definition that changed after approval is dependency tampering. */
  owasp: ["MCP04"],
  check(target, ctx) {
    if (!ctx.lock) return [];
    const servers = target.config.mcpServers ?? {};
    const findings = [];
    for (const [serverName, def] of Object.entries(servers)) {
      const key = serverKey(target.relativePath, serverName);
      const pinned = ctx.lock.servers[key];
      if (!pinned) continue;
      const currentHash = computeDefinitionHash(def);
      if (currentHash === pinned.definitionHash) continue;
      const range = target.document.locate(["mcpServers", serverName]);
      findings.push(
        createFinding({
          ruleId: serverDefinitionDriftRule.id,
          severity: serverDefinitionDriftRule.severity,
          confidence: serverDefinitionDriftRule.confidence,
          message: `"${serverName}" server's launch definition (command/args/url) has changed since it was last pinned \u2014 this is exactly what a config-level rug-pull looks like.`,
          remediation: `Confirm this change was intentional. If it was, re-pin with "guardmcp pin" to accept the new baseline. If it wasn't, treat this config as tampered with \u2014 investigate where the edit came from before trusting this server again.`,
          location: range ? {
            file: target.relativePath,
            line: range.line,
            column: range.column,
            endLine: range.endLine,
            endColumn: range.endColumn
          } : { file: target.relativePath, line: 1, column: 1 },
          logicalPath: `/mcpServers/${serverName}`,
          evidence: currentHash
        })
      );
    }
    return findings;
  }
};

// src/rules/scope/unrestricted-scope.ts
var FILESYSTEM_ROOT = /^(\/|~|[A-Za-z]:[\\/]?)$/;
var unrestrictedScopeRule = {
  id: "MCPG-301",
  title: "MCP server scoped to an entire filesystem root",
  severity: "high",
  confidence: "high",
  category: "scope",
  docsUrl: "https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-301.md",
  /** Filesystem-root scope is authority beyond what the task needs. */
  owasp: ["MCP02"],
  check(target, _ctx) {
    const findings = [];
    const servers = target.config.mcpServers ?? {};
    for (const [serverName, def] of Object.entries(servers)) {
      if (!isStdioServerDef(def) || !def.args) continue;
      const rootArgIndex = def.args.findIndex((arg) => FILESYSTEM_ROOT.test(arg));
      if (rootArgIndex === -1) continue;
      const logicalPath = `/mcpServers/${serverName}/args/${rootArgIndex}`;
      const range = target.document.locate(["mcpServers", serverName, "args", rootArgIndex]);
      findings.push(
        createFinding({
          ruleId: unrestrictedScopeRule.id,
          severity: unrestrictedScopeRule.severity,
          confidence: unrestrictedScopeRule.confidence,
          message: `"${serverName}" server is scoped to "${def.args[rootArgIndex]}" \u2014 an entire filesystem root/home directory rather than a specific project folder, giving it read/write reach far beyond what an MCP server typically needs.`,
          remediation: "Point the server at the narrowest directory that covers its actual job (a specific project folder), not a drive root or home directory.",
          location: range ? {
            file: target.relativePath,
            line: range.line,
            column: range.column,
            endLine: range.endLine,
            endColumn: range.endColumn
          } : { file: target.relativePath, line: 1, column: 1 },
          logicalPath
        })
      );
    }
    return findings;
  }
};

// src/rules/secrets/dangerous-command.ts
var SHELL_INTERPRETERS = /* @__PURE__ */ new Set([
  "sh",
  "bash",
  "zsh",
  "cmd",
  "cmd.exe",
  "powershell",
  "powershell.exe",
  "pwsh",
  "pwsh.exe"
]);
var SHELL_FLAG = /^(-c|\/c|-command|--command)$/i;
var PIPE_TO_INTERPRETER = /\|\s*(sh|bash|zsh|python3?|node|powershell|pwsh)\b/i;
function basename(commandPath) {
  const segments = commandPath.replace(/\\/g, "/").split("/");
  return (segments[segments.length - 1] ?? commandPath).toLowerCase();
}
var dangerousCommandRule = {
  id: "MCPG-104",
  title: "MCP server launched via an opaque or dangerous shell invocation",
  // Nominal/worst-case severity for this rule's listing (`guardmcp rules`);
  // individual findings are scored critical or medium per-instance below,
  // since "shell -c" alone is a smell but "curl | sh" inside it is an
  // actual fetch-and-execute pattern.
  severity: "critical",
  confidence: "high",
  category: "secrets",
  docsUrl: "https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-104.md",
  /** An opaque shell invocation is the execution sink command injection lands in. */
  owasp: ["MCP05"],
  check(target, _ctx) {
    const findings = [];
    const servers = target.config.mcpServers ?? {};
    for (const [serverName, def] of Object.entries(servers)) {
      if (!isStdioServerDef(def)) continue;
      if (!SHELL_INTERPRETERS.has(basename(def.command))) continue;
      const args = def.args ?? [];
      const flagIndex = args.findIndex((arg) => SHELL_FLAG.test(arg));
      if (flagIndex === -1) continue;
      const scriptIndex = flagIndex + 1;
      const script = args[scriptIndex] ?? args.slice(flagIndex + 1).join(" ");
      const isPipeToInterpreter = PIPE_TO_INTERPRETER.test(script);
      const logicalPath = `/mcpServers/${serverName}/args/${scriptIndex}`;
      const range = target.document.locate(["mcpServers", serverName, "args", scriptIndex]);
      const location = range ? {
        file: target.relativePath,
        line: range.line,
        column: range.column,
        endLine: range.endLine,
        endColumn: range.endColumn
      } : { file: target.relativePath, line: 1, column: 1 };
      findings.push(
        createFinding({
          ruleId: dangerousCommandRule.id,
          severity: isPipeToInterpreter ? "critical" : "medium",
          confidence: dangerousCommandRule.confidence,
          message: isPipeToInterpreter ? `"${serverName}" server's launch command downloads and executes a remote script in one step (pipe to an interpreter) \u2014 the code that runs is whatever the remote host serves at scan/run time, not what you reviewed.` : `"${serverName}" server is launched through a shell (${def.command} ${args[flagIndex]}) instead of invoking the binary directly \u2014 harder to audit than a plain command, and a place secrets/flags can hide inside a single opaque string.`,
          remediation: isPipeToInterpreter ? "Download the installer, review it, then run it as a separate step \u2014 never pipe an unreviewed remote script straight into an interpreter as part of a server launch command." : "Invoke the target binary directly (command + args array) instead of wrapping it in a shell -c string, so the actual command being run is visible without executing anything.",
          location,
          logicalPath
        })
      );
    }
    return findings;
  }
};

// src/detectors/secret-patterns.ts
var SECRET_PATTERNS = [
  {
    id: "github-token",
    label: "GitHub token",
    // ghp_ (PAT), gho_ (OAuth), ghs_ (server-to-server/app), ghu_ (user-to-server)
    regex: /\bgh[opsu]_[A-Za-z0-9]{36,}\b/g
  },
  {
    id: "anthropic-openai-key",
    label: "Anthropic/OpenAI API key",
    regex: /\bsk-(ant-(api03-)?)?[A-Za-z0-9_-]{20,}\b/g
  },
  {
    id: "aws-access-key-id",
    label: "AWS access key ID",
    regex: /\bAKIA[0-9A-Z]{16}\b/g
  },
  {
    id: "slack-token",
    label: "Slack token",
    regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g
  },
  {
    id: "jwt",
    label: "JWT (JSON Web Token)",
    regex: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g
  }
];
var ENV_VAR_REFERENCE = /^(\$\{[A-Za-z_][A-Za-z0-9_]*\}|\$[A-Za-z_][A-Za-z0-9_]*|%[A-Za-z_][A-Za-z0-9_]*%)$/;
function isEnvVarReference(value) {
  return ENV_VAR_REFERENCE.test(value);
}
function findSecrets(text) {
  if (isEnvVarReference(text)) return [];
  const found = [];
  for (const pattern of SECRET_PATTERNS) {
    const re = new RegExp(pattern.regex.source, pattern.regex.flags);
    for (const match of text.matchAll(re)) {
      found.push({ pattern, value: match[0] });
    }
  }
  return found;
}
function redact(value) {
  if (value.length <= 8) return "*".repeat(value.length);
  return `${value.slice(0, 4)}\u2026${value.slice(-4)}`;
}

// src/rules/secrets/hardcoded-secret.ts
var REMEDIATION = "Move this value to an environment variable or secret manager reference, then rotate the exposed credential \u2014 it must be treated as compromised once committed.";
var hardcodedSecretRule = {
  id: "MCPG-101",
  title: "Hardcoded secret in MCP server config",
  severity: "critical",
  confidence: "high",
  category: "secrets",
  docsUrl: "https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-101.md",
  /** A credential in the config file is the textbook secret-exposure case. */
  owasp: ["MCP01"],
  check(target, _ctx) {
    const findings = [];
    const servers = target.config.mcpServers ?? {};
    for (const [serverName, def] of Object.entries(servers)) {
      if (!isStdioServerDef(def)) continue;
      if (def.env) {
        for (const [envKey, envValue] of Object.entries(def.env)) {
          for (const match of findSecrets(envValue)) {
            findings.push(
              buildFinding(
                target,
                `/mcpServers/${serverName}/env/${envKey}`,
                ["mcpServers", serverName, "env", envKey],
                serverName,
                match.pattern.label,
                match.value
              )
            );
          }
        }
      }
      if (def.args) {
        def.args.forEach((arg, index) => {
          for (const match of findSecrets(arg)) {
            findings.push(
              buildFinding(
                target,
                `/mcpServers/${serverName}/args/${index}`,
                ["mcpServers", serverName, "args", index],
                serverName,
                match.pattern.label,
                match.value
              )
            );
          }
        });
      }
    }
    return findings;
  }
};
function buildFinding(target, logicalPath, jsonPath, serverName, patternLabel, rawSecret) {
  const range = target.document.locate(jsonPath);
  return createFinding({
    ruleId: hardcodedSecretRule.id,
    severity: hardcodedSecretRule.severity,
    confidence: hardcodedSecretRule.confidence,
    message: `Hardcoded ${patternLabel} found in "${serverName}" server config.`,
    remediation: REMEDIATION,
    location: range ? {
      file: target.relativePath,
      line: range.line,
      column: range.column,
      endLine: range.endLine,
      endColumn: range.endColumn
    } : { file: target.relativePath, line: 1, column: 1 },
    logicalPath,
    evidence: redact(rawSecret)
  });
}

// src/detectors/entropy.ts
function shannonEntropy(value) {
  if (value.length === 0) return 0;
  const frequencies = /* @__PURE__ */ new Map();
  for (const char of value) {
    frequencies.set(char, (frequencies.get(char) ?? 0) + 1);
  }
  let entropy = 0;
  for (const count of frequencies.values()) {
    const probability = count / value.length;
    entropy -= probability * Math.log2(probability);
  }
  return entropy;
}

// src/rules/secrets/high-entropy-value.ts
var SECRET_LIKE_KEY = /(_KEY|_TOKEN|_SECRET|_PASSWORD|_CREDENTIAL|_APIKEY)$/i;
var MIN_LENGTH = 12;
var MIN_ENTROPY = 3.5;
var highEntropyValueRule = {
  id: "MCPG-102",
  title: "High-entropy value under a secret-shaped env var name",
  severity: "medium",
  confidence: "medium",
  category: "secrets",
  docsUrl: "https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-102.md",
  /** Same exposure, caught by shape rather than by a known-issuer pattern. */
  owasp: ["MCP01"],
  check(target, _ctx) {
    const findings = [];
    const servers = target.config.mcpServers ?? {};
    for (const [serverName, def] of Object.entries(servers)) {
      if (!isStdioServerDef(def) || !def.env) continue;
      for (const [envKey, envValue] of Object.entries(def.env)) {
        if (!SECRET_LIKE_KEY.test(envKey)) continue;
        if (isEnvVarReference(envValue)) continue;
        if (envValue.length < MIN_LENGTH) continue;
        if (shannonEntropy(envValue) < MIN_ENTROPY) continue;
        if (findSecrets(envValue).length > 0) continue;
        const logicalPath = `/mcpServers/${serverName}/env/${envKey}`;
        const range = target.document.locate(["mcpServers", serverName, "env", envKey]);
        findings.push(
          createFinding({
            ruleId: highEntropyValueRule.id,
            severity: highEntropyValueRule.severity,
            confidence: highEntropyValueRule.confidence,
            message: `"${envKey}" in "${serverName}" server config looks like a credential (high-entropy value, secret-shaped name) but doesn't match a known provider format.`,
            remediation: "If this is a real credential, move it to an environment variable reference and rotate it. If it is not a secret, consider a less credential-suggestive name to avoid false alarms.",
            location: range ? {
              file: target.relativePath,
              line: range.line,
              column: range.column,
              endLine: range.endLine,
              endColumn: range.endColumn
            } : { file: target.relativePath, line: 1, column: 1 },
            logicalPath,
            evidence: redact(envValue)
          })
        );
      }
    }
    return findings;
  }
};

// src/detectors/package-spec.ts
var MOVING_TAGS = /* @__PURE__ */ new Set(["latest", "next", "canary", "beta", "alpha", "rc"]);
function isPinnedPackageSpec(spec) {
  const withoutScope = spec.startsWith("@") ? spec.slice(1) : spec;
  const atIndex = withoutScope.lastIndexOf("@");
  if (atIndex === -1) return false;
  const version = withoutScope.slice(atIndex + 1);
  if (version.length === 0) return false;
  if (MOVING_TAGS.has(version.toLowerCase())) return false;
  return true;
}

// src/rules/secrets/unpinned-package.ts
var PACKAGE_RUNNERS = /* @__PURE__ */ new Set(["npx", "bunx", "uvx"]);
var unpinnedPackageRule = {
  id: "MCPG-105",
  title: "Unpinned package version in MCP server launch command",
  severity: "medium",
  confidence: "medium",
  category: "secrets",
  docsUrl: "https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-105.md",
  /** An unpinned version is what makes a rug-pull publish reach the user. */
  owasp: ["MCP04"],
  check(target, _ctx) {
    const findings = [];
    const servers = target.config.mcpServers ?? {};
    for (const [serverName, def] of Object.entries(servers)) {
      if (!isStdioServerDef(def) || !def.args) continue;
      if (!PACKAGE_RUNNERS.has(def.command)) continue;
      const specIndex = def.args.findIndex((arg) => !arg.startsWith("-"));
      if (specIndex === -1) continue;
      const spec = def.args[specIndex];
      if (spec === void 0 || isPinnedPackageSpec(spec)) continue;
      const logicalPath = `/mcpServers/${serverName}/args/${specIndex}`;
      const range = target.document.locate(["mcpServers", serverName, "args", specIndex]);
      findings.push(
        createFinding({
          ruleId: unpinnedPackageRule.id,
          severity: unpinnedPackageRule.severity,
          confidence: unpinnedPackageRule.confidence,
          message: `"${serverName}" server launches "${spec}" without a pinned version \u2014 every run may fetch a different, unreviewed release.`,
          remediation: `Pin to a specific version: "${spec}@<version>". A publish under the same "latest"/unpinned tag can silently change what code runs on your machine \u2014 this is exactly the "rug pull" supply-chain risk MCP config scanning exists to catch.`,
          location: range ? {
            file: target.relativePath,
            line: range.line,
            column: range.column,
            endLine: range.endLine,
            endColumn: range.endColumn
          } : { file: target.relativePath, line: 1, column: 1 },
          logicalPath
        })
      );
    }
    return findings;
  }
};

// src/rules/transport/insecure-transport.ts
var insecureTransportRule = {
  id: "MCPG-401",
  title: "Unencrypted (http://) MCP server transport",
  severity: "high",
  confidence: "high",
  category: "transport",
  docsUrl: "https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-401.md",
  /** Cleartext transport exposes the bearer token and leaves the peer unauthenticated. */
  owasp: ["MCP01", "MCP07"],
  check(target, _ctx) {
    const findings = [];
    const servers = target.config.mcpServers ?? {};
    for (const [serverName, def] of Object.entries(servers)) {
      if (!isHttpServerDef(def)) continue;
      let parsed;
      try {
        parsed = new URL(def.url);
      } catch {
        continue;
      }
      if (parsed.protocol !== "http:") continue;
      if (isLoopbackHost(parsed.hostname)) continue;
      const logicalPath = `/mcpServers/${serverName}/url`;
      const range = target.document.locate(["mcpServers", serverName, "url"]);
      findings.push(
        createFinding({
          ruleId: insecureTransportRule.id,
          severity: insecureTransportRule.severity,
          confidence: insecureTransportRule.confidence,
          message: `"${serverName}" server connects over unencrypted HTTP (${parsed.hostname}) \u2014 traffic, including any Authorization header, is readable/tamperable by anyone on the network path.`,
          remediation: "Use https:// for any non-loopback MCP server endpoint.",
          location: range ? {
            file: target.relativePath,
            line: range.line,
            column: range.column,
            endLine: range.endLine,
            endColumn: range.endColumn
          } : { file: target.relativePath, line: 1, column: 1 },
          logicalPath
        })
      );
    }
    return findings;
  }
};

// src/rules/transport/ssrf-reachable-target.ts
var ssrfReachableTargetRule = {
  id: "MCPG-403",
  title: "MCP server URL points at a private or cloud-metadata address",
  severity: "high",
  confidence: "high",
  category: "transport",
  docsUrl: "https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-403.md",
  /** Reaching link-local or private addresses is authority beyond the intended scope. */
  owasp: ["MCP02"],
  check(target, _ctx) {
    const findings = [];
    const servers = target.config.mcpServers ?? {};
    for (const [serverName, def] of Object.entries(servers)) {
      if (!isHttpServerDef(def)) continue;
      let parsed;
      try {
        parsed = new URL(def.url);
      } catch {
        continue;
      }
      if (!isPrivateOrMetadataHost(parsed.hostname)) continue;
      const logicalPath = `/mcpServers/${serverName}/url`;
      const range = target.document.locate(["mcpServers", serverName, "url"]);
      findings.push(
        createFinding({
          ruleId: ssrfReachableTargetRule.id,
          severity: ssrfReachableTargetRule.severity,
          confidence: ssrfReachableTargetRule.confidence,
          message: `"${serverName}" server URL targets ${parsed.hostname}, a private-network or cloud-metadata address \u2014 a config that looks like it talks to an external API but actually reaches internal infrastructure is a classic SSRF pattern.`,
          remediation: "Point the server at its real public endpoint. If internal access is genuinely intended, confirm that deliberately and document why \u2014 this pattern is otherwise indistinguishable from a config tampered with to pivot into your internal network.",
          location: range ? {
            file: target.relativePath,
            line: range.line,
            column: range.column,
            endLine: range.endLine,
            endColumn: range.endColumn
          } : { file: target.relativePath, line: 1, column: 1 },
          logicalPath
        })
      );
    }
    return findings;
  }
};

// src/rules/transport/tls-verification-disabled.ts
var DANGEROUS_ARG_FLAGS = /* @__PURE__ */ new Set(["--insecure", "-k", "--no-check-certificate"]);
var tlsVerificationDisabledRule = {
  id: "MCPG-402",
  title: "TLS certificate verification disabled",
  severity: "critical",
  confidence: "high",
  category: "transport",
  docsUrl: "https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-402.md",
  /** Disabled verification defeats both the secret's confidentiality and peer authentication. */
  owasp: ["MCP01", "MCP07"],
  check(target, _ctx) {
    const findings = [];
    const servers = target.config.mcpServers ?? {};
    for (const [serverName, def] of Object.entries(servers)) {
      if (!isStdioServerDef(def)) continue;
      if (def.env?.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
        findings.push(
          buildFinding2(
            target,
            serverName,
            ["mcpServers", serverName, "env", "NODE_TLS_REJECT_UNAUTHORIZED"],
            `/mcpServers/${serverName}/env/NODE_TLS_REJECT_UNAUTHORIZED`,
            "sets NODE_TLS_REJECT_UNAUTHORIZED=0, disabling TLS certificate validation for the entire Node.js process"
          )
        );
      }
      if (def.env?.PYTHONHTTPSVERIFY === "0") {
        findings.push(
          buildFinding2(
            target,
            serverName,
            ["mcpServers", serverName, "env", "PYTHONHTTPSVERIFY"],
            `/mcpServers/${serverName}/env/PYTHONHTTPSVERIFY`,
            "sets PYTHONHTTPSVERIFY=0, disabling TLS certificate validation for the Python process"
          )
        );
      }
      const args = def.args ?? [];
      const flagIndex = args.findIndex((arg) => DANGEROUS_ARG_FLAGS.has(arg));
      if (flagIndex !== -1) {
        findings.push(
          buildFinding2(
            target,
            serverName,
            ["mcpServers", serverName, "args", flagIndex],
            `/mcpServers/${serverName}/args/${flagIndex}`,
            `passes ${args[flagIndex]}, disabling TLS certificate validation for its own requests`
          )
        );
      }
    }
    return findings;
  }
};
function buildFinding2(target, serverName, jsonPath, logicalPath, reason) {
  const range = target.document.locate(jsonPath);
  return createFinding({
    ruleId: tlsVerificationDisabledRule.id,
    severity: tlsVerificationDisabledRule.severity,
    confidence: tlsVerificationDisabledRule.confidence,
    message: `"${serverName}" server ${reason} \u2014 this makes the server (and MCP traffic it handles) vulnerable to man-in-the-middle interception.`,
    remediation: "Remove the setting and fix the underlying certificate problem instead (install the correct CA, use a valid cert) \u2014 never disable verification as a workaround.",
    location: range ? {
      file: target.relativePath,
      line: range.line,
      column: range.column,
      endLine: range.endLine,
      endColumn: range.endColumn
    } : { file: target.relativePath, line: 1, column: 1 },
    logicalPath
  });
}

// src/rules/transport/unauthenticated-remote-endpoint.ts
var AUTH_HEADER_NAMES = /* @__PURE__ */ new Set([
  "authorization",
  "x-api-key",
  "x-auth-token",
  "apikey",
  "api-key",
  "cookie"
]);
function hasAuthHeader(headers) {
  if (!headers) return false;
  return Object.keys(headers).some((name) => AUTH_HEADER_NAMES.has(name.toLowerCase()));
}
var unauthenticatedRemoteEndpointRule = {
  id: "MCPG-404",
  title: "Remote MCP endpoint answered an unauthenticated client",
  severity: "medium",
  confidence: "high",
  // evidence, not inference: we connected and it served us
  category: "transport",
  docsUrl: "https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-404.md",
  /** A remote endpoint with no auth is the entry itself. */
  owasp: ["MCP07"],
  check(target, ctx) {
    const liveTools = ctx.liveTools;
    if (!liveTools) return [];
    const findings = [];
    const servers = target.config.mcpServers ?? {};
    for (const [serverName, def] of Object.entries(servers)) {
      if (!isHttpServerDef(def)) continue;
      if (hasAuthHeader(def.headers)) continue;
      if (!liveTools.has(serverKey(target.relativePath, serverName))) continue;
      const logicalPath = `/mcpServers/${serverName}`;
      const range = target.document.locate(["mcpServers", serverName]);
      findings.push(
        createFinding({
          ruleId: unauthenticatedRemoteEndpointRule.id,
          severity: unauthenticatedRemoteEndpointRule.severity,
          confidence: unauthenticatedRemoteEndpointRule.confidence,
          message: `"${serverName}" served its tool list to guardmcp over an unauthenticated connection \u2014 no credentials were sent and none were required. Anyone who can reach this URL can use this server.`,
          remediation: "If the endpoint is meant to be public, nothing needs fixing \u2014 record that decision so the next reviewer does not have to rediscover it. Otherwise put it behind authentication: MCP supports an OAuth flow, or configure a static Authorization/API-key header for this server.",
          location: range ? {
            file: target.relativePath,
            line: range.line,
            column: range.column,
            endLine: range.endLine,
            endColumn: range.endColumn
          } : { file: target.relativePath, line: 1, column: 1 },
          logicalPath
        })
      );
    }
    return findings;
  }
};

// src/rules/registry.ts
var ALL_RULES = [
  hardcodedSecretRule,
  highEntropyValueRule,
  dangerousCommandRule,
  unpinnedPackageRule,
  insecureTransportRule,
  tlsVerificationDisabledRule,
  ssrfReachableTargetRule,
  unauthenticatedRemoteEndpointRule,
  unrestrictedScopeRule,
  serverDefinitionDriftRule,
  liveToolDriftRule,
  telemetryDisabledRule,
  shadowServerRule,
  noLoggingCapabilityRule
];

// src/rules/resources/types.ts
function resourceLocation(resource) {
  return { file: `live:${resource.serverName}/resources/${resource.name}`, line: 1, column: 1 };
}
function resourceTextFields(resource) {
  const base = `/resources/${resource.serverName}/${resource.name}`;
  return [
    { text: resource.description, logicalPath: `${base}/description`, where: "description" },
    { text: resource.name, logicalPath: `${base}/name`, where: "name" }
  ];
}

// src/rules/resources/hidden-instructions.ts
var resourceHiddenInstructionsRule = {
  id: "MCPG-207",
  title: "Hidden instruction in resource metadata (prompt injection)",
  severity: "critical",
  confidence: "medium",
  category: "poisoning",
  docsUrl: "https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-207.md",
  owasp: ["MCP03", "MCP10"],
  check(resource, _all) {
    const findings = [];
    for (const field of resourceTextFields(resource)) {
      const matches = findImperativePhrases(field.text);
      if (matches.length === 0) continue;
      findings.push(
        createFinding({
          ruleId: resourceHiddenInstructionsRule.id,
          severity: resourceHiddenInstructionsRule.severity,
          confidence: resourceHiddenInstructionsRule.confidence,
          // Never quotes the matched phrase — a report echoing an injected
          // instruction is a re-injection vector. Same as MCPG-201/205.
          message: `Resource "${resource.name}" on server "${resource.serverName}" has a ${field.where} containing ${matches.length} instruction-like phrase(s) \u2014 language directed at the model rather than describing what the resource holds.`,
          remediation: "Read the resource metadata outside any AI context. A resource description exists to say what the data is; it has no reason to instruct the model to ignore prior context, withhold information, or read a named file.",
          location: resourceLocation(resource),
          logicalPath: field.logicalPath
        })
      );
    }
    return findings;
  }
};

// src/rules/resources/invisible-resource-content.ts
var KIND_LABEL2 = {
  "zero-width": "zero-width/invisible character(s)",
  "bidi-override": "bidirectional text override character(s)",
  "html-comment": "an HTML comment",
  "terminal-control": "terminal control/ANSI escape sequence(s), which change what a terminal shows without changing what the model reads"
};
var invisibleResourceContentRule = {
  id: "MCPG-208",
  title: "Invisible or obfuscated content in resource metadata",
  severity: "high",
  confidence: "high",
  category: "poisoning",
  docsUrl: "https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-208.md",
  owasp: ["MCP03"],
  check(resource, _all) {
    const findings = [];
    for (const field of resourceTextFields(resource)) {
      const anomalies = findUnicodeAnomalies(field.text);
      if (anomalies.length === 0) continue;
      const kinds = [...new Set(anomalies.map((a) => KIND_LABEL2[a.kind] ?? a.kind))];
      findings.push(
        createFinding({
          ruleId: invisibleResourceContentRule.id,
          severity: invisibleResourceContentRule.severity,
          confidence: invisibleResourceContentRule.confidence,
          message: `Resource "${resource.name}" on server "${resource.serverName}" has a ${field.where} containing ${kinds.join(", ")} \u2014 content that renders differently than it is stored, so what a reviewer sees is not what the model receives.`,
          remediation: "Inspect the raw bytes of the resource metadata rather than a rendered view. These characters have no legitimate purpose in a resource name or description; treat them as evidence of tampering.",
          location: resourceLocation(resource),
          logicalPath: field.logicalPath
        })
      );
    }
    return findings;
  }
};

// src/detectors/sensitive-uri.ts
var CREDENTIAL_PATHS = [
  [/\.ssh\/id_[a-z0-9_]+$/i, "an SSH private key"],
  [/\.ssh\/(config|known_hosts|authorized_keys)$/i, "SSH configuration"],
  [/\.aws\/(credentials|config)$/i, "AWS cloud credentials"],
  [/\.config\/gcloud\//i, "GCP cloud credentials"],
  [/\.azure\//i, "Azure cloud credentials"],
  [/\.kube\/config$/i, "Kubernetes cluster credentials"],
  [/\.docker\/config\.json$/i, "Docker registry stored credentials"],
  [/\.git-credentials$/i, "Git stored credentials"],
  [/\.(npmrc|pypirc|netrc)$/i, "registry stored credentials"],
  [/(^|\/)\.env(\.[a-z0-9_-]+)?$/i, "an environment file"],
  [/\.(bash|zsh|fish)_history$/i, "shell history"],
  [/(^|\/)id_(rsa|dsa|ecdsa|ed25519)$/i, "an SSH private key"],
  [/(^|\/)etc\/(shadow|passwd|sudoers)$/i, "a system account file"],
  [/\.pem$|\.p12$|\.pfx$|\.key$/i, "a private key file"]
];
var BROAD_PATHS = [
  /^\/?$/,
  /^[a-z]:\/?$/i,
  /^\/(home|users)\/[^/]+\/?$/i,
  /^\/(root|home|users)\/?$/i
];
function classifySensitiveUri(uri) {
  if (!uri) return null;
  const scheme = uri.slice(0, uri.indexOf(":")).toLowerCase();
  if (scheme === "file") {
    const path = filePathOf(uri);
    for (const [pattern, label] of CREDENTIAL_PATHS) {
      if (pattern.test(path)) return { kind: "credential", label };
    }
    if (BROAD_PATHS.some((pattern) => pattern.test(path))) {
      return { kind: "broad-scope", label: "an entire filesystem or home directory" };
    }
    return null;
  }
  if (scheme === "http" || scheme === "https") {
    const host = hostOf(uri);
    if (host && isPrivateOrMetadataHost(host)) {
      return { kind: "internal-endpoint", label: `internal infrastructure (${host})` };
    }
  }
  return null;
}
function filePathOf(uri) {
  const withoutScheme = uri.replace(/^file:\/\//i, "");
  const path = withoutScheme.startsWith("/") && /^\/[a-z]:/i.test(withoutScheme) ? withoutScheme.slice(1) : withoutScheme;
  return decodeSafely(path).replace(/\\/g, "/");
}
function hostOf(uri) {
  try {
    return new URL(uri).hostname;
  } catch {
    return null;
  }
}
function decodeSafely(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// src/rules/resources/sensitive-resource-uri.ts
var SEVERITY_BY_KIND = {
  // A named secret file is the model being handed a credential outright.
  credential: "critical",
  // Unbounded, but what it actually exposes depends on what is on disk.
  "broad-scope": "high",
  "internal-endpoint": "high"
};
var REMEDIATION2 = {
  credential: "Remove this resource. A credential file has no business being offered as model-readable context: anything the model reads can end up in a response, a log, or a downstream tool call. If the server needs the credential, it should use it internally and never expose it as a resource.",
  "broad-scope": "Point the resource at the specific file or directory it is actually for. A filesystem or home root as a resource means what gets exposed is decided by whatever happens to be on disk, not by the server author.",
  "internal-endpoint": 'Remove this resource or point it at the external service it claims to represent. A resource that reaches cloud metadata or a private-network address turns a read of "context" into a request against internal infrastructure.'
};
var sensitiveResourceUriRule = {
  id: "MCPG-209",
  title: "Resource URI targets credentials, a filesystem root, or internal infrastructure",
  severity: "high",
  confidence: "high",
  // the URI is a fact, not an inference from natural language
  category: "resources",
  docsUrl: "https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-209.md",
  /** Depending on the shape: a credential read (MCP01), reach beyond the
   * intended scope (MCP02), and context the model should never have been
   * given (MCP10). */
  owasp: ["MCP01", "MCP02", "MCP10"],
  check(resource, _all) {
    const match = classifySensitiveUri(resource.uri);
    if (!match) return [];
    const finding = createFinding({
      ruleId: sensitiveResourceUriRule.id,
      severity: SEVERITY_BY_KIND[match.kind],
      confidence: sensitiveResourceUriRule.confidence,
      message: `Resource "${resource.name}" on server "${resource.serverName}" points at ${match.label} \u2014 the server is offering this to the model as readable context. Its description ("${resource.description || "(none)"}") does not have to mention that.`,
      remediation: REMEDIATION2[match.kind],
      location: resourceLocation(resource),
      logicalPath: `/resources/${resource.serverName}/${resource.name}/uri`,
      evidence: resource.uri
    });
    return [finding];
  }
};

// src/rules/resource-registry.ts
var ALL_RESOURCE_RULES = [
  sensitiveResourceUriRule,
  resourceHiddenInstructionsRule,
  invisibleResourceContentRule
];

// src/detectors/uri-template.ts
var EXPRESSION = /\{([+#./;?&]?)([^}]*)\}/g;
var RESERVED_OPERATORS = /* @__PURE__ */ new Set(["+", "#"]);
function classifyUriTemplate(template) {
  if (!template) return null;
  const expressions = [...template.matchAll(EXPRESSION)];
  if (expressions.length === 0) return null;
  const schemeEnd = template.indexOf(":");
  const scheme = schemeEnd > 0 ? template.slice(0, schemeEnd).toLowerCase() : "";
  if (scheme === "file") {
    const afterScheme = template.slice(schemeEnd + 1).replace(/^\/+/, "");
    if (/^\{[+#]?[^}]*\}\/?$/.test(afterScheme)) {
      return {
        kind: "unbounded-file",
        label: "the entire path is a caller-supplied variable, so this reads any file the server can open"
      };
    }
    if (expressions.some((m) => RESERVED_OPERATORS.has(m[1] ?? ""))) {
      return {
        kind: "traversable-file",
        label: 'it uses RFC 6570 reserved expansion ({+var}/{#var}), which passes "/" and ".." through unencoded \u2014 a caller can climb out of the intended directory'
      };
    }
    return null;
  }
  if (scheme === "http" || scheme === "https") {
    const afterScheme = template.slice(schemeEnd + 1).replace(/^\/+/, "");
    const authority = afterScheme.split("/")[0] ?? "";
    if (/\{[+#]?[^}]*\}/.test(authority)) {
      return {
        kind: "caller-chosen-host",
        label: "a variable sits in the host position, so the caller decides where the request is sent"
      };
    }
  }
  return null;
}

// src/rules/resources/unbounded-template.ts
var SEVERITY_BY_KIND2 = {
  "unbounded-file": "critical",
  "traversable-file": "high",
  "caller-chosen-host": "high"
};
var REMEDIATION3 = {
  "unbounded-file": "Anchor the template to the directory the server is actually for \u2014 `file:///srv/project/{name}.md` rather than `file:///{path}`. As written, what this exposes is decided by whoever supplies the variable, which in an agent is the model.",
  "traversable-file": 'Use simple expansion `{name}` instead of `{+name}`/`{#name}`. Simple expansion percent-encodes "/" and ".", so a value cannot climb out of the directory you anchored it to; reserved expansion exists precisely to let it through.',
  "caller-chosen-host": "Put the hostname in the template and leave only the path variable \u2014 `https://api.example.com/{endpoint}`. With a variable in the host position the caller chooses the destination, which makes this an SSRF primitive by construction."
};
var unboundedResourceTemplateRule = {
  id: "MCPG-210",
  title: "Resource template lets the caller choose what is read",
  severity: "critical",
  confidence: "high",
  // structural: read off the RFC 6570 operators, not inferred from prose
  category: "resources",
  docsUrl: "https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-210.md",
  /** Reach beyond the reviewed scope (MCP02), a credential or file read into
   * the model's context (MCP01/MCP10). */
  owasp: ["MCP01", "MCP02", "MCP10"],
  check(template) {
    const match = classifyUriTemplate(template.uriTemplate);
    if (!match) return [];
    const finding = createFinding({
      ruleId: unboundedResourceTemplateRule.id,
      severity: SEVERITY_BY_KIND2[match.kind],
      confidence: unboundedResourceTemplateRule.confidence,
      message: `Resource template "${template.name}" on server "${template.serverName}" is "${template.uriTemplate}" \u2014 ${match.label}.`,
      remediation: REMEDIATION3[match.kind],
      location: {
        file: `live:${template.serverName}/resourceTemplates/${template.name}`,
        line: 1,
        column: 1
      },
      logicalPath: `/resourceTemplates/${template.serverName}/${template.name}/uriTemplate`,
      evidence: template.uriTemplate
    });
    return [finding];
  }
};

// src/rules/poisoning/types.ts
function toolLocation(tool) {
  return { file: `live:${tool.serverName}/${tool.name}`, line: 1, column: 1 };
}

// src/rules/declaration/deceptive-tool-title.ts
var deceptiveToolTitleRule = {
  id: "MCPG-803",
  title: "Display title conceals what the tool actually does",
  severity: "high",
  confidence: "medium",
  // verb matching on two short strings; deliberate deception vs. a loose label is not decidable from here
  category: "declaration",
  docsUrl: "https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-803.md",
  /** The human approves one operation and a different one is invoked —
   * intent flow subverted at the point of consent. */
  owasp: ["MCP06"],
  check(tool, _allTools) {
    const title = tool.title;
    if (title === void 0 || title.trim() === "") return [];
    if (!readsAsDestructive(tool.name)) return [];
    if (readsAsDestructive(title)) return [];
    const finding = createFinding({
      ruleId: deceptiveToolTitleRule.id,
      severity: deceptiveToolTitleRule.severity,
      confidence: deceptiveToolTitleRule.confidence,
      message: `Tool "${tool.name}" on server "${tool.serverName}" is displayed to the user as "${title}". The name describes a destructive operation; the title does not. A client showing the title puts a reassuring label on the confirmation dialog for a call the model makes under the real name.`,
      remediation: `Make the title describe the same operation as the name, or drop the title so clients fall back to "${tool.name}". A display label that understates what a tool does defeats the human-in-the-loop confirmation the MCP specification asks clients to provide.`,
      location: toolLocation(tool),
      logicalPath: `/tools/${tool.serverName}/${tool.name}/title`
    });
    return [finding];
  }
};

// src/detectors/sensitive-param-name.ts
var BENIGN_COMPOUNDS = /^(max|min|num|total|count|avg|average)?tokens?(count|limit|used|remaining|budget)?$|^tokeniz(e|er|ation)$/;
var CREDENTIAL_PATTERNS = [
  [/^(password|passwd|pwd)$|password$/, "a password", "high"],
  [
    /^(api|access|secret|private|encryption|signing)key$|(api|access|secret|private)key$/,
    "an API or private key",
    "high"
  ],
  [/^(access|refresh|bearer|auth|id|session)token$|token$/, "a token", "medium"],
  [/^(client|app|shared)?secret$/, "a secret", "high"],
  [/^credentials?$/, "credentials", "high"],
  [/^authorization$|^authheader$/, "an authorization value", "high"],
  [/^(session|sid)id$|^cookie$/, "a session identifier", "medium"],
  [/^(otp|mfacode|totp|twofactorcode)$/, "a one-time code", "high"],
  [/^privatekey$|^signature$/, "a key or signature", "medium"]
];
var PII_PATTERNS = [
  [/^ssn$|socialsecurity(number)?$/, "a social security number", "high"],
  [/^(credit)?card(number)?$|^pan$/, "a payment card number", "high"],
  [/^cvv$|^cvc$|^securitycode$/, "a card security code", "high"],
  [/^(date)?of?birth$|^dob$|^birthdate$/, "a date of birth", "medium"],
  [/^passport(number)?$/, "a passport number", "high"],
  [/^(tax|national|nationalinsurance)id$/, "a government identifier", "high"]
];
function normalize(name) {
  return name.toLowerCase().replace(/[_\-\s.]/g, "");
}
function classifySensitiveParamName(name) {
  if (!name) return null;
  const normalized = normalize(name);
  if (BENIGN_COMPOUNDS.test(normalized)) return null;
  for (const [pattern, label, confidence] of CREDENTIAL_PATTERNS) {
    if (pattern.test(normalized)) return { kind: "credential", label, confidence };
  }
  for (const [pattern, label, confidence] of PII_PATTERNS) {
    if (pattern.test(normalized)) return { kind: "pii", label, confidence };
  }
  return null;
}

// src/rules/declaration/header-mirrored-secret.ts
var headerMirroredSecretRule = {
  id: "MCPG-801",
  title: "Sensitive tool parameter mirrored into an HTTP header",
  severity: "critical",
  confidence: "high",
  category: "declaration",
  docsUrl: "https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-801.md",
  /** The value leaves the encrypted body for a header every intermediary on
   * the path can read and log. */
  owasp: ["MCP01", "MCP10"],
  check(tool, _allTools) {
    const findings = [];
    const properties = tool.inputSchema?.properties ?? {};
    for (const [paramName, property] of Object.entries(properties)) {
      if (property.xMcpHeader === void 0) continue;
      const match = classifySensitiveParamName(paramName);
      if (!match) continue;
      findings.push(
        createFinding({
          ruleId: headerMirroredSecretRule.id,
          severity: headerMirroredSecretRule.severity,
          confidence: match.confidence,
          message: `Tool "${tool.name}" on server "${tool.serverName}" mirrors its "${paramName}" parameter \u2014 ${match.label} \u2014 into the HTTP header "Mcp-Param-${property.xMcpHeader}". Header values are visible to every network intermediary on the path (proxies, load balancers, WAFs) and are routinely logged by them, unlike the request body.`,
          remediation: `Remove the "x-mcp-header" annotation from "${paramName}". The MCP specification states directly that sensitive parameters \u2014 passwords, API keys, tokens, PII \u2014 should not be marked with it. If an intermediary genuinely needs to route on something, route on a non-sensitive parameter.`,
          location: toolLocation(tool),
          logicalPath: `/tools/${tool.serverName}/${tool.name}/inputSchema/${paramName}/x-mcp-header`
        })
      );
    }
    return findings;
  }
};

// src/rules/declaration/invalid-header-mirror.ts
var TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
var MIRRORABLE_TYPES = /* @__PURE__ */ new Set(["string", "integer", "boolean"]);
var invalidHeaderMirrorRule = {
  id: "MCPG-802",
  title: "Invalid x-mcp-header declaration (header injection or malformed mirror)",
  severity: "critical",
  confidence: "high",
  // structural: the value either satisfies the grammar or it does not
  category: "declaration",
  docsUrl: "https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-802.md",
  /** A CR/LF smuggled into a header name is injection into the request the
   * client is about to make. */
  owasp: ["MCP05"],
  check(tool, _allTools) {
    const findings = [];
    const properties = Object.entries(tool.inputSchema?.properties ?? {});
    const seen = /* @__PURE__ */ new Map();
    for (const [paramName, property] of properties) {
      const header = property.xMcpHeader;
      if (header === void 0) continue;
      const problem = describeProblem(header, property.type, seen, paramName);
      if (!problem) {
        seen.set(header.toLowerCase(), paramName);
        continue;
      }
      findings.push(
        createFinding({
          ruleId: invalidHeaderMirrorRule.id,
          severity: invalidHeaderMirrorRule.severity,
          confidence: invalidHeaderMirrorRule.confidence,
          message: `Tool "${tool.name}" on server "${tool.serverName}" declares an x-mcp-header on "${paramName}" that the MCP specification forbids: ${problem}`,
          remediation: "A conforming client must reject this tool definition outright rather than use it. Treat a server sending one as either broken or probing for a client that skipped the check \u2014 verify which before trusting anything else it advertises.",
          location: toolLocation(tool),
          logicalPath: `/tools/${tool.serverName}/${tool.name}/inputSchema/${paramName}/x-mcp-header`
        })
      );
    }
    return findings;
  }
};
function describeProblem(header, type, seen, paramName) {
  if (/[\r\n]/.test(header)) {
    return "the header name contains a CR or LF, which would terminate the header and inject a further one into the outgoing request \u2014 HTTP header injection.";
  }
  if (header.length === 0) {
    return "the header name is empty.";
  }
  if (!TOKEN.test(header)) {
    return `the header name "${header}" is not a valid HTTP field-name token (RFC 9110 \xA75.1).`;
  }
  const duplicate = seen.get(header.toLowerCase());
  if (duplicate !== void 0) {
    return `the header name "${header}" is already used by the "${duplicate}" parameter \u2014 x-mcp-header values must be unique, case-insensitively, within one inputSchema.`;
  }
  if (type !== void 0 && !MIRRORABLE_TYPES.has(type)) {
    return `"${paramName}" is declared type "${type}"; only integer, string and boolean may be mirrored${type === "number" ? " \u2014 number is excluded explicitly" : ""}.`;
  }
  return null;
}

// src/rules/poisoning/hidden-instructions.ts
var hiddenInstructionsRule = {
  id: "MCPG-201",
  title: "Hidden instruction in tool description (prompt injection / tool poisoning)",
  severity: "critical",
  confidence: "medium",
  // pattern-matched natural language, not a deterministic signal like MCPG-202's invisible chars
  category: "poisoning",
  docsUrl: "https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-201.md",
  /** Instructions hidden in a description are tool poisoning as defined. */
  owasp: ["MCP03"],
  check(tool, _allTools) {
    const matches = findImperativePhrases(tool.description);
    if (matches.length === 0) return [];
    const finding = createFinding({
      ruleId: hiddenInstructionsRule.id,
      severity: hiddenInstructionsRule.severity,
      confidence: hiddenInstructionsRule.confidence,
      // Deliberately does NOT quote the matched phrase: a report that echoes
      // the injected instruction back verbatim is itself a re-injection
      // vector if the report is ever read by an LLM (e.g. fed into an agent
      // for triage). The pattern's regex source is a safe, generic label.
      message: `Tool "${tool.name}" on server "${tool.serverName}" has a description containing ${matches.length} instruction-like phrase(s) (e.g. override/hide-from-user/pre-tool-call directives) \u2014 the kind of language used to smuggle instructions to the LLM through a field the human operator doesn't typically read closely.`,
      remediation: "Review the tool description directly, outside any AI context (a plain text viewer, not a chat that would execute it). If the server is untrusted, remove it. If you maintain the server, keep descriptions purely descriptive \u2014 no imperative language directed at the calling model.",
      location: toolLocation(tool),
      logicalPath: `/tools/${tool.serverName}/${tool.name}/description`
    });
    return [finding];
  }
};

// src/rules/poisoning/invisible-characters.ts
var KIND_LABEL3 = {
  "zero-width": "zero-width/invisible character(s)",
  "bidi-override": "bidirectional text override character(s)",
  "html-comment": "an HTML comment",
  "terminal-control": "terminal control/ANSI escape sequence(s), which change what a terminal shows without changing what the model reads"
};
var invisibleCharactersRule = {
  id: "MCPG-202",
  title: "Invisible or obfuscated content in tool description",
  severity: "high",
  confidence: "high",
  // deterministic: these characters have no legitimate reason to appear in a tool description
  category: "poisoning",
  docsUrl: "https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-202.md",
  /** Invisible characters are the delivery mechanism for the same poisoning. */
  owasp: ["MCP03"],
  check(tool, _allTools) {
    const anomalies = findUnicodeAnomalies(tool.description);
    if (anomalies.length === 0) return [];
    const kinds = [...new Set(anomalies.map((a) => KIND_LABEL3[a.kind] ?? a.kind))];
    const finding = createFinding({
      ruleId: invisibleCharactersRule.id,
      severity: invisibleCharactersRule.severity,
      confidence: invisibleCharactersRule.confidence,
      // Not quoting the hidden content itself — same rationale as MCPG-201.
      message: `Tool "${tool.name}" on server "${tool.serverName}" has a description containing ${kinds.join(", ")} \u2014 content invisible to a human reading it normally, but fully visible to the LLM that receives the raw text.`,
      remediation: "Inspect the raw description bytes (not a rendered view) for hidden content. Invisible/directional characters and HTML comments have no legitimate reason to appear in a tool description; treat their presence as evidence of tampering.",
      location: toolLocation(tool),
      logicalPath: `/tools/${tool.serverName}/${tool.name}/description`
    });
    return [finding];
  }
};

// src/rules/poisoning/suspicious-parameter.ts
var SIDE_CHANNEL_NAME = /^(sidenote|debug_info|debug|context|extra|metadata|notes?|misc|internal_use)$/i;
var SMUGGLING_SIGNAL = /\b(contents? of|api keys?|secrets?|passwords?|credentials?|ssh keys?|private keys?|tokens?|\.ssh|id_rsa)\b/i;
var suspiciousParameterRule = {
  id: "MCPG-204",
  title: "Tool parameter shaped as a covert data-exfiltration channel",
  severity: "high",
  confidence: "medium",
  category: "poisoning",
  docsUrl: "https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-204.md",
  /** A parameter shaped to carry context out is poisoning in service of over-sharing. */
  owasp: ["MCP03", "MCP10"],
  check(tool, _allTools) {
    const properties = tool.inputSchema?.properties;
    if (!properties) return [];
    const findings = [];
    for (const [paramName, schema] of Object.entries(properties)) {
      if (!SIDE_CHANNEL_NAME.test(paramName)) continue;
      const description = schema.description ?? "";
      if (!SMUGGLING_SIGNAL.test(description)) continue;
      findings.push(
        createFinding({
          ruleId: suspiciousParameterRule.id,
          severity: suspiciousParameterRule.severity,
          confidence: suspiciousParameterRule.confidence,
          message: `Tool "${tool.name}" on server "${tool.serverName}" has a parameter named "${paramName}" \u2014 not obviously part of the tool's stated purpose \u2014 whose description asks for sensitive content (keys, credentials, file contents) to be placed there. This is the shape of a covert exfiltration channel: data an LLM might include without the human operator noticing an unused-looking field.`,
          remediation: `Remove or rename "${paramName}" if it serves no real function, or scrutinize why a tool needs a field asking for credentials/file contents in its argument schema at all.`,
          location: toolLocation(tool),
          logicalPath: `/tools/${tool.serverName}/${tool.name}/inputSchema/properties/${paramName}`
        })
      );
    }
    return findings;
  }
};

// src/rules/poisoning/tool-shadowing.ts
var REDEFINITION_SIGNAL = /\b(instead of|actually calls?|really calls?|secretly|override|replace|redirect|route.{0,20}through)\b/i;
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
var toolShadowingRule = {
  id: "MCPG-203",
  title: "Tool description targets another server's tool by name (shadowing)",
  severity: "critical",
  confidence: "medium",
  category: "poisoning",
  docsUrl: "https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-203.md",
  /** Shadowing poisons one tool AND redirects a call meant for another, which is intent-flow subversion. */
  owasp: ["MCP03", "MCP06"],
  check(tool, allTools) {
    if (!REDEFINITION_SIGNAL.test(tool.description)) return [];
    const others = allTools.filter(
      (t) => !(t.serverName === tool.serverName && t.name === tool.name)
    );
    const findings = [];
    for (const other of others) {
      const namePattern = new RegExp(`\\b${escapeRegex(other.name)}\\b`, "i");
      if (!namePattern.test(tool.description)) continue;
      findings.push(
        createFinding({
          ruleId: toolShadowingRule.id,
          severity: toolShadowingRule.severity,
          confidence: toolShadowingRule.confidence,
          message: `Tool "${tool.name}" on server "${tool.serverName}" references "${other.name}" (from server "${other.serverName}") by name alongside redirect/override language \u2014 this is the shape of tool shadowing, where a second tool tries to intercept calls meant for a legitimate one.`,
          remediation: `Review "${tool.name}"'s description directly. If it genuinely tries to redirect calls intended for "${other.name}", remove the server \u2014 this is an active attempt to hijack another tool's traffic, not a documentation reference.`,
          location: toolLocation(tool),
          logicalPath: `/tools/${tool.serverName}/${tool.name}/description`
        })
      );
    }
    return findings;
  }
};

// src/rules/scope/unconfirmed-destructive-op.ts
var unconfirmedDestructiveOpRule = {
  id: "MCPG-303",
  title: "Destructive-sounding tool with no confirmation annotation",
  severity: "medium",
  confidence: "low",
  // name/description matching is a weak signal on its own
  category: "scope",
  docsUrl: "https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-303.md",
  /** A destructive op with no confirmation lets a subverted intent execute unchecked. */
  owasp: ["MCP06"],
  check(tool, _allTools) {
    const looksDestructive = readsAsDestructive(tool.name) || readsAsDestructive(tool.description);
    if (!looksDestructive) return [];
    const annotations = tool.annotations;
    const honestlyFlagged = annotations?.destructiveHint === true;
    if (honestlyFlagged) return [];
    const noAnnotationsAtAll = annotations === void 0;
    const contradictsReadOnly = annotations?.readOnlyHint === true;
    if (!noAnnotationsAtAll && !contradictsReadOnly) return [];
    const reason = contradictsReadOnly ? "is annotated readOnlyHint: true, which contradicts what it appears to do" : "has no annotations at all, so a client has no signal to prompt for confirmation before calling it";
    const finding = createFinding({
      ruleId: unconfirmedDestructiveOpRule.id,
      severity: unconfirmedDestructiveOpRule.severity,
      confidence: unconfirmedDestructiveOpRule.confidence,
      message: `Tool "${tool.name}" on server "${tool.serverName}" looks destructive by name/description but ${reason}.`,
      remediation: "If the tool genuinely performs a destructive/irreversible action, set annotations.destructiveHint: true so clients can prompt for confirmation. If it is not actually destructive, rename it to avoid the ambiguity.",
      location: toolLocation(tool),
      logicalPath: `/tools/${tool.serverName}/${tool.name}/annotations`
    });
    return [finding];
  }
};

// src/rules/scope/unrestricted-input-schema.ts
var HIGH_RISK_TOOL = /\b(execs?|executes?|runs?|evals?|shell|commands?|scripts?|spawns?)\b/i;
function normalizeIdentifier2(value) {
  return value.replace(/[_-]/g, " ");
}
var unrestrictedInputSchemaRule = {
  id: "MCPG-302",
  title: "High-risk tool accepts an unconstrained string parameter",
  severity: "medium",
  confidence: "medium",
  category: "scope",
  docsUrl: "https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-302.md",
  /** An unconstrained parameter on a high-risk tool widens that tool's effective authority. */
  owasp: ["MCP02"],
  check(tool, _allTools) {
    const isHighRisk = HIGH_RISK_TOOL.test(normalizeIdentifier2(tool.name)) || HIGH_RISK_TOOL.test(tool.description);
    if (!isHighRisk) return [];
    const properties = tool.inputSchema?.properties;
    if (!properties) return [];
    const findings = [];
    for (const [paramName, schema] of Object.entries(properties)) {
      if (schema.type !== "string") continue;
      const isConstrained = schema.enum !== void 0 || schema.pattern !== void 0 || schema.maxLength !== void 0;
      if (isConstrained) continue;
      findings.push(
        createFinding({
          ruleId: unrestrictedInputSchemaRule.id,
          severity: unrestrictedInputSchemaRule.severity,
          confidence: unrestrictedInputSchemaRule.confidence,
          message: `Tool "${tool.name}" on server "${tool.serverName}" looks like it executes commands/code, and its "${paramName}" parameter accepts any string with no enum, pattern, or length constraint \u2014 the parameter itself provides no boundary on what can be injected.`,
          remediation: `Constrain "${paramName}" with an enum of allowed values, a validating pattern, or at minimum a maxLength \u2014 an unconstrained string handed to an execution-shaped tool is effectively unrestricted command injection.`,
          location: toolLocation(tool),
          logicalPath: `/tools/${tool.serverName}/${tool.name}/inputSchema/properties/${paramName}`
        })
      );
    }
    return findings;
  }
};

// src/rules/tool-registry.ts
var ALL_TOOL_RULES = [
  hiddenInstructionsRule,
  invisibleCharactersRule,
  toolShadowingRule,
  suspiciousParameterRule,
  unrestrictedInputSchemaRule,
  unconfirmedDestructiveOpRule,
  headerMirroredSecretRule,
  invalidHeaderMirrorRule,
  deceptiveToolTitleRule
];

// src/cli/commands/scan.ts
var ALL_KNOWN_RULE_IDS = new Set(
  [
    ...ALL_RULES,
    ...ALL_TOOL_RULES,
    ...ALL_PROMPT_RULES,
    ...ALL_RESOURCE_RULES,
    unboundedResourceTemplateRule
  ].map((r) => r.id)
);
async function runScanCommand(options) {
  let activeRules;
  let activeToolRules;
  let activePromptRules;
  let activeResourceRules;
  try {
    const filterOptions = {
      only: options.only ?? [],
      ignore: options.ignore ?? [],
      // Validated against the UNION of all three catalogs — a `--rules`
      // value naming a ToolRule (MCPG-2xx/3xx) or a PromptRule (MCPG-205/206)
      // must not be reported "unknown" just because this particular
      // filterRules() call only sees the file-based catalog, and vice versa.
      knownIds: ALL_KNOWN_RULE_IDS
    };
    activeRules = filterRules(ALL_RULES, filterOptions);
    activeToolRules = filterRules(ALL_TOOL_RULES, filterOptions);
    activePromptRules = filterRules(ALL_PROMPT_RULES, filterOptions);
    activeResourceRules = filterRules(ALL_RESOURCE_RULES, filterOptions);
  } catch (err) {
    options.stderr(pc4.red(err instanceof Error ? err.message : String(err)));
    return EXIT_CODES.toolError;
  }
  let baseline;
  if (options.baselinePath) {
    try {
      baseline = loadBaseline(options.baselinePath);
    } catch (err) {
      options.stderr(pc4.red(err instanceof Error ? err.message : String(err)));
      return EXIT_CODES.toolError;
    }
  }
  let lock;
  if (options.lockPath) {
    try {
      lock = loadLockFile(options.lockPath);
    } catch (err) {
      options.stderr(pc4.red(err instanceof Error ? err.message : String(err)));
      return EXIT_CODES.toolError;
    }
  }
  const { targets, warnings, hadCandidates } = resolveScanTargets(
    options.paths,
    options.cwd,
    options.globalConfigPaths ?? []
  );
  for (const warning of warnings) {
    options.stderr(pc4.yellow(`\u26A0 ${warning}`));
  }
  if (!hadCandidates) {
    options.stdout(formatResult({ targetsScanned: 0, findings: [] }, options.format));
    return EXIT_CODES.clean;
  }
  if (targets.length === 0) {
    options.stderr(pc4.red("No MCP config file could be loaded \u2014 see warnings above."));
    return EXIT_CODES.toolError;
  }
  let liveTools;
  let liveCapabilities;
  let liveFindings = [];
  if (options.live) {
    const live = await runLiveScan(
      targets,
      activeToolRules,
      activePromptRules,
      activeResourceRules,
      options.liveTimeoutMs,
      options.allowUnsafeRemote === true,
      options.stderr
    );
    liveTools = live.toolsByServerKey;
    liveCapabilities = live.capabilitiesByServerKey;
    liveFindings = live.findings;
  }
  const projectServers = new Set(
    targets.filter((target) => target.scope === "project").flatMap((target) => Object.keys(target.config.mcpServers ?? {}))
  );
  const rawResult = runScan(targets, activeRules, {
    cwd: options.cwd,
    ...lock ? { lock } : {},
    ...liveTools ? { liveTools } : {},
    ...liveCapabilities ? { capabilitiesByServerKey: liveCapabilities } : {},
    ...projectServers.size > 0 ? { projectServers } : {}
  });
  const combinedFindings = [...rawResult.findings, ...liveFindings];
  const result = baseline ? {
    targetsScanned: rawResult.targetsScanned,
    findings: applyBaseline(combinedFindings, baseline)
  } : { targetsScanned: rawResult.targetsScanned, findings: combinedFindings };
  options.stdout(formatResult(result, options.format));
  const hasFindingAtThreshold = result.findings.some(
    (f) => severityAtLeast(f.severity, options.failOn)
  );
  return hasFindingAtThreshold ? EXIT_CODES.findingsAtOrAboveThreshold : EXIT_CODES.clean;
}
function formatResult(result, format) {
  switch (format) {
    case "json":
      return formatJson(result);
    case "sarif":
      return formatSarif(result, [
        ...ALL_RULES,
        ...ALL_TOOL_RULES,
        ...ALL_PROMPT_RULES,
        ...ALL_RESOURCE_RULES,
        unboundedResourceTemplateRule
      ]);
    case "human":
      return formatHuman(result);
  }
}
async function runLiveScan(targets, activeToolRules, activePromptRules, activeResourceRules, timeoutMs, allowUnsafeRemote, stderr) {
  const {
    allTools,
    allPrompts,
    allResources,
    allResourceTemplates,
    capabilitiesByServerKey,
    toolsByServerKey,
    warnings,
    serversAttempted
  } = await runLiveIntrospection(targets, {
    timeoutMs: timeoutMs ?? DEFAULT_LIVE_TIMEOUT_MS,
    ...allowUnsafeRemote ? { allowUnsafeRemote: true } : {}
  });
  stderr(pc4.dim(`\u2139 --live: connected to ${toolsByServerKey.size}/${serversAttempted} server(s).`));
  for (const warning of warnings) {
    stderr(pc4.yellow(`\u26A0 ${warning}`));
  }
  return {
    findings: [
      ...runToolRules(allTools, activeToolRules),
      ...runPromptRules(allPrompts, activePromptRules),
      ...runResourceRules(allResources, activeResourceRules),
      ...allResourceTemplates.flatMap((t) => unboundedResourceTemplateRule.check(t))
    ],
    toolsByServerKey,
    capabilitiesByServerKey
  };
}

// src/cli/parse-positive-int.ts
function parsePositiveInt(flag, value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(
      `Invalid ${flag} value "${value}". Expected a positive number of milliseconds.`
    );
  }
  return n;
}

// src/cli/index.ts
var SEVERITIES = ["info", "low", "medium", "high", "critical"];
var FORMATS = ["human", "json", "sarif"];
var INVENTORY_FORMATS = ["human", "json"];
function createCli() {
  const program = new Command();
  program.name(PACKAGE_NAME).description(PACKAGE_DESCRIPTION).version(PACKAGE_VERSION, "-v, --version", "output the current version");
  program.command("scan").description(
    "Scan MCP server configs for security issues. With no [paths], auto-discovers project-level (.mcp.json, .vscode/mcp.json) and global (Claude Desktop, Cursor, Windsurf) configs."
  ).argument("[paths...]", "specific config file(s) to scan; omit to auto-discover").option(
    "--fail-on <severity>",
    `minimum severity that causes a non-zero exit (${SEVERITIES.join("|")})`,
    "high"
  ).option("--format <format>", `output format (${FORMATS.join("|")})`, "human").option("-o, --output <file>", "write the report to a file instead of stdout").option("--rules <ids>", "comma-separated rule IDs to run exclusively (default: all)").option("--ignore-rule <ids>", "comma-separated rule IDs to skip").option(
    "--baseline <file>",
    "suppress findings whose fingerprint appears in this baseline file"
  ).option(
    "--lock <file>",
    "path to a .mcpguard-lock.json (see `guardmcp pin`) enabling rug-pull drift detection (MCPG-501/502). Defaults to .mcpguard-lock.json in the current directory, if present."
  ).option(
    "--live",
    "connect to every stdio-launched server and scan its real advertised tools (MCPG-2xx/3xx), not just the config file. Opt-in \u2014 spawns each server's launch command locally."
  ).option("--live-timeout <ms>", "per-server timeout for --live introspection", "10000").option(
    "--live-allow-unsafe",
    "dial remote endpoints --live would otherwise refuse: private/cloud-metadata addresses, and cleartext http:// carrying credentials. guardmcp declines these by default so it never performs the request MCPG-401/403 exist to warn about."
  ).action(
    async (paths, opts) => {
      const failOn = parseChoice("--fail-on", opts.failOn, SEVERITIES);
      const format = parseChoice("--format", opts.format, FORMATS);
      const only = splitIds(opts.rules);
      const ignore = splitIds(opts.ignoreRule);
      const liveTimeoutMs = parsePositiveInt("--live-timeout", opts.liveTimeout);
      const defaultLock = defaultLockFilePath(process.cwd());
      const lockPath = opts.lock ?? (existsSync4(defaultLock) ? defaultLock : void 0);
      const exitCode = await runScanCommand({
        paths,
        failOn,
        format,
        cwd: process.cwd(),
        globalConfigPaths: paths.length === 0 ? discoverGlobalConfigPaths() : [],
        stdout: (report) => writeReport(report, opts.output),
        stderr: (line) => console.error(line),
        ...only ? { only } : {},
        ...ignore ? { ignore } : {},
        ...opts.baseline ? { baselinePath: opts.baseline } : {},
        ...lockPath ? { lockPath } : {},
        ...opts.live ? {
          live: true,
          liveTimeoutMs,
          ...opts.liveAllowUnsafe ? { allowUnsafeRemote: true } : {}
        } : {}
      });
      process.exitCode = exitCode;
    }
  );
  program.command("inventory").description(
    "List the MCP servers configured on this machine and, with --live, the tools, prompts and resources each one actually advertises. Reports what you have; use `scan` to find what is wrong with it."
  ).argument("[paths...]", "specific config file(s); omit to auto-discover").option("--format <format>", `output format (${INVENTORY_FORMATS.join("|")})`, "human").option(
    "--live",
    "connect to every stdio-launched server and list its real tools, prompts and resources. Opt-in \u2014 spawns each server's launch command locally."
  ).option("--live-timeout <ms>", "per-server timeout for --live introspection", "10000").option(
    "--live-allow-unsafe",
    "dial remote endpoints --live would otherwise refuse: private/cloud-metadata addresses, and cleartext http:// carrying credentials. guardmcp declines these by default so it never performs the request MCPG-401/403 exist to warn about."
  ).action(
    async (paths, opts) => {
      const format = parseChoice("--format", opts.format, INVENTORY_FORMATS);
      const liveTimeoutMs = parsePositiveInt("--live-timeout", opts.liveTimeout);
      const code = await runInventoryCommand({
        paths,
        cwd: process.cwd(),
        format,
        ...opts.live ? {
          live: true,
          liveTimeoutMs,
          ...opts.liveAllowUnsafe ? { allowUnsafeRemote: true } : {}
        } : {},
        globalConfigPaths: paths.length === 0 ? discoverGlobalConfigPaths() : [],
        stdout: (text) => process.stdout.write(text),
        stderr: (line) => console.error(line)
      });
      process.exitCode = code;
    }
  );
  program.command("init").description(
    "Write a GitHub Actions workflow that scans this repository on every push and pull request and uploads the results to Code Scanning."
  ).option(
    "--fail-on <severity>",
    `severity that fails the build (${SEVERITIES.join("|")})`,
    "high"
  ).option("--force", "overwrite an existing workflow file").action((opts) => {
    const failOn = parseChoice("--fail-on", opts.failOn, SEVERITIES);
    process.exitCode = runInitCommand({
      cwd: process.cwd(),
      failOn,
      ...opts.force ? { force: true } : {},
      stdout: (text) => process.stdout.write(text),
      stderr: (line) => console.error(line)
    });
  });
  program.command("pin").description(
    "Snapshot the current MCP server definitions (and, with --live, their real tool list) into .mcpguard-lock.json. A later `scan` flags any drift as a possible rug-pull (MCPG-501/502)."
  ).argument("[paths...]", "specific config file(s) to pin; omit to auto-discover").option(
    "--live",
    "also connect to every stdio server and pin its real tool list, not just the config"
  ).option("--live-timeout <ms>", "per-server timeout for --live introspection", "10000").option(
    "--live-allow-unsafe",
    "dial remote endpoints --live would otherwise refuse: private/cloud-metadata addresses, and cleartext http:// carrying credentials. guardmcp declines these by default so it never performs the request MCPG-401/403 exist to warn about."
  ).option("-o, --output <file>", "lock file path", ".mcpguard-lock.json").action(
    async (paths, opts) => {
      const liveTimeoutMs = parsePositiveInt("--live-timeout", opts.liveTimeout);
      const exitCode = await runPinCommand({
        paths,
        cwd: process.cwd(),
        outputPath: opts.output,
        globalConfigPaths: paths.length === 0 ? discoverGlobalConfigPaths() : [],
        stdout: (line) => console.log(line),
        stderr: (line) => console.error(line),
        ...opts.live ? {
          live: true,
          liveTimeoutMs,
          ...opts.liveAllowUnsafe ? { allowUnsafeRemote: true } : {}
        } : {}
      });
      process.exitCode = exitCode;
    }
  );
  return program;
}
function writeReport(report, outputFile) {
  if (outputFile) {
    writeFileSync3(outputFile, `${report}
`, "utf-8");
  } else {
    console.log(report);
  }
}
function parseChoice(flag, value, allowed) {
  if (allowed.includes(value)) return value;
  throw new Error(`Invalid ${flag} value "${value}". Expected one of: ${allowed.join(", ")}`);
}
function splitIds(value) {
  if (!value) return void 0;
  return value.split(",").map((id) => id.trim()).filter((id) => id.length > 0);
}
async function runCli(argv) {
  try {
    await createCli().parseAsync([...argv]);
    return process.exitCode === void 0 ? EXIT_CODES.clean : Number(process.exitCode);
  } catch (err) {
    console.error(pc5.red(err instanceof Error ? err.message : String(err)));
    return EXIT_CODES.toolError;
  }
}
var isMainModule = process.argv[1] !== void 0 && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  process.exitCode = await runCli(process.argv);
}
export {
  createCli,
  runCli
};
//# sourceMappingURL=index.js.map