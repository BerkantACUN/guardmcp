import { defineConfig } from 'tsup';

export default defineConfig([
  {
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
    // GitHub Action entrypoint (action.yml -> using: node20, main: dist/action/index.js).
    // No shebang — invoked directly by the Actions runner, not executed as a script.
    entry: { 'action/index': 'action/index.ts' },
    format: ['esm'],
    target: 'node20',
    dts: false,
    sourcemap: true,
    clean: false, // don't wipe the cli/ output built by the config above
    splitting: false,
    shims: false,
  },
]);
