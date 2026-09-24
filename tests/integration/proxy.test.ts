import { execFile } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ProxyEvent } from '../../src/proxy/observer.js';
import { EXIT_SPAWN_FAILED, type ProxyOptions, runProxy } from '../../src/proxy/run-proxy.js';

const FIXTURE_SERVER = fileURLToPath(
  new URL('../fixtures/live-servers/fixture-server.mjs', import.meta.url),
);
const cliPath = fileURLToPath(new URL('../../dist/cli/index.js', import.meta.url));

/** A "server" that sends back exactly what it receives — any byte the proxy
 * altered, in either direction, shows up as a difference. */
const ECHO = ['-e', 'process.stdin.pipe(process.stdout)'];

interface Harness {
  readonly input: PassThrough;
  readonly output: PassThrough;
  readonly received: () => Buffer;
  readonly stderr: string[];
  readonly run: (overrides: Partial<ProxyOptions>) => Promise<number>;
}

function harness(): Harness {
  const input = new PassThrough();
  const output = new PassThrough();
  const chunks: Buffer[] = [];
  output.on('data', (chunk: Buffer) => chunks.push(chunk));
  const stderr: string[] = [];
  return {
    input,
    output,
    received: () => Buffer.concat(chunks),
    stderr,
    run: (overrides) =>
      runProxy({
        command: process.execPath,
        args: ECHO,
        serverName: 'echo',
        input,
        output,
        stderr: (line) => stderr.push(line),
        signals: new EventEmitter(),
        ...overrides,
      }),
  };
}

const INITIALIZE = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'proxy-test', version: '1.0.0' },
  },
};

/** Sends each message, then waits until `expectedLines` replies arrived
 * before closing stdin — the fixture server exits when stdin closes, which
 * would otherwise race its own replies. */
function converse(h: Harness, messages: readonly string[], expectedLines: number): void {
  let lines = 0;
  h.output.on('data', (chunk: Buffer) => {
    lines += chunk.toString('utf8').split('\n').length - 1;
    if (lines >= expectedLines) h.input.end();
  });
  for (const message of messages) h.input.write(`${message}\n`);
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'guardmcp-proxy-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('guardmcp proxy — forwarding', () => {
  it('forwards bytes one-for-one in both directions, whatever they are', async () => {
    const h = harness();
    const payload = Buffer.concat([
      Buffer.from('{"jsonrpc":"2.0","id":1,"method":"ping"}\n'),
      Buffer.from('this is not json {{{\n'),
      Buffer.from('{"jsonrpc":"2.0","id":2,"method":"x","params":{"s":"ğüş 😀"}}\r\n'),
      Buffer.from([0xff, 0xfe, 0x00, 0x0a]), // not even UTF-8
      Buffer.from('{"jsonrpc":"2.0","method":"no-trailing-newline"}'),
    ]);
    const done = h.run({});
    // Uneven chunks: message and multi-byte boundaries fall mid-chunk.
    for (let i = 0; i < payload.length; i += 7) h.input.write(payload.subarray(i, i + 7));
    h.input.end();

    expect(await done).toBe(0);
    expect(h.received().equals(payload)).toBe(true);
  });

  it('keeps forwarding after malformed JSON and logs it as invalid instead of crashing', async () => {
    const h = harness();
    const logPath = join(dir, 'traffic.jsonl');
    const done = h.run({ logPath });
    h.input.write('{"jsonrpc":"2.0","id":1,"meth\n');
    h.input.write('{"jsonrpc":"2.0","id":2,"method":"ping"}\n');
    h.input.end();

    expect(await done).toBe(0);
    const events = readFileSync(logPath, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as ProxyEvent);
    // Each message goes out and comes back through the echo: 2 × 2 events.
    expect(events).toHaveLength(4);
    expect(events.filter((e) => e.kind === 'invalid')).toHaveLength(2);
    const response = events.find((e) => e.kind === 'request' && e.direction === 'server->client');
    expect(response).toMatchObject({ method: 'ping', id: 2 });
    expect(h.received().toString()).toContain('"method":"ping"');
  });

  it('logs each message to stderr when no --log file is given', async () => {
    const h = harness();
    const done = h.run({});
    h.input.end('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');
    await done;
    expect(h.stderr.some((l) => l.includes('notification') && l.includes('initialized'))).toBe(
      true,
    );
  });
});

