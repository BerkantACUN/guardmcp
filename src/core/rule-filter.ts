export interface RuleFilterOptions {
  /** If non-empty, ONLY these rule IDs run. */
  readonly only: readonly string[];
  /** Excluded regardless of "only" — ignore always wins on overlap. */
  readonly ignore: readonly string[];
  /**
   * Validate `only` against this set instead of `rules`' own IDs. Needed
   * when filtering two separate catalogs against one shared `--rules` value
   * — e.g. `Rule[]` (file-based) and `ToolRule[]` (live-tool-based, Phase
   * 3): an ID from the other catalog must not be reported "unknown" just
   * because it isn't in *this* call's `rules` list. Defaults to `rules`'
   * own IDs, matching the single-catalog behavior this had before Phase 3.
   */
  readonly knownIds?: ReadonlySet<string>;
}

/** Shared shape between `Rule` and `ToolRule` — just enough to filter by ID. */
interface Identified {
  readonly id: string;
}

export function filterRules<T extends Identified>(
  rules: readonly T[],
  options: RuleFilterOptions,
): T[] {
  if (options.only.length > 0) {
    const knownIds = options.knownIds ?? new Set(rules.map((r) => r.id));
    const unknown = options.only.filter((id) => !knownIds.has(id));
    if (unknown.length > 0) {
      throw new Error(`Unknown rule ID(s) in --rules: ${unknown.join(', ')}`);
    }
  }

  const onlySet = options.only.length > 0 ? new Set(options.only) : undefined;
  const ignoreSet = new Set(options.ignore);

  return rules.filter((rule) => {
    if (ignoreSet.has(rule.id)) return false;
    if (onlySet && !onlySet.has(rule.id)) return false;
    return true;
  });
}
