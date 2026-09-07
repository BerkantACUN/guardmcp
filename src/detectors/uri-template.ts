/**
 * Classifies an RFC 6570 URI template by what a caller can reach through it.
 *
 * A resource points at one fixed URI, so it can be reviewed. A resource
 * TEMPLATE names a shape the caller fills in, so what it reaches is bounded by
 * the template rather than by anything a reviewer approved. `file:///{path}`
 * is arbitrary local file read, advertised as a feature.
 *
 * The distinction that matters is RFC 6570's expansion operators:
 *
 *   {var}   simple expansion — reserved characters, including "/", are
 *           percent-encoded, so a value cannot climb out of its path segment.
 *   {+var}  reserved expansion — "/" and "." pass through unencoded, so
 *           "../../etc/passwd" survives.
 *   {#var}  fragment expansion — same reserved set as {+var}.
 *
 * So `file:///srv/docs/{name}.md` is bounded and `file:///srv/docs/{+name}` is
 * not, even though they look alike.
 */

export type UriTemplateRisk = 'unbounded-file' | 'traversable-file' | 'caller-chosen-host';

export interface UriTemplateMatch {
  readonly kind: UriTemplateRisk;
  readonly label: string;
}

/** `{var}`, `{+var}`, `{#var}`, `{var,other}`, `{?q}` … */
const EXPRESSION = /\{([+#./;?&]?)([^}]*)\}/g;

/** Reserved-expansion operators: these let "/" and "." through unencoded. */
const RESERVED_OPERATORS = new Set(['+', '#']);

export function classifyUriTemplate(template: string): UriTemplateMatch | null {
  if (!template) return null;

  const expressions = [...template.matchAll(EXPRESSION)];
  if (expressions.length === 0) return null;

  const schemeEnd = template.indexOf(':');
  const scheme = schemeEnd > 0 ? template.slice(0, schemeEnd).toLowerCase() : '';

  if (scheme === 'file') {
    // Everything after the authority slashes. `file:///{path}` and
    // `file://{path}` both put the variable where the whole path would be.
    const afterScheme = template.slice(schemeEnd + 1).replace(/^\/+/, '');
    if (/^\{[+#]?[^}]*\}\/?$/.test(afterScheme)) {
      return {
        kind: 'unbounded-file',
        label:
          'the entire path is a caller-supplied variable, so this reads any file the server can open',
      };
    }
    if (expressions.some((m) => RESERVED_OPERATORS.has(m[1] ?? ''))) {
      return {
        kind: 'traversable-file',
        label:
          'it uses RFC 6570 reserved expansion ({+var}/{#var}), which passes "/" and ".." through unencoded — a caller can climb out of the intended directory',
      };
    }
    return null;
  }

  if (scheme === 'http' || scheme === 'https') {
    // A variable before the first path slash sits in the authority: the
    // caller chooses which host the request goes to.
    const afterScheme = template.slice(schemeEnd + 1).replace(/^\/+/, '');
    const authority = afterScheme.split('/')[0] ?? '';
    if (/\{[+#]?[^}]*\}/.test(authority)) {
      return {
        kind: 'caller-chosen-host',
        label:
          'a variable sits in the host position, so the caller decides where the request is sent',
      };
    }
  }

  return null;
}
