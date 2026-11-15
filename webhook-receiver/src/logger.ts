import pino from 'pino';

export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/**
 * The application logger: one JSON object per line on stdout.
 *
 * Starts at `info`; `index.ts` applies the validated LOG_LEVEL from the config.
 * Never log raw error objects from axios — they carry the GitLab token in
 * their request headers. Use `describeError()` and log the string instead.
 */
export const logger = pino({
  base: { service: 'glint' },
  level: 'info',
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    // "level": "info" rather than pino's default numeric level.
    level: (label) => ({ level: label }),
  },
});
