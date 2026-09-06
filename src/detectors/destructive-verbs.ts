/**
 * Verbs that name an irreversible operation. Shared by MCPG-303 (a
 * destructive tool that doesn't admit it in its annotations) and MCPG-803 (a
 * destructive tool that doesn't admit it in its display title) so the two
 * rules cannot drift apart on what "destructive" means.
 *
 * `s?` covers 3rd-person/plural prose ("Deletes a file").
 */
const DESTRUCTIVE =
  /\b(deletes?|removes?|drops?|truncates?|overwrites?|formats?|destroys?|purges?|wipes?)\b/i;

/**
 * Separators become spaces before matching. `\b` treats `_` as a word
 * character, so "delete_record" has no internal word boundary between
 * "delete" and "_record" and would never match otherwise — a real bug caught
 * by MCPG-303's own tests before it shipped.
 */
export function normalizeIdentifier(value: string): string {
  return value.replace(/[_-]/g, ' ');
}

export function readsAsDestructive(value: string): boolean {
  return DESTRUCTIVE.test(normalizeIdentifier(value));
}
