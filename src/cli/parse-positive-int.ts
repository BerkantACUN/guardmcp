/**
 * Shared by both `cli/index.ts` (--live-timeout) and `action/index.ts`
 * (live-timeout input) — deliberately its own tiny module rather than
 * exported from cli/index.ts, since action/index.ts must not import
 * anything from there (cli/index.ts pulls in commander, which the action
 * bundle has no use for and shouldn't carry the size of).
 */
export function parsePositiveInt(flag: string, value: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(
      `Invalid ${flag} value "${value}". Expected a positive number of milliseconds.`,
    );
  }
  return n;
}
