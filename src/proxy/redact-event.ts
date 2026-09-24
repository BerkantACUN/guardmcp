import { findSecrets, redact } from '../detectors/secret-patterns.js';
import type { ProxyEvent } from './observer.js';

/** Keys whose string values are credentials, whatever the value looks like. */
const SENSITIVE_KEY =
  /pass(word|wd)|secret|token|api[-_]?key|authori[sz]ation|cookie|credential|private[-_]?key/i;

/**
 * The copy of an event that may be written to disk. The scanner must not
 * become a leak vector (SECURITY.md, risk R9), and tool-call arguments and
 * results routinely carry tokens: strings under credential-named keys are
 * redacted whole, and known-provider secrets inside any other string are
 * redacted where they appear. Only the log copy changes — forwarded traffic
 * never passes through here.
 */
export function redactEvent(event: ProxyEvent): ProxyEvent {
  return {
    ...event,
    ...(event.message !== undefined ? { message: redactValue(event.message) } : {}),
    ...(event.raw !== undefined ? { raw: redactSecretsIn(event.raw) } : {}),
  };
}

export function redactValue(value: unknown, key?: string): unknown {
  if (typeof value === 'string') {
    return key !== undefined && SENSITIVE_KEY.test(key) ? redact(value) : redactSecretsIn(value);
  }
  if (Array.isArray(value)) return value.map((item) => redactValue(item));
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([name, item]) => [name, redactValue(item, name)]),
    );
  }
  return value;
}

function redactSecretsIn(text: string): string {
  let out = text;
  for (const { value } of findSecrets(text)) out = out.split(value).join(redact(value));
  return out;
}
