import { defineConfig } from 'tsup';

export default defineConfig([
  {
    // CLI: published to npm, where node_modules is populated by the
    // installer — safe to leave real deps external (smaller bundle, no
    // duplicated code across the ecosystem).
    entry: { 'cli/index': 'src/cli/index.ts' },
    format: ['esm'],
    target: 'node20',
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: false,
    shims: false,
    banner: { js: '#!/usr/bin/env node' },
  },
  {
    // GitHub Action entrypoint (action.yml -> using: node20, main:
    // dist/action/index.js). A consumer's `uses: owner/repo@ref` checks out
    // the repo and runs this file with plain `node` — no `npm install`
    // step, so no node_modules. Every dependency MUST be inlined
    // (noExternal) or the action crashes on the first `import` with
    // ERR_MODULE_NOT_FOUND. Caught by a real fresh-clone test before this
    // shipped as a release — the exact bundling-boundary mistake this
    // project has now made three times (package-info.ts's path assumption,
    // the duplicate shebang in Phase 0, and this).
    entry: { 'action/index': 'action/index.ts' },
    format: ['esm'],
    target: 'node20',
    dts: false,
    sourcemap: true,
    clean: false, // don't wipe the cli/ output built by the config above
    splitting: false,
    shims: false,
    noExternal: [/.*/],
  },
]);
