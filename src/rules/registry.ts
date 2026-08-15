import { hardcodedSecretRule } from './secrets/hardcoded-secret.js';
import type { Rule } from './types.js';

export const ALL_RULES: readonly Rule[] = [hardcodedSecretRule];
