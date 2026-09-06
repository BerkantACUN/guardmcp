import { isPrivateOrMetadataHost } from './url-risk.js';

/**
 * A resource is data the server offers the model to READ. That makes the URI
 * itself part of the attack surface in a way a tool or prompt has no
 * equivalent of: a server advertising `file:///home/u/.ssh/id_rsa` as a
 * resource is offering to feed a private key into the model's context, and
 * nothing about the resource's *name* has to admit that.
 *
 * Three shapes are worth flagging:
 *  - `credential`      the URI names a well-known secret file
 *  - `broad-scope`     the URI is a whole filesystem/home root, so what it
 *                      actually exposes is unbounded
 *  - `internal-endpoint` the URI reaches cloud metadata or private-network
 *                      infrastructure
 */

export type SensitiveUriKind = 'credential' | 'broad-scope' | 'internal-endpoint';

export interface SensitiveUriMatch {
  readonly kind: SensitiveUriKind;
  /** Human-readable, safe to print — never the URI's own contents. */
  readonly label: string;
}

/** Well-known secret files, matched on the path tail. Ordered most specific
 * first so `.ssh/id_rsa` reports "private key" rather than a generic hit. */
const CREDENTIAL_PATHS: readonly (readonly [RegExp, string])[] = [
  [/\.ssh\/id_[a-z0-9_]+$/i, 'an SSH private key'],
  [/\.ssh\/(config|known_hosts|authorized_keys)$/i, 'SSH configuration'],
  [/\.aws\/(credentials|config)$/i, 'AWS cloud credentials'],
  [/\.config\/gcloud\//i, 'GCP cloud credentials'],
  [/\.azure\//i, 'Azure cloud credentials'],
  [/\.kube\/config$/i, 'Kubernetes cluster credentials'],
  [/\.docker\/config\.json$/i, 'Docker registry stored credentials'],
  [/\.git-credentials$/i, 'Git stored credentials'],
  [/\.(npmrc|pypirc|netrc)$/i, 'registry stored credentials'],
  [/(^|\/)\.env(\.[a-z0-9_-]+)?$/i, 'an environment file'],
  [/\.(bash|zsh|fish)_history$/i, 'shell history'],
  [/(^|\/)id_(rsa|dsa|ecdsa|ed25519)$/i, 'an SSH private key'],
  [/(^|\/)etc\/(shadow|passwd|sudoers)$/i, 'a system account file'],
  [/\.pem$|\.p12$|\.pfx$|\.key$/i, 'a private key file'],
];

/** A path that is a root rather than a specific file or project directory:
 * "/", "C:/", "/home/alice", "/Users/alice". What such a resource actually
 * exposes is bounded only by the filesystem. */
const BROAD_PATHS: readonly RegExp[] = [
  /^\/?$/,
  /^[a-z]:\/?$/i,
  /^\/(home|users)\/[^/]+\/?$/i,
  /^\/(root|home|users)\/?$/i,
];

export function classifySensitiveUri(uri: string): SensitiveUriMatch | null {
  if (!uri) return null;

  const scheme = uri.slice(0, uri.indexOf(':')).toLowerCase();

  if (scheme === 'file') {
    const path = filePathOf(uri);
    for (const [pattern, label] of CREDENTIAL_PATHS) {
      if (pattern.test(path)) return { kind: 'credential', label };
    }
    if (BROAD_PATHS.some((pattern) => pattern.test(path))) {
      return { kind: 'broad-scope', label: 'an entire filesystem or home directory' };
    }
    return null;
  }

  if (scheme === 'http' || scheme === 'https') {
    const host = hostOf(uri);
    if (host && isPrivateOrMetadataHost(host)) {
      return { kind: 'internal-endpoint', label: `internal infrastructure (${host})` };
    }
  }

  return null;
}

/** `file:///a/b` → `/a/b`, `file://C:/x` → `C:/x`. Backslashes are
 * normalised so a Windows-style URI matches the same patterns. */
function filePathOf(uri: string): string {
  const withoutScheme = uri.replace(/^file:\/\//i, '');
  const path =
    withoutScheme.startsWith('/') && /^\/[a-z]:/i.test(withoutScheme)
      ? withoutScheme.slice(1)
      : withoutScheme;
  return decodeSafely(path).replace(/\\/g, '/');
}

function hostOf(uri: string): string | null {
  try {
    return new URL(uri).hostname;
  } catch {
    return null;
  }
}

/** A malformed percent-escape must not throw mid-scan. */
function decodeSafely(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
