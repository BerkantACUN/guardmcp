import { hardcodedSecretRule } from './secrets/hardcoded-secret.js';
import { highEntropyValueRule } from './secrets/high-entropy-value.js';
import { unpinnedPackageRule } from './secrets/unpinned-package.js';
import type { Rule } from './types.js';

export const ALL_RULES: readonly Rule[] = [
  hardcodedSecretRule,
  highEntropyValueRule,
  unpinnedPackageRule,
];
