import { Command } from 'commander';

declare function createCli(): Command;
/**
 * Parses and runs, turning a usage mistake into a message and exit code 2.
 *
 * `parse()` is synchronous while every action here is async, so a rejected
 * action escaped as an unhandled rejection: Node printed a stack trace and
 * exited 1. Exit 1 means "findings at or above the threshold" — so a mistyped
 * flag was reported to CI as a security failure, which is wrong and quietly
 * devalues every other exit code the tool produces.
 */
declare function runCli(argv: readonly string[]): Promise<number>;

export { createCli, runCli };
