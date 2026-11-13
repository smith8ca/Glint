import { isAxiosError } from 'axios';

/**
 * Builds a log-safe, one-line description of an error.
 *
 * Axios errors carry the full request config — including the `PRIVATE-TOKEN`
 * header — so they must never be logged directly. This keeps only the HTTP
 * method, request path, response status and message.
 */
export function describeError(err: unknown): string {
  if (isAxiosError(err)) {
    const method = err.config?.method?.toUpperCase() ?? 'REQUEST';
    const url = err.config?.url ?? '(unknown url)';
    const status = err.response?.status;
    const statusText = status === undefined ? '' : ` with status ${status}`;
    return `${method} ${url} failed${statusText}: ${err.message}`;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}
