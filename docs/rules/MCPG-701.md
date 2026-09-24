# MCPG-701 — Telemetry or logging disabled in MCP server launch configuration

**Severity:** Medium · **Confidence:** High (standard switches) / Medium (generic) · **Category:** Audit
**OWASP:** [MCP08 — Lack of Audit and Telemetry](https://owasp.org/www-project-mcp-top-10/2025/MCP08-2025%E2%80%93Lack-of-Audit-and-Telemetry)

## What it detects

An `env` entry in a stdio server's launch configuration that turns the server's own logging or telemetry off:

- **Published, cross-vendor switches** (high confidence): `OTEL_SDK_DISABLED=true` (the OpenTelemetry SDK kill switch), `DO_NOT_TRACK=1` (the cross-vendor opt-out convention).
- **Ecosystem disable switches** (medium confidence): names shaped like `DISABLE_TELEMETRY`, `NEXT_TELEMETRY_DISABLED`, `LOGGING_DISABLED`, `NO_LOGS`, set to a truthy value.
- **Silenced verbosity** (medium confidence): a `*LOG_LEVEL*` or `*VERBOSITY*` variable set to `off`, `silent`, `none`, `quiet`, or `disabled`.

The same settings are recognised when they are given as **launch arguments** instead of environment variables:

- **Kill-switch flags:** `--no-telemetry`, `--disable-telemetry`, `--no-logging`, `--disable-logging`, and the same for `logs`, `tracing`, `metrics` and `analytics`.
- **Toggles switched off:** `--telemetry`, `--logging`, `--tracing` or `--analytics` given `false`, `off`, `no`, `0` or `disabled` (`--logging=false`, `--telemetry off`).
- **Silenced verbosity:** `--log-level`, `--loglevel` or `--verbosity` given one of the silent levels above.

`--quiet` and `-q` are deliberately **not** reported: most tools use them to trim console output, not to stop recording, and flagging every one would bury the settings that actually turn an audit trail off.

A switch set to a falsy value (`DISABLE_TELEMETRY=false`, `OTEL_SDK_DISABLED=0`) means telemetry is **on** and is not reported.

## Why it matters

OWASP MCP08's second attack scenario is exactly this configuration:

> "A developer disables telemetry during testing to extract proprietary pricing data, leaving no accountability trail."

The rule makes no claim about intent — silencing noisy local output is by far the common case. The finding is that the setting **survived into a committed config**, where it now applies to everyone who uses it.

The cost of that is only ever paid later. MCP08's detection indicators are all absences: "lack of log entries during active usage periods", "gaps or inconsistencies in audit trails", "incident response teams reporting 'no data available' during investigations". By the time those are noticed, the window you needed logs for has already closed. The config is the last point at which the silence is cheap to undo.

## Example

```json
{
  "mcpServers": {
    "billing-agent": {
      "command": "node",
      "args": ["server.js"],
      "env": {
        "OTEL_SDK_DISABLED": "true",
        "LOG_LEVEL": "silent"
      }
    }
  }
}
```

## Remediation

Remove the variable from the committed config, or scope it to local development only (a personal `.env` that is git-ignored, a dev-only profile). If a server genuinely must not emit telemetry — a privacy requirement, say — record that decision somewhere a reviewer will find it, so the silence is a choice on the record rather than an accident.

**Behind `guardmcp proxy`:** the arguments of the command after `--` are checked too, once, at their index in the entry's own `args`.

## Limitations

This rule sees only what the **config** says — the `env` block and the launch arguments. A server that never implemented logging in the first place, or one whose logging is disabled server-side on a remote host, is equally silent and is not detectable from here. Remote (HTTP) servers have no `env` block and are skipped.
