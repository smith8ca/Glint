import { describe, it, expect } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';
import { describeError } from '../../utils/errors';

function makeAxiosError(status?: number): AxiosError {
  const config = {
    method: 'get',
    url: '/api/v4/projects/1/merge_requests/42',
    headers: new AxiosHeaders({ 'PRIVATE-TOKEN': 'glpat-super-secret-token' }), // gitleaks:allow (fake test token)
  };
  const response =
    status === undefined
      ? undefined
      : { status, statusText: 'Error', headers: {}, config, data: {} };
  return new AxiosError('Request failed', 'ERR_BAD_RESPONSE', config, {}, response);
}

describe('describeError', () => {
  it('summarises an axios error without exposing request headers', () => {
    const text = describeError(makeAxiosError(404));
    expect(text).toBe('GET /api/v4/projects/1/merge_requests/42 failed with status 404: Request failed');
    expect(text).not.toContain('glpat-super-secret-token');
  });

  it('omits the status when the request got no response', () => {
    expect(describeError(makeAxiosError())).toBe(
      'GET /api/v4/projects/1/merge_requests/42 failed: Request failed'
    );
  });

  it('falls back to placeholders when the axios config is missing', () => {
    const err = new AxiosError('Network Error');
    expect(describeError(err)).toBe('REQUEST (unknown url) failed: Network Error');
  });

  it('returns the message of a plain Error', () => {
    expect(describeError(new Error('boom'))).toBe('boom');
  });

  it('stringifies non-Error values', () => {
    expect(describeError('plain string')).toBe('plain string');
  });
});
