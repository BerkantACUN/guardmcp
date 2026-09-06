import { resourceHiddenInstructionsRule } from './resources/hidden-instructions.js';
import { invisibleResourceContentRule } from './resources/invisible-resource-content.js';
import { sensitiveResourceUriRule } from './resources/sensitive-resource-uri.js';
import type { ResourceRule } from './resources/types.js';

/** Rules over live-introspected resources. Like tool and prompt rules these
 * only run under `--live`: a config says which servers exist, never what
 * they offer to read. */
export const ALL_RESOURCE_RULES: readonly ResourceRule[] = [
  sensitiveResourceUriRule,
  resourceHiddenInstructionsRule,
  invisibleResourceContentRule,
];
