import pc from 'picocolors';
import { sanitizeForDisplay } from '../report/sanitize.js';
import { type Inventory, inventoryTotals, type ServerEntry } from './model.js';

/**
 * Server-controlled strings (tool names, launch commands) reach a terminal
 * here, so everything printed goes through sanitizeForDisplay for the same
 * reason report/formatters/human.ts does: a name carrying ANSI escapes could
 * otherwise rewrite the surrounding output.
 */
export function formatInventoryHuman(inventory: Inventory): string {
  const totals = inventoryTotals(inventory);
  if (totals.configs === 0) {
    return 'No MCP config files found.\n';
  }

  const lines: string[] = [];

  for (const config of inventory.configs) {
    lines.push(`${pc.bold(config.relativePath)}  ${pc.dim(`(${config.scope})`)}`);

    if (config.servers.length === 0) {
      lines.push(pc.dim('  (no servers declared)'));
    }

    for (const server of config.servers) {
      lines.push(
        `  ${pc.bold(sanitizeForDisplay(server.name))}  ${pc.dim(server.transport)}  ${pc.dim(
          sanitizeForDisplay(server.launch),
        )}`,
      );
      lines.push(...surfaceLines(server, inventory.live));
    }
    lines.push('');
  }

  lines.push(summary(totals, inventory.live));
  return `${lines.join('\n')}\n`;
}

function surfaceLines(server: ServerEntry, live: boolean): string[] {
  if (server.error !== undefined) {
    return [pc.yellow(`    could not connect — ${sanitizeForDisplay(server.error)}`)];
  }
  if (!server.surfaces) {
    // Deliberately not "0 tools": the distinction between "advertises none"
    // and "was never asked" is the entire point of an inventory.
    return live ? [pc.dim('    not introspected')] : [];
  }

  const rows: string[] = [];
  for (const [label, names] of [
    ['tools', server.surfaces.tools],
    ['prompts', server.surfaces.prompts],
    ['resources', server.surfaces.resources],
  ] as const) {
    if (names.length === 0) continue;
    const shown = names.slice(0, 6).map(sanitizeForDisplay).join(', ');
    const more = names.length > 6 ? pc.dim(` +${names.length - 6} more`) : '';
    rows.push(`    ${label.padEnd(10)} ${String(names.length).padStart(3)}  ${shown}${more}`);
  }
  if (rows.length === 0) rows.push(pc.dim('    advertises nothing'));
  return rows;
}

function summary(totals: ReturnType<typeof inventoryTotals>, live: boolean): string {
  const head = `${plural(totals.servers, 'server')} across ${plural(totals.configs, 'config')}`;
  if (!live) {
    return `${head}\n${pc.dim('Run with --live to list the tools, prompts and resources each server actually advertises.')}`;
  }
  return `${head} — ${plural(totals.tools, 'tool')}, ${plural(totals.prompts, 'prompt')}, ${plural(
    totals.resources,
    'resource',
  )}`;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

export function formatInventoryJson(inventory: Inventory): string {
  return `${JSON.stringify(
    { live: inventory.live, totals: inventoryTotals(inventory), configs: inventory.configs },
    null,
    2,
  )}\n`;
}
