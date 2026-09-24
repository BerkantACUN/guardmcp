import type { Confidence } from '../core/severity.js';

/**
 * Environment variables that turn a server's own logging or telemetry OFF.
 *
 * OWASP MCP08 (Lack of Audit and Telemetry) names this exact shape in its
 * second attack scenario: "a developer disables telemetry during testing to
 * extract proprietary pricing data, leaving no accountability trail". The
 * config is where that decision is written down, so it is the one place a
 * static scanner can catch it before the silence starts.
 *
 * This does not claim the server is malicious. It claims that if something
 * does go wrong on this server, there will be nothing to look at — which is
 * the whole of MCP08's "incident response teams reporting 'no data
 * available' during investigations".
 */

export interface TelemetrySwitchMatch {
  readonly key: string;
  readonly value: string;
  /** What the switch is, in words a reader can act on. */
  readonly label: string;
  readonly confidence: Confidence;
}

/** Values that mean "yes, disable it" for a boolean kill switch. */
const TRUTHY = new Set(['1', 'true', 'yes', 'on', 'enabled']);

/** Log levels at which nothing (or effectively nothing) is recorded. */
const SILENT_LEVELS = new Set(['off', 'silent', 'none', 'no', 'disabled', 'quiet']);

/** Kill switches with a published, cross-vendor meaning — no guessing needed. */
const STANDARD_SWITCHES: ReadonlyMap<string, string> = new Map([
  ['OTEL_SDK_DISABLED', 'the OpenTelemetry SDK kill switch'],
  ['DO_NOT_TRACK', 'the DO_NOT_TRACK cross-vendor telemetry opt-out'],
]);

/** Name shapes that mean "turn telemetry/logging off" across the ecosystem
 * (NEXT_TELEMETRY_DISABLED, DISABLE_LOGGING, MCP_TELEMETRY_DISABLED, ...). */
const DISABLE_NAME =
  /(^|_)(disable|no)_(telemetry|logging|logs|tracing|metrics|analytics)($|_)|(^|_)(telemetry|logging|logs|tracing|metrics|analytics)_disabled($|_)/i;

/** Variables that carry a verbosity level rather than a boolean. */
const LEVEL_NAME = /(^|_)log(ging)?_level($|_)|(^|_)verbosity($|_)/i;

export function findTelemetrySwitches(
  env: Readonly<Record<string, string>> | undefined,
): TelemetrySwitchMatch[] {
  if (!env) return [];

  const matches: TelemetrySwitchMatch[] = [];
  for (const [key, value] of Object.entries(env)) {
    const normalized = value.trim().toLowerCase();

    const standard = STANDARD_SWITCHES.get(key.toUpperCase());
    if (standard) {
      if (TRUTHY.has(normalized)) {
        matches.push({ key, value, label: standard, confidence: 'high' });
      }
      continue;
    }

    if (DISABLE_NAME.test(key)) {
      if (TRUTHY.has(normalized)) {
        matches.push({
          key,
          value,
          label: 'a telemetry/logging kill switch',
          confidence: 'medium',
        });
      }
      continue;
    }

    if (LEVEL_NAME.test(key) && SILENT_LEVELS.has(normalized)) {
      matches.push({
        key,
        value,
        label: `a log level set to "${value}", which records nothing`,
        confidence: 'medium',
      });
    }
  }
  return matches;
}

export interface TelemetryArgMatch {
  /** Index of the argument that carries the setting — the flag itself, or
   * the value when the level is given as a separate argument. */
  readonly index: number;
  /** The setting as written, e.g. `--log-level off` or `--no-telemetry`. */
  readonly text: string;
  readonly label: string;
  readonly confidence: Confidence;
}

/** `--no-telemetry`, `--disable-logging`, ... — a flag that is the switch. */
const DISABLE_FLAG = /^--(no|disable)-(telemetry|logging|logs|tracing|metrics|analytics)$/i;

/** `--telemetry false`, `--logging=off` — an on/off setting given a false value. */
const TOGGLE_FLAG = /^--(telemetry|logging|tracing|analytics)$/i;
const FALSY = new Set(['0', 'false', 'no', 'off', 'disabled']);

/** `--log-level off` / `--loglevel=silent` / `--verbosity quiet`. */
const LEVEL_FLAG = /^--(log[-_]?level|verbosity)$/i;

/**
 * The same switches as findTelemetrySwitches, given on the command line
 * instead of in `env`. A server started with `--log-level off` is exactly as
 * silent as one started with `LOG_LEVEL=off`, and a scanner that only reads
 * `env` is trivially sidestepped by moving the setting one field over.
 *
 * `--quiet` / `-q` are deliberately not matched: most tools use them to trim
 * console chatter, not to stop recording, and flagging every one would bury
 * the settings that actually turn an audit trail off.
 */
export function findTelemetryArgs(args: readonly string[] | undefined): TelemetryArgMatch[] {
  if (!args) return [];

  const matches: TelemetryArgMatch[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? '';
    const eq = arg.indexOf('=');
    const flag = eq === -1 ? arg : arg.slice(0, eq);
    // `--flag=value` carries its value inline; `--flag value` in the next arg.
    const inlineValue = eq === -1 ? undefined : arg.slice(eq + 1);
    const value = inlineValue ?? args[i + 1];
    const valueIndex = inlineValue === undefined ? i + 1 : i;

    if (eq === -1 && DISABLE_FLAG.test(flag)) {
      matches.push({
        index: i,
        text: arg,
        label: 'a telemetry/logging kill switch',
        confidence: 'medium',
      });
      continue;
    }
    if (value === undefined) continue;
    const normalized = value.trim().toLowerCase();

    if (TOGGLE_FLAG.test(flag) && FALSY.has(normalized)) {
      matches.push({
        index: valueIndex,
        text: inlineValue === undefined ? `${flag} ${value}` : arg,
        label: `${flag} switched off`,
        confidence: 'medium',
      });
    } else if (LEVEL_FLAG.test(flag) && SILENT_LEVELS.has(normalized)) {
      matches.push({
        index: valueIndex,
        text: inlineValue === undefined ? `${flag} ${value}` : arg,
        label: `a log level set to "${value}", which records nothing`,
        confidence: 'medium',
      });
    }
  }
  return matches;
}
