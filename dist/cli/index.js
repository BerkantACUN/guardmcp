#!/usr/bin/env node

// src/cli/index.ts
import { writeFileSync } from "fs";
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

// src/cli/commands/scan.ts
import pc2 from "picocolors";

// src/baseline/lockfile.ts
import { readFileSync as readFileSync2 } from "fs";
import { z as z2 } from "zod";
var BaselineFileSchema = z2.object({
  version: z2.string(),
  fingerprints: z2.array(z2.string())
});
function loadBaseline(filePath) {
  const raw = JSON.parse(readFileSync2(filePath, "utf-8"));
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
    const knownIds = new Set(rules.map((r) => r.id));
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
import pc from "picocolors";
var SEVERITY_STYLE = {
  critical: (t) => pc.bold(pc.red(t)),
  high: pc.red,
  medium: pc.yellow,
  low: pc.blue,
  info: pc.gray
};
function formatHuman(result) {
  if (result.findings.length === 0) {
    return `${pc.green("\u2714")} No findings across ${result.targetsScanned} scanned file(s).`;
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
  const evidenceSuffix = finding.evidence ? `  ${pc.dim(finding.evidence)}` : "";
  return [
    `  ${label}  ${pc.bold(finding.ruleId)}  ${finding.message}`,
    `    ${pc.dim(position)}${evidenceSuffix}`,
    `    ${pc.dim("Fix:")} ${finding.remediation}`
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
import { createHash } from "crypto";
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
  const hash = createHash("sha256");
  hash.update(ruleId);
  hash.update("\0");
  hash.update(file);
  hash.update("\0");
  hash.update(logicalPath);
  hash.update("\0");
  hash.update(evidence ?? "");
  return hash.digest("hex").slice(0, 16);
}

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
  unrestrictedScopeRule
];

// src/cli/exit-codes.ts
var EXIT_CODES = {
  clean: 0,
  findingsAtOrAboveThreshold: 1,
  toolError: 2,
  liveConnectionError: 3
};

// src/cli/commands/scan.ts
async function runScanCommand(options) {
  let activeRules;
  try {
    activeRules = filterRules(ALL_RULES, {
      only: options.only ?? [],
      ignore: options.ignore ?? []
    });
  } catch (err) {
    options.stderr(pc2.red(err instanceof Error ? err.message : String(err)));
    return EXIT_CODES.toolError;
  }
  let baseline;
  if (options.baselinePath) {
    try {
      baseline = loadBaseline(options.baselinePath);
    } catch (err) {
      options.stderr(pc2.red(err instanceof Error ? err.message : String(err)));
      return EXIT_CODES.toolError;
    }
  }
  const explicitPaths = options.paths.length > 0;
  const candidatePaths = explicitPaths ? [...options.paths] : [
    .../* @__PURE__ */ new Set([
      ...discoverProjectConfigPaths(options.cwd),
      ...options.globalConfigPaths ?? []
    ])
  ];
  if (candidatePaths.length === 0) {
    options.stdout(formatResult({ targetsScanned: 0, findings: [] }, options.format));
    return EXIT_CODES.clean;
  }
  const targets = [];
  for (const path of candidatePaths) {
    try {
      targets.push(loadScanTarget(path, options.cwd));
    } catch (err) {
      options.stderr(pc2.yellow(`\u26A0 ${describeLoadError(err)}`));
    }
  }
  if (targets.length === 0) {
    options.stderr(pc2.red("No MCP config file could be loaded \u2014 see warnings above."));
    return EXIT_CODES.toolError;
  }
  const rawResult = runScan(targets, activeRules, { cwd: options.cwd });
  const result = baseline ? {
    targetsScanned: rawResult.targetsScanned,
    findings: applyBaseline(rawResult.findings, baseline)
  } : rawResult;
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
      return formatSarif(result, ALL_RULES);
    case "human":
      return formatHuman(result);
  }
}
function describeLoadError(err) {
  return err instanceof Error ? err.message : String(err);
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
  ).action(
    async (paths, opts) => {
      const failOn = parseChoice("--fail-on", opts.failOn, SEVERITIES);
      const format = parseChoice("--format", opts.format, FORMATS);
      const only = splitIds(opts.rules);
      const ignore = splitIds(opts.ignoreRule);
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
        ...opts.baseline ? { baselinePath: opts.baseline } : {}
      });
      process.exitCode = exitCode;
    }
  );
  return program;
}
function writeReport(report, outputFile) {
  if (outputFile) {
    writeFileSync(outputFile, `${report}
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
var isMainModule = process.argv[1] !== void 0 && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  createCli().parse(process.argv);
}
export {
  createCli
};
//# sourceMappingURL=index.js.map