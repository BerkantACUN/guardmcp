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

export interface PackageSpec {
  readonly name: string;
  /** The part after the version separator, verbatim — a real version, a
   * moving tag like `latest`, or null when the spec carries none. */
  readonly version: string | null;
}

/**
 * Splits "name@version" / "@scope/name@version" into its parts.
 *
 * Shares the scope-stripping trick with isPinnedPackageSpec: the leading `@`
 * of a scoped package is not a version separator, and treating it as one
 * yields a package called "" and a version called "scope/name".
 *
 * Returns null for things that are not registry specs at all — paths, empty
 * strings — so a caller iterating launch arguments can skip them without a
 * second check.
 */
export function parsePackageSpec(spec: string): PackageSpec | null {
  if (spec.length === 0) return null;
  // Paths, not packages: relative, POSIX-absolute, or a Windows drive letter.
  if (spec.startsWith('.') || spec.startsWith('/') || /^[A-Za-z]:[\\/]/.test(spec)) return null;

  const scoped = spec.startsWith('@');
  const body = scoped ? spec.slice(1) : spec;
  const atIndex = body.lastIndexOf('@');

  if (atIndex === -1) {
    return { name: spec, version: null };
  }

  const name = (scoped ? '@' : '') + body.slice(0, atIndex);
  const version = body.slice(atIndex + 1);
  return { name, version: version.length > 0 ? version : null };
}
