import { defineConfig } from 'tsup';

export default defineConfig([
  {
    // CLI: published to npm, where node_modules is populated by the
    // installer — safe to leave real deps external (smaller bundle, no
    // duplicated code across the ecosystem).
    entry: { 'cli/index': 'src/cli/index.ts' },
    format: ['esm'],
    target: 'node20',
    platform: 'node',
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
    //
    // platform: 'node' matters MORE here than it might look — without it,
    // esbuild doesn't reliably recognize a Node builtin (e.g. cross-spawn's
    // `require('child_process')`, pulled in transitively by
    // @modelcontextprotocol/sdk's stdio transport, Phase 3) as external and
    // auto-importable; it instead tries to bundle it, fails, and emits a
    // "Dynamic require of ... is not supported" runtime throw — a bundle
    // that builds cleanly but crashes on first live-introspection use. Only
    // caught by actually running the built action against a real fixture,
    // not by typecheck/lint/unit tests.
    entry: { 'action/index': 'action/index.ts' },
    format: ['esm'],
    target: 'node20',
    platform: 'node',
    dts: false,
    sourcemap: true,
    clean: false, // don't wipe the cli/ output built by the config above
    splitting: false,
    shims: false,
    noExternal: [/.*/],
    // esbuild's ESM output has no ambient `require` — bundled CJS deps
    // that call it (cross-spawn's `require('child_process')`, pulled in
    // transitively by @modelcontextprotocol/sdk's stdio transport, Phase 3)
    // hit esbuild's own synthesized __require() shim, which checks
    // `typeof require !== "undefined"` and, finding nothing, throws
    // "Dynamic require of ... is not supported" at runtime — a bundle that
    // builds clean but crashes the first time --live/pin actually run.
    // tsup's `shims` option does NOT cover this (it only polyfills
    // __dirname/__filename/import.meta.url); the standard esbuild fix is a
    // real module-scoped `require` binding so that check succeeds and
    // delegates to it. Only caught by actually running the built action
    // against a fixture, not by typecheck/lint/unit tests.
    banner: {
      js: "import { createRequire as __guardmcpCreateRequire } from 'node:module';\nconst require = __guardmcpCreateRequire(import.meta.url);",
    },
  },
]);
