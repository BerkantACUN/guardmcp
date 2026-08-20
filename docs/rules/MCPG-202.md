# MCPG-202 — Invisible or obfuscated content in tool description

**Severity:** High · **Confidence:** High (deterministic — these characters have no legitimate reason to appear) · **Category:** Poisoning

> **Note:** operates on a live-introspected tool definition. Not yet wired into `scan` — lands with `--live` in Phase 3. Fully implemented and tested today.

## What it detects

- Zero-width characters (U+200B, U+200C, U+200D, U+FEFF)
- Bidirectional text override/isolate characters (U+202A–202E, U+2066–2069)
- HTML comments (`<!-- ... -->`)

hidden inside a tool's `description`.

## Why it matters

This content is invisible to a human reading the description normally, but fully present in the raw text the LLM receives — the same class of attack as MCPG-201, using invisibility instead of natural-language misdirection.

## Remediation

Inspect the raw description bytes (not a rendered view) for hidden content. These characters have no legitimate reason to appear in a tool description; treat their presence as evidence of tampering.
