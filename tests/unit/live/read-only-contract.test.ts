import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The one promise this tool cannot break.
 *
 * guardmcp connects to servers precisely because nobody has established they
 * are safe — that is the point of scanning them. A scanner that invokes a
 * tool on a server it is scanning has performed the attack it exists to warn
 * about: `tools/call` runs whatever the server decided that tool does, and
 * `resources/read` fetches whatever URI the server chose to advertise, which
 * MCPG-209 exists to flag precisely because it can point at `~/.ssh/id_rsa`.
 *
 * Only the list methods are safe, because listing is the server describing
 * itself rather than acting.
 *
 * That rule was written down in a comment in introspect.ts and enforced by
 * nothing. A "deeper scan" feature added in good faith six months from now
 * would pass every other test in this suite. So it is a test now — a source
 * check rather than a behavioural one, because the property being protected
 * is "this call never appears", and no runtime assertion can prove absence.
 */
const LIVE_DIR = fileURLToPath(new URL('../../../src/live/', import.meta.url));

/** SDK client methods that make a server DO something rather than describe itself. */
const FORBIDDEN = [
  'callTool',
  'getPrompt',
  'readResource',
  'subscribeResource',
  'unsubscribeResource',
  'complete',
] as const;

function sourceFiles(dir: string): { name: string; text: string }[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => ({ name, text: readFileSync(join(dir, name), 'utf-8') }));
}

/** Strips comments, so the prose explaining what we don't do can't fail its own test. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('live introspection is read-only', () => {
  const files = sourceFiles(LIVE_DIR);

  it('has source files to check', () => {
    // Guards against the whole suite passing vacuously if src/live/ moves.
    expect(files.length).toBeGreaterThan(0);
  });

  for (const method of FORBIDDEN) {
    it(`never calls client.${method}()`, () => {
      const offenders = files
        .filter(({ text }) => new RegExp(`\\.\\s*${method}\\s*\\(`).test(code(text)))
        .map(({ name }) => name);

      expect(
        offenders,
        `src/live/${offenders.join(', ')} invokes ${method}(). Listing is a server ` +
          'describing itself; calling is a server acting. guardmcp scans servers nobody ' +
          'has established are safe, so it must never be the one to pull the trigger.',
      ).toEqual([]);
    });
  }

  it('uses only the list methods and the capability read', () => {
    const called = new Set<string>();
    for (const { text } of files) {
      for (const match of code(text).matchAll(/client\s*\.\s*([A-Za-z]+)\s*\(/g)) {
        called.add(match[1] as string);
      }
    }

    // An allowlist rather than a denylist: a future SDK method that acts on
    // the server would otherwise slip through simply by not being on the
    // FORBIDDEN list above.
    const allowed = new Set([
      'listTools',
      'listPrompts',
      'listResources',
      'listResourceTemplates',
      'getServerCapabilities',
      'close',
      'connect',
    ]);

    const unexpected = [...called].filter((name) => !allowed.has(name));
    expect(
      unexpected,
      `src/live calls client.${unexpected.join('(), client.')}(). If that method makes the ` +
        'server act rather than describe itself, it does not belong here. If it is genuinely ' +
        'read-only, add it to the allowlist deliberately.',
    ).toEqual([]);
  });
});
