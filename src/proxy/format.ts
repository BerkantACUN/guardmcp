import pc from 'picocolors';
import { sanitizeForDisplay } from '../report/sanitize.js';
import type { ProxyEvent } from './observer.js';

const ARROW = { 'client->server': '→', 'server->client': '←' } as const;

/**
 * One human-readable line per message, for stderr. Method names and ids come
 * from the peers — either side can be hostile — so both go through
 * sanitizeForDisplay before reaching a terminal, same as every other
 * server-controlled string guardmcp prints.
 */
export function formatEventLine(event: ProxyEvent): string {
  const arrow = ARROW[event.direction];
  const side = event.direction === 'client->server' ? 'client→server' : 'server→client';
  if (event.kind === 'invalid') {
    return pc.yellow(
      `[guardmcp proxy] ${arrow} ${side} invalid (${event.bytes} B): ${sanitizeForDisplay(event.error ?? '')}`,
    );
  }
  const parts = [`[guardmcp proxy] ${arrow} ${side}`, event.kind.padEnd(12)];
  if (event.method !== undefined) parts.push(sanitizeForDisplay(event.method));
  if (event.id !== undefined) parts.push(`#${sanitizeForDisplay(String(event.id))}`);
  if (event.durationMs !== undefined) parts.push(`(${event.durationMs} ms)`);
  const line = parts.join(' ');
  return event.kind === 'error' ? pc.red(line) : pc.dim(line);
}

/** Findings get their own lines so they stand out from routine traffic. */
export function formatFindingLines(event: ProxyEvent): string[] {
  return (event.findings ?? []).map((f) =>
    pc.red(
      `[guardmcp proxy] ⚠ ${f.ruleId} ${f.severity}: ${sanitizeForDisplay(f.message)} (${sanitizeForDisplay(f.location.file)})`,
    ),
  );
}
