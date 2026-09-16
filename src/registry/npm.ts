/**
 * What the npm registry says about a package — read once at the CLI boundary,
 * handed to rules through ScanContext, never fetched from inside a rule.
 *
 * Two facts about the registry's response shape drive everything here. There
 * is no package-level `deprecated` field: `npm deprecate` writes the message
 * onto each version, so "is this package deprecated" means "is the version
 * `latest` points at deprecated". And the message itself is the payload — it
 * is the one thing npm prints to every user on every install, so whether it
 * names a replacement or just says "contact npm support" is the difference
 * between a warning and a dead end.
 */

const REGISTRY = 'https://registry.npmjs.org/';

/**
 * npm's stock text when a maintainer deprecates without writing a message.
 * It sends people to npm's support desk, which cannot help with the package,
 * and names no alternative. Four reference MCP servers pulling ~214k weekly
 * installs carried exactly this string when this rule was written.
 */
const NPM_GENERIC_DEPRECATION =
  /^Package no longer supported\.?\s*Contact Support at https:\/\/www\.npmjs\.com\/support/i;

export interface PackageStatus {
  readonly name: string;
  readonly latestVersion: string | null;
  /** The registry's deprecation message on the latest version, verbatim. Null when not deprecated. */
  readonly deprecated: string | null;
  /** True when every published version is deprecated — the package is abandoned, not just one release. */
  readonly allVersionsDeprecated: boolean;
  /** True when the message is npm's default text, which points at nothing a user can act on. */
  readonly deprecationIsGeneric: boolean;
  readonly repositoryUrl: string | null;
}

interface PackumentVersion {
  readonly deprecated?: unknown;
}

/** Pure. Turns a registry packument into the few facts the rule needs. */
export function interpretNpmPackument(json: unknown): PackageStatus | null {
  if (typeof json !== 'object' || json === null) return null;
  const doc = json as Record<string, unknown>;
  if (typeof doc.name !== 'string') return null;

  const distTags = asRecord(doc['dist-tags']);
  const versions = asRecord(doc.versions);
  const latest = typeof distTags?.latest === 'string' ? distTags.latest : null;

  const entries = versions
    ? Object.values(versions).map((v) => asRecord(v) as PackumentVersion | null)
    : [];
  const deprecatedCount = entries.filter(
    (v) => typeof v?.deprecated === 'string' && v.deprecated,
  ).length;

  const latestEntry =
    latest && versions ? (asRecord(versions[latest]) as PackumentVersion | null) : null;
  const message =
    typeof latestEntry?.deprecated === 'string' && latestEntry.deprecated.length > 0
      ? latestEntry.deprecated
      : null;

  return {
    name: doc.name,
    latestVersion: latest,
    deprecated: message,
    allVersionsDeprecated: entries.length > 0 && deprecatedCount === entries.length,
    deprecationIsGeneric: message !== null && NPM_GENERIC_DEPRECATION.test(message),
    repositoryUrl: repositoryUrl(doc.repository),
  };
}

function repositoryUrl(value: unknown): string | null {
  if (typeof value === 'string') return value;
  const record = asRecord(value);
  return typeof record?.url === 'string' ? record.url : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

/**
 * I/O. Fetches one package's status; null on any failure.
 *
 * Never throws: a registry outage, a 404 for a private package, or a
 * rate-limit must not abort the scan. The rule reading the result treats
 * "unknown" as "say nothing", which is the honest outcome when the registry
 * could not be asked. `fetchImpl` is injectable so tests never hit the network.
 */
export async function fetchNpmPackageStatus(
  name: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PackageStatus | null> {
  // The registry wants the scope's slash encoded; a scoped name sent raw
  // resolves to a different, nonexistent path.
  const url = REGISTRY + name.replace('/', '%2F');
  try {
    const response = await fetchImpl(url, { headers: { accept: 'application/json' } });
    if (!response.ok) return null;
    return interpretNpmPackument(await response.json());
  } catch {
    return null;
  }
}
