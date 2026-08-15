const MOVING_TAGS = new Set(['latest', 'next', 'canary', 'beta', 'alpha', 'rc']);

/**
 * Whether an npm-style package spec ("name@version" or "@scope/name@version")
 * is pinned to a real version, as opposed to unpinned (no `@version` at all)
 * or pinned to a moving tag (`@latest` etc., which is just as unpredictable
 * as no pin — a "rug pull" via a compromised/malicious publish under the
 * same tag is exactly the supply-chain risk this rule exists for).
 */
export function isPinnedPackageSpec(spec: string): boolean {
  // A leading '@' on a scoped package ("@scope/name") is not a version
  // marker — strip it before looking for the real version separator.
  const withoutScope = spec.startsWith('@') ? spec.slice(1) : spec;

  const atIndex = withoutScope.lastIndexOf('@');
  if (atIndex === -1) return false;

  const version = withoutScope.slice(atIndex + 1);
  if (version.length === 0) return false;
  if (MOVING_TAGS.has(version.toLowerCase())) return false;

  return true;
}
