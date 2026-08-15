export const EXIT_CODES = {
  clean: 0,
  findingsAtOrAboveThreshold: 1,
  toolError: 2,
  liveConnectionError: 3,
} as const;

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];
