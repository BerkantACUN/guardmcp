import { unrestrictedScopeRule } from './scope/unrestricted-scope.js';
import { dangerousCommandRule } from './secrets/dangerous-command.js';
import { hardcodedSecretRule } from './secrets/hardcoded-secret.js';
import { highEntropyValueRule } from './secrets/high-entropy-value.js';
import { unpinnedPackageRule } from './secrets/unpinned-package.js';
import { insecureTransportRule } from './transport/insecure-transport.js';
import { ssrfReachableTargetRule } from './transport/ssrf-reachable-target.js';
import { tlsVerificationDisabledRule } from './transport/tls-verification-disabled.js';
import { unauthenticatedRemoteEndpointRule } from './transport/unauthenticated-remote-endpoint.js';
import type { Rule } from './types.js';

export const ALL_RULES: readonly Rule[] = [
  hardcodedSecretRule,
  highEntropyValueRule,
  dangerousCommandRule,
  unpinnedPackageRule,
  insecureTransportRule,
  tlsVerificationDisabledRule,
  ssrfReachableTargetRule,
  unauthenticatedRemoteEndpointRule,
  unrestrictedScopeRule,
];
