#!/usr/bin/env node
/**
 * Benchmark: `guardmcp scan` over N generated config files.
 *
 * Generates N realistic `.mcp.json`-style configs (deterministic: seeded
 * PRNG, same files on every run), then runs the BUILT CLI over all of them
 * several times and reports wall-clock timings. The CLI is run as a real
 * subprocess — the number includes process start-up, exactly what a user or
 * CI job pays.
 *
 * Usage:
 *   npm run build
 *   node scripts/bench-scan.mjs                  # 1000 configs, 7 runs
 *   node scripts/bench-scan.mjs --configs 5000 --runs 3
 *   node scripts/bench-scan.mjs --cpu-prof <dir> # one extra profiled run
 *   node scripts/bench-scan.mjs --cli <path>     # benchmark another build (before/after)
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_CLI = fileURLToPath(new URL('../dist/cli/index.js', import.meta.url));

function parseArgs(argv) {
  const options = { configs: 1000, runs: 7, cpuProf: undefined, cli: DEFAULT_CLI };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--configs') options.configs = Number(argv[++i]);
    else if (arg === '--runs') options.runs = Number(argv[++i]);
    else if (arg === '--cpu-prof') options.cpuProf = resolve(argv[++i]);
    else if (arg === '--cli') options.cli = resolve(argv[++i]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

/** mulberry32 — tiny, seeded, good enough to vary fixture shapes. */
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PACKAGES = ['server-filesystem', 'server-memory', 'weather-mcp', 'notion-mcp', 'jira-bridge'];

/** A mix of what real configs hold: pinned and unpinned packages, env
 * blocks with placeholders and a few secret-shaped values, remotes with
 * headers, container launches — so every config rule has work to do. */
function makeServer(rand, i) {
  const kind = rand();
  if (kind < 0.45) {
    const pkg = `@example/${PACKAGES[Math.floor(rand() * PACKAGES.length)]}`;
    const pinned = rand() < 0.7;
    return {
      command: 'npx',
      args: ['-y', pinned ? `${pkg}@1.${i % 9}.${i % 5}` : pkg, '--root', `/home/dev/project-${i}`],
      env: {
        API_TOKEN: rand() < 0.1 ? `ghp_${'a1B2c3D4e5'.repeat(4).slice(0, 36)}` : `\${API_TOKEN}`,
        LOG_LEVEL: rand() < 0.05 ? 'off' : 'info',
        REGION: 'eu-west-1',
      },
    };
  }
  if (kind < 0.65) {
    return {
      command: 'uvx',
      args: [`mcp-server-fetch@0.${i % 7}.1`, '--timeout', '30'],
      env: { HTTP_PROXY: '', USER_AGENT: 'guardmcp-bench' },
    };
  }
  if (kind < 0.8) {
    return {
      command: 'docker',
      args: ['run', '-i', '--rm', '-e', 'TOKEN', `example/mcp:${i % 4}.0.0`],
    };
  }
  return {
    type: 'http',
    url: rand() < 0.1 ? `http://10.0.0.${i % 255}/mcp` : `https://mcp${i % 50}.example.com/mcp`,
    headers: { Authorization: `Bearer \${MCP_TOKEN}`, 'X-Team': `team-${i % 13}` },
  };
}

function generate(dir, count) {
  const rand = prng(0x5eed);
  const files = [];
  mkdirSync(join(dir, 'cfg'), { recursive: true });
  for (let i = 0; i < count; i++) {
    const servers = {};
    const n = 2 + Math.floor(rand() * 7);
    for (let s = 0; s < n; s++) servers[`server-${s}`] = makeServer(rand, i * 10 + s);
    const file = `cfg/${String(i).padStart(5, '0')}.json`;
    writeFileSync(join(dir, file), `${JSON.stringify({ mcpServers: servers }, null, 2)}\n`);
    files.push(file);
  }
  return files;
}

function runOnce(cli, dir, files, extraNodeArgs = []) {
  const start = process.hrtime.bigint();
  let stdout;
  try {
    stdout = execFileSync(
      process.execPath,
      [...extraNodeArgs, cli, 'scan', '--format', 'json', '--fail-on', 'critical', ...files],
      { cwd: dir, maxBuffer: 1024 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch (err) {
    // Exit 1 means findings at/above --fail-on: expected, not a failure.
    if (err.status !== 1) {
      const stderr = String(err.stderr ?? '')
        .trim()
        .split('\n')
        .slice(-5)
        .join('\n');
      throw new Error(`${cli} exited ${err.status}: ${stderr || err.message.slice(0, 200)}`);
    }
    stdout = err.stdout;
  }
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  const report = JSON.parse(stdout.toString('utf-8'));
  return { ms, findings: report.findings.length, targets: report.targetsScanned };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const cli = options.cli;
  if (!existsSync(cli)) throw new Error(`${cli} not found — run \`npm run build\` first.`);

  const dir = mkdtempSync(join(tmpdir(), 'guardmcp-bench-'));
  try {
    const files = generate(dir, options.configs);
    // One untimed warm-up run: the first run pays for the OS file cache.
    const warm = runOnce(cli, dir, files);
    const times = [];
    for (let i = 0; i < options.runs; i++) times.push(runOnce(cli, dir, files).ms);

    if (options.cpuProf) {
      mkdirSync(options.cpuProf, { recursive: true });
      runOnce(cli, dir, files, ['--cpu-prof', '--cpu-prof-dir', options.cpuProf]);
    }

    const fmt = (ms) => `${ms.toFixed(1)} ms`;
    console.log(
      `configs:   ${options.configs} (${warm.targets} scanned, ${warm.findings} findings)`,
    );
    console.log(`runs:      ${options.runs} (after 1 warm-up)`);
    console.log(`median:    ${fmt(median(times))}`);
    console.log(`min / max: ${fmt(Math.min(...times))} / ${fmt(Math.max(...times))}`);
    console.log(`node:      ${process.version} on ${process.platform}-${process.arch}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main();
