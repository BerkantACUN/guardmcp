import { describe, expect, it } from 'vitest';
import { classifyUriTemplate } from '../../../src/detectors/uri-template.js';

describe('classifyUriTemplate — arbitrary file read', () => {
  it.each(['file:///{path}', 'file://{path}', 'file:///{+path}', 'file:///{file}'])(
    'flags %s as unbounded',
    (t) => {
      expect(classifyUriTemplate(t)?.kind).toBe('unbounded-file');
    },
  );

  it('flags reserved expansion even under a directory, because it may contain "/"', () => {
    // RFC 6570: {+var} and {#var} allow reserved characters through
    // unencoded, so "../../etc/passwd" survives the expansion.
    expect(classifyUriTemplate('file:///srv/docs/{+name}')?.kind).toBe('traversable-file');
    expect(classifyUriTemplate('file:///srv/docs/{#name}')?.kind).toBe('traversable-file');
  });

  it('does NOT flag a simple variable under a directory — "/" is percent-encoded there', () => {
    for (const t of ['file:///srv/docs/{name}.md', 'file:///srv/project/{id}/readme.md']) {
      expect(classifyUriTemplate(t), t).toBeNull();
    }
  });
});

describe('classifyUriTemplate — caller-chosen destination', () => {
  it.each(['https://{host}/api', 'http://{sub}.example.com/mcp', 'https://{+base}/v1'])(
    'flags %s: the caller picks where the request goes',
    (t) => {
      expect(classifyUriTemplate(t)?.kind).toBe('caller-chosen-host');
    },
  );

  it('does not flag a variable in the path of a fixed host', () => {
    for (const t of ['https://api.example.com/{endpoint}', 'https://api.example.com/v1/{id}']) {
      expect(classifyUriTemplate(t), t).toBeNull();
    }
  });
});

describe('classifyUriTemplate — ordinary templates', () => {
  it.each([
    'db://reports/{year}/{month}',
    'https://api.example.com/users/{id}',
    'custom://thing/{a}',
    'file:///srv/app/logs/{day}.log',
  ])('leaves %s alone', (t) => {
    expect(classifyUriTemplate(t), t).toBeNull();
  });

  it('returns null for a template with no variables at all', () => {
    expect(classifyUriTemplate('file:///srv/docs/readme.md')).toBeNull();
  });

  it('never throws on malformed input', () => {
    for (const t of ['', '{', '{}', '://', 'file:///{', 'not a uri {x}']) {
      expect(() => classifyUriTemplate(t), t).not.toThrow();
    }
  });
});
