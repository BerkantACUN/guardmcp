/**
 * Does this name or description read as an irreversible operation?
 *
 * Shared by MCPG-303 (a destructive tool that doesn't admit it in its
 * annotations), MCPG-702 (a server that can change things but cannot report
 * that it did) and MCPG-803 (a destructive tool that doesn't admit it in its
 * display title), so those rules cannot drift apart on what "destructive"
 * means.
 *
 * `s?` throughout covers 3rd-person/plural prose ("Deletes a file").
 */

/** Verbs whose destructive reading is the only common one in prose. */
const UNAMBIGUOUS = /\b(deletes?|removes?|truncates?|overwrites?|destroys?|purges?|wipes?)\b/i;

/**
 * Two words in that list turned out to be ordinary nouns far more often than
 * destructive verbs, so each now has to name what it acts on.
 *
 * Found by scanning real servers. `@upstash/context7-mcp` (3.9M downloads a
 * month) has a documentation-lookup tool, annotated `readOnlyHint: true`,
 * whose description reads "...provides a library ID in the format
 * '/org/project'...". MCPG-303 reported it as a destructive tool hiding
 * behind a read-only annotation, on the strength of the word "format". A
 * finding like that teaches a user to ignore the rule, which costs more than
 * the rule was ever going to catch.
 *
 * "drop" has the same problem via "drag and drop", "drop-down" and "drop
 * shadow". Both are kept, but only when an object makes the destructive
 * reading the plausible one. `[^.]{0,30}?` keeps the object inside the same
 * sentence, lazily, so "Deletes a row. Returns the table name." can't pair a
 * verb in one sentence with a noun in the next.
 */
const DROP_WITH_OBJECT =
  /\bdrops?\b[^.]{0,30}?\b(tables?|databases?|dbs?|collections?|indexe?s?|schemas?|columns?|constraints?|keyspaces?|buckets?)\b/i;

const FORMAT_WITH_DEVICE =
  /\bformats?\b[^.]{0,30}?\b(disks?|drives?|volumes?|partitions?|filesystems?|devices?)\b/i;

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
  const normalized = normalizeIdentifier(value);
  return (
    UNAMBIGUOUS.test(normalized) ||
    DROP_WITH_OBJECT.test(normalized) ||
    FORMAT_WITH_DEVICE.test(normalized)
  );
}
