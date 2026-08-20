#!/usr/bin/env node

// src/cli/index.ts
import { existsSync as existsSync3, writeFileSync as writeFileSync2 } from "fs";
import { pathToFileURL } from "url";
import { Command } from "commander";

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
function loadScanTarget(filePath, cwd) {
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

// src/cli/commands/pin.ts
import pc from "picocolors";

// src/discovery/resolve-targets.ts
function resolveScanTargets(paths, cwd, globalConfigPaths = []) {
  const explicitPaths = paths.length > 0;
  const candidatePaths = explicitPaths ? [...paths] : [.../* @__PURE__ */ new Set([...discoverProjectConfigPaths(cwd), ...globalConfigPaths])];
  const targets = [];
  const warnings = [];
  for (const path of candidatePaths) {
    try {
      targets.push(loadScanTarget(path, cwd));
    } catch (err) {
      warnings.push(err instanceof Error ? err.message : String(err));
    }
  }
  return { targets, warnings, hadCandidates: candidatePaths.length > 0 };
}

// src/live/introspect.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// src/live/to-tool-definition.ts
function toToolDefinition(serverName, tool) {
  return {
    serverName,
    name: tool.name,
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
    ...typeof raw.maxLength === "number" ? { maxLength: raw.maxLength } : {}
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
    // Piping (rather than the SDK default of "inherit") keeps a noisy
    // server's stderr out of guardmcp's own output; we only care about
    // tools/list, not the server's diagnostic logging.
    stderr: "ignore"
  });
  const client = new Client({ name: PACKAGE_NAME, version: PACKAGE_VERSION });
  try {
    const tools = await withTimeout(fetchTools(client, transport, timeoutMs), timeoutMs);
    return { ok: true, serverName, tools: tools.map((tool) => toToolDefinition(serverName, tool)) };
  } catch (err) {
    return { ok: false, serverName, error: errorMessage3(err) };
  } finally {
    await client.close().catch(() => {
    });
  }
}
async function fetchTools(client, transport, timeoutMs) {
  await client.connect(transport, { timeout: timeoutMs });
  const response = await client.listTools(void 0, { timeout: timeoutMs });
  return response.tools;
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
  return `${relativePath}::${serverName}`;
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
      if (!isStdioServerDef(def)) {
        warnings.push(
          `Skipping live introspection of "${serverName}" in ${target.relativePath}: only stdio-launched servers are supported by --live today (remote/HTTP support is planned).`
        );
        continue;
      }
      jobs.push({
        job: { key, serverName },
        promise: introspectStdioServer(serverName, def, { timeoutMs })
      });
    }
  }
  const outcomes = await Promise.all(jobs.map((j) => j.promise));
  const toolsByServerKey = /* @__PURE__ */ new Map();
  const allTools = [];
  outcomes.forEach((outcome, i) => {
    const { key, serverName } = jobs[i]?.job ?? { key: "", serverName: "" };
    if (!outcome.ok) {
      warnings.push(`Live introspection of "${serverName}" failed: ${outcome.error}`);
      return;
    }
    toolsByServerKey.set(key, outcome.tools);
    allTools.push(...outcome.tools);
  });
  return { toolsByServerKey, allTools, warnings, serversAttempted: jobs.length };
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

// src/pin/definition-hash.ts
import { createHash } from "crypto";
function computeDefinitionHash(def) {
  const hash = createHash("sha256");
  if (isStdioServerDef(def)) {
    hash.update("stdio\0");
    hash.update(def.command);
    hash.update("\0");
    hash.update((def.args ?? []).join("\0"));
    hash.update("\0");
    hash.update(
      Object.keys(def.env ?? {}).sort().join("\0")
    );
  } else if (isHttpServerDef(def)) {
    hash.update("http\0");
    hash.update(def.url);
    hash.update("\0");
    hash.update(
      Object.keys(def.headers ?? {}).sort().join("\0")
    );
  }
  return `sha256:${hash.digest("hex")}`;
}

