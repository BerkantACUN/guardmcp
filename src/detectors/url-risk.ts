export function isLoopbackHost(host: string): boolean {
  const h = host.toLowerCase();
  return h === 'localhost' || h === '::1' || h.startsWith('127.');
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** Cloud metadata endpoints, RFC1918 private ranges, the unspecified address,
 * and `.internal`-suffixed hostnames — targets an external MCP server config
 * has no legitimate reason to point at (SSRF risk: a request that looks like
 * it goes to a normal API can be redirected internally instead). */
export function isPrivateOrMetadataHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === '169.254.169.254') return true; // AWS/GCP/Azure metadata service
  if (h === '0.0.0.0') return true;
  if (h.endsWith('.internal')) return true;

  const match = IPV4.exec(h);
  if (!match) return false;
  const [, aStr, bStr] = match;
  const a = Number(aStr);
  const b = Number(bStr);

  if (a === 10) return true; // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  return false;
}
