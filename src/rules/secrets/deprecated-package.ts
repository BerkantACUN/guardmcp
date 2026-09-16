import { createFinding, type Finding } from '../../core/finding.js';
import { launchedNpmPackage } from '../../detectors/launched-package.js';
import type { Rule } from '../types.js';

/**
 * A server launched from a package the registry has given up on.
 *
 * Found by measuring rather than by guessing. Four reference MCP servers —
 * postgres, github, puppeteer, brave-search — were pulling about 214,000
 * installs a week between them, every one marked deprecated on npm, and their
 * repository archived with the words "NO SECURITY GUARANTEES ARE PROVIDED".
 * The two with the most installs hold database and source-control credentials.
 *
 * Nobody installing them was told any of that. The one channel that reaches
 * every install — npm's deprecation message — carried the stock text "Package
 * no longer supported. Contact Support at npmjs.com/support", which sends the
 * user to npm's help desk and names no replacement. A warning that says "ask
 * someone else" is not a warning.
 *
 * MCPG-105 catches the version not being pinned. This catches the case where
 * pinning would not help: there is no version worth pinning to, because there
 * will never be another one.
 *
 * Pure, like every rule: the registry lookup happens at the CLI boundary under
 * `--registry` and arrives through ctx. No map means no finding — "the
 * registry was not asked" must never read as "the package is fine".
 */
export const deprecatedPackageRule: Rule = {
  id: 'MCPG-106',
  title: 'MCP server launched from a package the registry marks deprecated',
  severity: 'high',
  confidence: 'high', // the registry said so; nothing is inferred
  category: 'secrets',
  docsUrl: 'https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-106.md',
  /** Unmaintained code in the supply chain, with credentials attached. */
  owasp: ['MCP04'],

  check(target, ctx) {
    const registry = ctx.registry;
    if (!registry) return [];

    const findings: Finding[] = [];
    const servers = target.config.mcpServers ?? {};

    for (const [serverName, def] of Object.entries(servers)) {
      const spec = launchedNpmPackage(def);
      if (!spec) continue;

      const status = registry.get(spec.name);
      if (!status?.deprecated) continue;

      const range = target.document.locate(['mcpServers', serverName, 'args', spec.argIndex]);
      const scope = status.allVersionsDeprecated
        ? 'Every published version is deprecated — the package is abandoned, not just this release.'
        : 'The latest version is deprecated.';
      const guidance = status.deprecationIsGeneric
        ? `The registry message is npm's default text and names no replacement: it points at npm's support desk, which cannot help with this package. Treat this as "unmaintained, no security guarantees" and find the maintained successor yourself.`
        : `The registry message: "${status.deprecated}"`;

      findings.push(
        createFinding({
          ruleId: deprecatedPackageRule.id,
          severity: deprecatedPackageRule.severity,
          confidence: deprecatedPackageRule.confidence,
          message: `"${serverName}" server launches "${spec.name}", which npm marks as deprecated. ${scope} Registry message: "${status.deprecated}"`,
          remediation: `${guidance} A deprecated package receives no fixes, so any vulnerability found in it stays open for as long as it is installed. Move to a maintained server, or if none exists, treat this one as unaudited code and scope its credentials accordingly.`,
          location: range
            ? {
                file: target.relativePath,
                line: range.line,
                column: range.column,
                endLine: range.endLine,
                endColumn: range.endColumn,
              }
            : { file: target.relativePath, line: 1, column: 1 },
          logicalPath: `/mcpServers/${serverName}/args/${spec.argIndex}`,
        }),
      );
    }

    return findings;
  },
};