// src/pin/tools-hash.ts
import { createHash as createHash2 } from "crypto";
function computeToolsHash(tools) {
  const hash = createHash2("sha256");
  const sorted = [...tools].sort((a, b) => a.name.localeCompare(b.name));
  for (const tool of sorted) {
    hash.update(tool.name);
    hash.update("\0");
    hash.update(tool.description);
    hash.update("\0");
    hash.update(propertySignature(tool));
    hash.update("");
  }
  return `sha256:${hash.digest("hex")}`;
}
function propertySignature(tool) {
  const properties = tool.inputSchema?.properties ?? {};
  return Object.keys(properties).sort().map((key) => `${key}:${properties[key]?.type ?? ""}`).join(",");
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

// src/cli/exit-codes.ts
var EXIT_CODES = {
  clean: 0,
  findingsAtOrAboveThreshold: 1,
  toolError: 2,
  liveConnectionError: 3
};

// src/cli/commands/pin.ts
async function runPinCommand(options) {
  const { targets, warnings, hadCandidates } = resolveScanTargets(
    options.paths,
    options.cwd,
    options.globalConfigPaths ?? []
  );
  for (const warning of warnings) {
    options.stderr(pc.yellow(`\u26A0 ${warning}`));
  }
  if (!hadCandidates) {
    options.stderr(pc.yellow("No MCP config found to pin."));
    return EXIT_CODES.clean;
  }
  if (targets.length === 0) {
    options.stderr(pc.red("No MCP config file could be loaded \u2014 see warnings above."));
    return EXIT_CODES.toolError;
  }
  let liveToolsByServerKey;
  if (options.live) {
    const timeoutMs = options.liveTimeoutMs ?? DEFAULT_LIVE_TIMEOUT_MS;
    const live = await runLiveIntrospection(targets, { timeoutMs });
    options.stderr(
      pc.dim(
        `\u2139 --live: connected to ${live.toolsByServerKey.size}/${live.serversAttempted} stdio server(s).`
      )
    );
    for (const warning of live.warnings) {
      options.stderr(pc.yellow(`\u26A0 ${warning}`));
    }
    liveToolsByServerKey = live.toolsByServerKey;
  }
  const generatedAt = (options.now ?? (() => /* @__PURE__ */ new Date()))().toISOString();
  const lock = buildLockFile(targets, liveToolsByServerKey, generatedAt);
  writeLockFile(options.outputPath, lock);
  const serverCount = Object.keys(lock.servers).length;
  const liveCount = Object.values(lock.servers).filter((s) => s.toolsHash !== void 0).length;
  const liveNote = options.live ? `, ${liveCount} with live tool hashes` : "";
  options.stdout(pc.green(`\u2714 Pinned ${serverCount} server(s)${liveNote} to ${options.outputPath}`));
  return EXIT_CODES.clean;
}

// src/cli/commands/scan.ts
import pc3 from "picocolors";

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
  if (options.only.length > 0) {
    const knownIds = options.knownIds ?? new Set(rules.map((r) => r.id));
    const unknown = options.only.filter((id) => !knownIds.has(id));
    if (unknown.length > 0) {
      throw new Error(`Unknown rule ID(s) in --rules: ${unknown.join(", ")}`);
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
import pc2 from "picocolors";
var SEVERITY_STYLE = {
  critical: (t) => pc2.bold(pc2.red(t)),
  high: pc2.red,
  medium: pc2.yellow,
  low: pc2.blue,
  info: pc2.gray
};
function formatHuman(result) {
  if (result.findings.length === 0) {
    return `${pc2.green("\u2714")} No findings across ${result.targetsScanned} scanned file(s).`;
  }
  const lines = [];
  for (const [file, findings] of groupByFile(result.findings)) {
    lines.push(file);
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
  const evidenceSuffix = finding.evidence ? `  ${pc2.dim(finding.evidence)}` : "";
  return [
    `  ${label}  ${pc2.bold(finding.ruleId)}  ${finding.message}`,
    `    ${pc2.dim(position)}${evidenceSuffix}`,
    `    ${pc2.dim("Fix:")} ${finding.remediation}`
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

// src/report/formatters/sarif.ts
var SARIF_SCHEMA_URI = "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json";
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
    return {
      id,
      name: id,
      shortDescription: { text: rule?.title ?? id },
      helpUri: rule?.docsUrl ?? PACKAGE_HOMEPAGE,
      defaultConfiguration: {
        level: rule ? SEVERITY_TO_SARIF_LEVEL[rule.severity] : "warning"
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
        results: result.findings.map(findingToSarifResult)
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

// src/rules/integrity/live-tool-drift.ts
var liveToolDriftRule = {
  id: "MCPG-502",
  title: "Server's live tool definitions changed since they were last pinned",
  severity: "critical",
  confidence: "high",
  category: "integrity",
  docsUrl: "https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-502.md",
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

// src/rules/transport/insecure-transport.ts
var insecureTransportRule = {
  id: "MCPG-401",
  title: "Unencrypted (http://) MCP server transport",
  severity: "high",
  confidence: "high",
  category: "transport",
  docsUrl: "https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-401.md",
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
  title: "Remote MCP endpoint with no visible authentication",
  severity: "medium",
  confidence: "medium",
  // auth could legitimately live elsewhere (mTLS, network policy) — heuristic, not certain
  category: "transport",
  docsUrl: "https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-404.md",
  check(target, _ctx) {
    const findings = [];
    const servers = target.config.mcpServers ?? {};
    for (const [serverName, def] of Object.entries(servers)) {
      if (!isHttpServerDef(def)) continue;
      if (hasAuthHeader(def.headers)) continue;
      const logicalPath = `/mcpServers/${serverName}`;
      const range = target.document.locate(["mcpServers", serverName]);
      findings.push(
        createFinding({
          ruleId: unauthenticatedRemoteEndpointRule.id,
          severity: unauthenticatedRemoteEndpointRule.severity,
          confidence: unauthenticatedRemoteEndpointRule.confidence,
          message: `"${serverName}" is a remote HTTP MCP server with no Authorization/API-key header configured \u2014 if this endpoint is not otherwise access-controlled (mTLS, network policy), anyone who can reach it can use it.`,
          remediation: "Add an Authorization or API-key header, or confirm the endpoint enforces access control by other means and note that explicitly.",
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
  liveToolDriftRule
];

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

// src/rules/poisoning/types.ts
function toolLocation(tool) {
  return { file: `live:${tool.serverName}/${tool.name}`, line: 1, column: 1 };
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

// src/detectors/unicode-anomalies.ts
var ZERO_WIDTH_CHARS = [8203, 8204, 8205, 65279].map((code) => String.fromCharCode(code));
var BIDI_OVERRIDE_RANGE_START = 8234;
var BIDI_OVERRIDE_RANGE_END = 8238;
var BIDI_ISOLATE_RANGE_START = 8294;
var BIDI_ISOLATE_RANGE_END = 8297;
var ZERO_WIDTH_PATTERN = new RegExp(`[${ZERO_WIDTH_CHARS.join("")}]`, "g");
var HTML_COMMENT_PATTERN = /<!--[\s\S]*?-->/g;
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
  return anomalies.sort((a, b) => a.index - b.index);
}

// src/rules/poisoning/invisible-characters.ts
var KIND_LABEL = {
  "zero-width": "zero-width/invisible character(s)",
  "bidi-override": "bidirectional text override character(s)",
  "html-comment": "an HTML comment"
};
var invisibleCharactersRule = {
  id: "MCPG-202",
  title: "Invisible or obfuscated content in tool description",
  severity: "high",
  confidence: "high",
  // deterministic: these characters have no legitimate reason to appear in a tool description
  category: "poisoning",
  docsUrl: "https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-202.md",
  check(tool, _allTools) {
    const anomalies = findUnicodeAnomalies(tool.description);
    if (anomalies.length === 0) return [];
    const kinds = [...new Set(anomalies.map((a) => KIND_LABEL[a.kind] ?? a.kind))];
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
var DESTRUCTIVE_TOOL = /\b(deletes?|removes?|drops?|truncates?|overwrites?|formats?|destroys?|purges?|wipes?)\b/i;
function normalizeIdentifier(value) {
  return value.replace(/[_-]/g, " ");
}
var unconfirmedDestructiveOpRule = {
  id: "MCPG-303",
  title: "Destructive-sounding tool with no confirmation annotation",
  severity: "medium",
  confidence: "low",
  // name/description matching is a weak signal on its own
  category: "scope",
  docsUrl: "https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-303.md",
  check(tool, _allTools) {
    const looksDestructive = DESTRUCTIVE_TOOL.test(normalizeIdentifier(tool.name)) || DESTRUCTIVE_TOOL.test(tool.description);
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
  unconfirmedDestructiveOpRule
];

// src/cli/commands/scan.ts
var ALL_KNOWN_RULE_IDS = new Set([...ALL_RULES, ...ALL_TOOL_RULES].map((r) => r.id));
async function runScanCommand(options) {
  let activeRules;
  let activeToolRules;
  try {
    const filterOptions = {
      only: options.only ?? [],
      ignore: options.ignore ?? [],
      // Validated against the UNION of both catalogs — a `--rules` value
      // naming a ToolRule ID (MCPG-2xx/3xx) must not be reported "unknown"
      // just because this particular filterRules() call only sees the
      // file-based catalog, and vice versa.
      knownIds: ALL_KNOWN_RULE_IDS
    };
    activeRules = filterRules(ALL_RULES, filterOptions);
    activeToolRules = filterRules(ALL_TOOL_RULES, filterOptions);
  } catch (err) {
    options.stderr(pc3.red(err instanceof Error ? err.message : String(err)));
    return EXIT_CODES.toolError;
  }
  let baseline;
  if (options.baselinePath) {
    try {
      baseline = loadBaseline(options.baselinePath);
    } catch (err) {
      options.stderr(pc3.red(err instanceof Error ? err.message : String(err)));
      return EXIT_CODES.toolError;
    }
  }
  let lock;
  if (options.lockPath) {
    try {
      lock = loadLockFile(options.lockPath);
    } catch (err) {
      options.stderr(pc3.red(err instanceof Error ? err.message : String(err)));
      return EXIT_CODES.toolError;
    }
  }
  const { targets, warnings, hadCandidates } = resolveScanTargets(
    options.paths,
    options.cwd,
    options.globalConfigPaths ?? []
  );
  for (const warning of warnings) {
    options.stderr(pc3.yellow(`\u26A0 ${warning}`));
  }
  if (!hadCandidates) {
    options.stdout(formatResult({ targetsScanned: 0, findings: [] }, options.format));
    return EXIT_CODES.clean;
  }
  if (targets.length === 0) {
    options.stderr(pc3.red("No MCP config file could be loaded \u2014 see warnings above."));
    return EXIT_CODES.toolError;
  }
  let liveTools;
  let liveFindings = [];
  if (options.live) {
    const live = await runLiveScan(targets, activeToolRules, options.liveTimeoutMs, options.stderr);
    liveTools = live.toolsByServerKey;
    liveFindings = live.findings;
  }
  const rawResult = runScan(targets, activeRules, {
    cwd: options.cwd,
    ...lock ? { lock } : {},
    ...liveTools ? { liveTools } : {}
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
      return formatSarif(result, [...ALL_RULES, ...ALL_TOOL_RULES]);
    case "human":
      return formatHuman(result);
  }
}
async function runLiveScan(targets, activeToolRules, timeoutMs, stderr) {
  const { allTools, toolsByServerKey, warnings, serversAttempted } = await runLiveIntrospection(
    targets,
    { timeoutMs: timeoutMs ?? DEFAULT_LIVE_TIMEOUT_MS }
  );
  stderr(
    pc3.dim(`\u2139 --live: connected to ${toolsByServerKey.size}/${serversAttempted} stdio server(s).`)
  );
  for (const warning of warnings) {
    stderr(pc3.yellow(`\u26A0 ${warning}`));
  }
  return { findings: runToolRules(allTools, activeToolRules), toolsByServerKey };
}

// src/cli/index.ts
var SEVERITIES = ["info", "low", "medium", "high", "critical"];
var FORMATS = ["human", "json", "sarif"];
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
  ).option("--live-timeout <ms>", "per-server timeout for --live introspection", "10000").action(
    async (paths, opts) => {
      const failOn = parseChoice("--fail-on", opts.failOn, SEVERITIES);
      const format = parseChoice("--format", opts.format, FORMATS);
      const only = splitIds(opts.rules);
      const ignore = splitIds(opts.ignoreRule);
      const liveTimeoutMs = parsePositiveInt("--live-timeout", opts.liveTimeout);
      const defaultLock = defaultLockFilePath(process.cwd());
      const lockPath = opts.lock ?? (existsSync3(defaultLock) ? defaultLock : void 0);
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
        ...opts.live ? { live: true, liveTimeoutMs } : {}
      });
      process.exitCode = exitCode;
    }
  );
  program.command("pin").description(
    "Snapshot the current MCP server definitions (and, with --live, their real tool list) into .mcpguard-lock.json. A later `scan` flags any drift as a possible rug-pull (MCPG-501/502)."
  ).argument("[paths...]", "specific config file(s) to pin; omit to auto-discover").option(
    "--live",
    "also connect to every stdio server and pin its real tool list, not just the config"
  ).option("--live-timeout <ms>", "per-server timeout for --live introspection", "10000").option("-o, --output <file>", "lock file path", ".mcpguard-lock.json").action(
    async (paths, opts) => {
      const liveTimeoutMs = parsePositiveInt("--live-timeout", opts.liveTimeout);
      const exitCode = await runPinCommand({
        paths,
        cwd: process.cwd(),
        outputPath: opts.output,
        globalConfigPaths: paths.length === 0 ? discoverGlobalConfigPaths() : [],
        stdout: (line) => console.log(line),
        stderr: (line) => console.error(line),
        ...opts.live ? { live: true, liveTimeoutMs } : {}
      });
      process.exitCode = exitCode;
    }
  );
  return program;
}
function writeReport(report, outputFile) {
  if (outputFile) {
    writeFileSync2(outputFile, `${report}
`, "utf-8");
  } else {
    console.log(report);
  }
}
function parseChoice(flag, value, allowed) {
  if (allowed.includes(value)) return value;
  throw new Error(`Invalid ${flag} value "${value}". Expected one of: ${allowed.join(", ")}`);
}
function parsePositiveInt(flag, value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(
      `Invalid ${flag} value "${value}". Expected a positive number of milliseconds.`
    );
  }
  return n;
}
function splitIds(value) {
  if (!value) return void 0;
  return value.split(",").map((id) => id.trim()).filter((id) => id.length > 0);
}
var isMainModule = process.argv[1] !== void 0 && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  createCli().parse(process.argv);
}
export {
  createCli
};
//# sourceMappingURL=index.js.map