describe('guardmcp proxy — scanning tools/list', () => {
  it('flags poisoned tools as they pass, logs them, and writes SARIF on exit', async () => {
    const h = harness();
    const logPath = join(dir, 'traffic.jsonl');
    const sarifPath = join(dir, 'proxy.sarif');
    const done = h.run({
      args: [FIXTURE_SERVER],
      serverName: 'fixture',
      env: { ...process.env, FIXTURE_TOOLS: 'poisoned' },
      logPath,
      sarifPath,
    });
    converse(
      h,
      [
        JSON.stringify(INITIALIZE),
        '{"jsonrpc":"2.0","method":"notifications/initialized"}',
        '{"jsonrpc":"2.0","id":2,"method":"tools/list"}',
      ],
      2,
    );

    expect(await done).toBe(0);

    const events = readFileSync(logPath, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as ProxyEvent);
    const toolsList = events.find((e) => e.kind === 'response' && e.method === 'tools/list');
    expect(toolsList?.id).toBe(2);
    expect(typeof toolsList?.durationMs).toBe('number');
    expect(toolsList?.findings?.map((f) => f.ruleId)).toContain('MCPG-201');
    expect(toolsList?.findings?.[0]?.location.file).toMatch(/^live:fixture\//);

    // With --log, routine traffic stays out of stderr but findings do not.
    expect(h.stderr.some((l) => l.includes('MCPG-201'))).toBe(true);
    expect(h.stderr.some((l) => l.includes('tools/list'))).toBe(false);

    const sarif = JSON.parse(readFileSync(sarifPath, 'utf8')) as {
      version: string;
      runs: Array<{ results: Array<{ ruleId: string }> }>;
    };
    expect(sarif.version).toBe('2.1.0');
    expect(sarif.runs[0]?.results.map((r) => r.ruleId)).toContain('MCPG-201');
  });

  it('writes an empty SARIF report for a clean session', async () => {
    const h = harness();
    const sarifPath = join(dir, 'proxy.sarif');
    const done = h.run({ args: [FIXTURE_SERVER], serverName: 'fixture', sarifPath });
    converse(h, [JSON.stringify(INITIALIZE), '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'], 2);
    expect(await done).toBe(0);
    const sarif = JSON.parse(readFileSync(sarifPath, 'utf8')) as {
      runs: Array<{ results: unknown[] }>;
    };
    expect(sarif.runs[0]?.results).toEqual([]);
  });
});

describe('guardmcp proxy — process lifecycle', () => {
  it("exits with the wrapped server's own exit code", async () => {
    const h = harness();
    const code = await h.run({ args: ['-e', 'process.exit(42)'] });
    expect(code).toBe(42);
  });

  it('returns 128 + signal number when the server is killed by a signal', async () => {
    const h = harness();
    const code = await h.run({ args: ['-e', "process.kill(process.pid, 'SIGKILL')"] });
    // Windows has no POSIX signals: Node terminates the process outright and
    // the child reports a plain exit code of 1, which is passed through as is.
    expect(code).toBe(process.platform === 'win32' ? 1 : 128 + 9);
  });

  it('returns 127 when the command cannot be started', async () => {
    const h = harness();
    const code = await h.run({ command: join(dir, 'no-such-server') });
    expect(code).toBe(EXIT_SPAWN_FAILED);
    expect(h.stderr.some((l) => l.includes('could not start'))).toBe(true);
  });

  it.skipIf(process.platform === 'win32')(
    'forwards SIGTERM to the server and exits with what the server chose',
    async () => {
      const h = harness();
      const signals = new EventEmitter();
      const done = h.run({
        signals,
        args: [
          '-e',
          "process.on('SIGTERM', () => process.exit(9)); console.log('ready'); setInterval(() => {}, 1000);",
        ],
      });
      await new Promise<void>((resolve) => h.output.once('data', () => resolve()));
      signals.emit('SIGTERM');
      expect(await done).toBe(9);
      expect(signals.listenerCount('SIGTERM')).toBe(0);
    },
  );

  it('refuses a --log path it cannot open before starting the server', async () => {
    const h = harness();
    await expect(h.run({ logPath: join(dir, 'missing', 'dir', 'log.jsonl') })).rejects.toThrow();
  });
});

describe('guardmcp proxy (built artifact)', () => {
  function runBuilt(
    args: string[],
    stdin: string,
  ): Promise<{ code: number; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const child = execFile(process.execPath, [cliPath, ...args], (err, stdout, stderr) => {
        const code = err ? ((err as { code?: number }).code ?? 1) : 0;
        resolve({ code, stdout, stderr });
      });
      child.stdin?.end(stdin);
    });
  }

  it('passes everything after -- to the server, including flags guardmcp also has', async () => {
    const script = join(dir, 'argv.mjs');
    writeFileSync(script, 'console.log(JSON.stringify(process.argv.slice(2))); process.exit(5);');
    const result = await runBuilt(
      ['proxy', '--', process.execPath, script, '--log', 'x', '--name', 'y'],
      '',
    );
    expect(result.code).toBe(5);
    expect(JSON.parse(result.stdout)).toEqual(['--log', 'x', '--name', 'y']);
  });
});
