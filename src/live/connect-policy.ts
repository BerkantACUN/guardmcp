import { isLoopbackHost, isPrivateOrMetadataHost } from '../detectors/url-risk.js';

/**
 * Whether guardmcp is willing to connect to a remote server at all.
 *
 * The governing principle: **guardmcp never performs the unsafe act it exists
 * to warn about.**
 *
 * Two rules follow from it, and both matter because `--live` turns a static
 * finding into an action taken by this process:
 *
 *  - MCPG-403 reports that a config points at cloud metadata or a private
 *    address. Connecting anyway would make guardmcp itself issue that request
 *    against internal infrastructure, on behalf of whoever wrote the config.
 *    A scanner that can be pointed at 169.254.169.254 by a config file is an
 *    SSRF primitive wearing a security tool's name.
 *
 *  - MCPG-401 reports that a config sends credentials over cleartext HTTP.
 *    Connecting anyway would mean guardmcp transmits the user's own token in
 *    the clear — causing the exact harm it is reporting.
 *
 * Both are overridable, because scanning your own internal or local server is
 * a legitimate thing to want. The point is that it must be a decision, not a
 * default.
 */

export interface ConnectRefusal {
  readonly reason: string;
}

/** Header names that carry something worth not leaking. Matched loosely: a
 * custom `X-Api-Token` is as much a credential as `Authorization`. */
const CREDENTIAL_HEADER = /(^|-)(authorization|cookie|token|key|secret|password|auth)(-|$)/i;

function carriesCredentials(headers: Readonly<Record<string, string>> | undefined): boolean {
  if (!headers) return false;
  return Object.keys(headers).some((name) => CREDENTIAL_HEADER.test(name));
}

export function refuseRemoteConnection(
  url: string,
  headers: Readonly<Record<string, string>> | undefined,
  allowUnsafe: boolean,
): ConnectRefusal | null {
  if (allowUnsafe) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { reason: `"${url}" is not a URL guardmcp can parse, so it will not be dialled.` };
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:') {
    return {
      reason: `the scheme "${parsed.protocol.replace(':', '')}" is not an MCP HTTP transport; only http and https are dialled.`,
    };
  }

  // Loopback is exempt from the private-address rule: a server on localhost
  // is the ordinary development case, and reaching it is not lateral movement.
  const host = parsed.hostname;
  if (!isLoopbackHost(host) && isPrivateOrMetadataHost(host)) {
    return {
      reason: `"${host}" is a private-network or cloud-metadata address. Connecting would make guardmcp itself issue a request to internal infrastructure — the thing MCPG-403 exists to report. Re-run with --live-allow-unsafe if this is your own internal server.`,
    };
  }

  if (protocol === 'http:' && !isLoopbackHost(host) && carriesCredentials(headers)) {
    return {
      reason: `this endpoint is unencrypted http:// and the config attaches credential headers to it. Connecting would transmit your own credentials in the clear — the thing MCPG-401 exists to report. Fix the URL, or re-run with --live-allow-unsafe if you accept that.`,
    };
  }

  return null;
}
