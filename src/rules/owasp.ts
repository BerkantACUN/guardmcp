/**
 * The OWASP MCP Top 10 as a machine-readable taxonomy.
 *
 * Why this exists: a finding that says "MCPG-101" means something only to
 * someone who already knows guardmcp. A finding that *also* says "OWASP
 * MCP01" means something to a security reviewer, an auditor, and a
 * compliance checklist that has never heard of this tool. Emitting the
 * mapping — rather than leaving it in prose in the docs — is what lets a
 * SARIF consumer group, filter, and report findings by a published standard.
 *
 * Source: https://owasp.org/www-project-mcp-top-10/ (v0.1, beta).
 * Every `url` below was resolved (HTTP 200) when this file was written.
 * The upstream slugs are inconsistent on purpose-of-record — some join with
 * "&", one with "-and-", one drops separators entirely — so they are stored
 * verbatim rather than derived from the title.
 */

export type OwaspMcpId =
  | 'MCP01'
  | 'MCP02'
  | 'MCP03'
  | 'MCP04'
  | 'MCP05'
  | 'MCP06'
  | 'MCP07'
  | 'MCP08'
  | 'MCP09'
  | 'MCP10';

export interface OwaspMcpEntry {
  readonly id: OwaspMcpId;
  readonly title: string;
  readonly url: string;
}

/** Stable name for the taxonomy in SARIF output. */
export const OWASP_MCP_TAXONOMY_NAME = 'OWASP-MCP-Top-10';

/** The list is a beta. Pinning the revision we mapped against is what lets a
 * consumer tell a current mapping from one that predates an OWASP revision. */
export const OWASP_MCP_TAXONOMY_VERSION = '0.1';

/**
 * The exact commit of OWASP/www-project-mcp-top-10 this mapping was drafted
 * against.
 *
 * The version label alone does not identify a reading: "v0.1" is a moving
 * target while the list is in pilot testing, and independent implementations
 * have already ended up with numbering that does not line up category for
 * category. A commit sha is immutable, so anyone who disagrees with a mapping
 * here can fetch the precise ten categories it was built from and settle it
 * mechanically rather than by argument.
 *
 * Bump this together with any change to OWASP_MCP_TOP_10, never on its own.
 */
export const OWASP_MCP_TAXONOMY_COMMIT = '165fe0f78ef104459237b4a8e0f6e78db9b02391';

/** Permalink to the entry files at OWASP_MCP_TAXONOMY_COMMIT. */
export const OWASP_MCP_TAXONOMY_SOURCE_URL = `https://github.com/OWASP/www-project-mcp-top-10/tree/${OWASP_MCP_TAXONOMY_COMMIT}/2025`;

export const OWASP_MCP_TAXONOMY_URL = 'https://owasp.org/www-project-mcp-top-10/';

const BASE = 'https://owasp.org/www-project-mcp-top-10/2025';

export const OWASP_MCP_TOP_10: readonly OwaspMcpEntry[] = [
  {
    id: 'MCP01',
    title: 'Token Mismanagement & Secret Exposure',
    url: `${BASE}/MCP01-2025-Token-Mismanagement-and-Secret-Exposure`,
  },
  {
    id: 'MCP02',
    title: 'Privilege Escalation via Scope Creep',
    url: `${BASE}/MCP02-2025%E2%80%93Privilege-Escalation-via-Scope-Creep`,
  },
  {
    id: 'MCP03',
    title: 'Tool Poisoning',
    url: `${BASE}/MCP03-2025%E2%80%93Tool-Poisoning`,
  },
  {
    id: 'MCP04',
    title: 'Software Supply Chain Attacks & Dependency Tampering',
    url: `${BASE}/MCP04-2025%E2%80%93Software-Supply-Chain-Attacks%26Dependency-Tampering`,
  },
  {
    id: 'MCP05',
    title: 'Command Injection & Execution',
    url: `${BASE}/MCP05-2025%E2%80%93Command-Injection%26Execution`,
  },
  {
    id: 'MCP06',
    title: 'Intent Flow Subversion',
    url: `${BASE}/MCP06-2025%E2%80%93Intent-Flow-Subversion`,
  },
  {
    id: 'MCP07',
    title: 'Insufficient Authentication & Authorization',
    url: `${BASE}/MCP07-2025%E2%80%93Insufficient-Authentication%26Authorization`,
  },
  {
    id: 'MCP08',
    title: 'Lack of Audit and Telemetry',
    url: `${BASE}/MCP08-2025%E2%80%93Lack-of-Audit-and-Telemetry`,
  },
  {
    id: 'MCP09',
    title: 'Shadow MCP Servers',
    url: `${BASE}/MCP09-2025%E2%80%93Shadow-MCP-Servers`,
  },
  {
    id: 'MCP10',
    title: 'Context Injection & Over-Sharing',
    url: `${BASE}/MCP10-2025%E2%80%93ContextInjection%26OverSharing`,
  },
];

const BY_ID: ReadonlyMap<OwaspMcpId, OwaspMcpEntry> = new Map(
  OWASP_MCP_TOP_10.map((entry) => [entry.id, entry]),
);

/** Total over `OwaspMcpId` — the union and the catalog are kept in step by
 * the invariant tests in tests/unit/rules/owasp.test.ts. */
export function owaspEntry(id: OwaspMcpId): OwaspMcpEntry {
  const entry = BY_ID.get(id);
  /* c8 ignore next 3 -- unreachable while the union and catalog agree; the
     throw is here so a future edit to one without the other fails loudly
     rather than returning undefined into SARIF output. */
  if (!entry) {
    throw new Error(`Unknown OWASP MCP Top 10 id: ${id}`);
  }
  return entry;
}

/** The distinct categories covered by a set of rules, in catalog order —
 * used for the coverage table in the docs and the `--owasp` summary. */
export function owaspCoverage(
  rules: readonly { readonly owasp: readonly OwaspMcpId[] }[],
): readonly OwaspMcpEntry[] {
  const covered = new Set<OwaspMcpId>(rules.flatMap((r) => r.owasp));
  return OWASP_MCP_TOP_10.filter((entry) => covered.has(entry.id));
}
