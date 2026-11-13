import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import https from 'node:https';
import tls from 'node:tls';
import { createGitlabClient, trustedCertificates } from '../../services/gitlab';
import type { Config } from '../../config';

vi.mock('axios');

const mockAxiosInstance = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
};

const config: Config = {
  port: 3000,
  gitlabBaseUrl: 'https://gitlab.example.com',
  gitlabToken: 'test-token',
  webhookSecret: 'test-secret',
  anthropicApiKey: 'test-key',
  anthropicModel: 'claude-sonnet-4-6',
  gitlabRejectUnauthorized: false,
};

describe('createGitlabClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(axios.create).mockReturnValue(mockAxiosInstance as unknown as ReturnType<typeof axios.create>);
  });

  it('creates an axios instance with correct baseURL and token header', () => {
    createGitlabClient(config);
    expect(axios.create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://gitlab.example.com',
        headers: { 'PRIVATE-TOKEN': 'test-token' },
      })
    );
  });

  it('leaves the agent CA list unset when no CA is configured', () => {
    createGitlabClient(config);
    const { httpsAgent } = vi.mocked(axios.create).mock.calls[0][0] as { httpsAgent: https.Agent };
    expect(httpsAgent.options.ca).toBeUndefined();
  });

  it('trusts the configured CA alongside the default certificates', () => {
    const pem = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n';
    createGitlabClient({ ...config, gitlabCaCertificate: pem });
    const { httpsAgent } = vi.mocked(axios.create).mock.calls[0][0] as { httpsAgent: https.Agent };
    const ca = httpsAgent.options.ca as string[];
    expect(ca.at(-1)).toBe(pem);
    expect(ca.length).toBeGreaterThan(1);
  });

  describe('trustedCertificates', () => {
    it('returns undefined without an extra CA', () => {
      expect(trustedCertificates(undefined)).toBeUndefined();
    });

    it('falls back to tls.rootCertificates when getCACertificates is unavailable', () => {
      const original = tls.getCACertificates;
      Object.defineProperty(tls, 'getCACertificates', { value: undefined, configurable: true, writable: true });
      try {
        const result = trustedCertificates('PEM');
        expect(result).toEqual([...tls.rootCertificates, 'PEM']);
      } finally {
        Object.defineProperty(tls, 'getCACertificates', { value: original, configurable: true, writable: true });
      }
    });
  });

  it('getMRDetails calls the correct endpoint', async () => {
    mockAxiosInstance.get.mockResolvedValue({ data: { iid: 1, title: 'Test MR' } });
    const client = createGitlabClient(config);
    const result = await client.getMRDetails(42, 1);
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/v4/projects/42/merge_requests/1');
    expect(result).toEqual({ iid: 1, title: 'Test MR' });
  });

  it('getMRDiffs calls the correct endpoint with per_page param', async () => {
    mockAxiosInstance.get.mockResolvedValue({ data: [] });
    const client = createGitlabClient(config);
    await client.getMRDiffs(42, 1);
    expect(mockAxiosInstance.get).toHaveBeenCalledWith(
      '/api/v4/projects/42/merge_requests/1/diffs',
      { params: { per_page: 100 } }
    );
  });

  it('postMRNote posts to the correct endpoint', async () => {
    mockAxiosInstance.post.mockResolvedValue({ data: {} });
    const client = createGitlabClient(config);
    await client.postMRNote(42, 1, 'Review summary');
    expect(mockAxiosInstance.post).toHaveBeenCalledWith(
      '/api/v4/projects/42/merge_requests/1/notes',
      { body: 'Review summary' }
    );
  });

  it('getReleases calls the correct endpoint', async () => {
    mockAxiosInstance.get.mockResolvedValue({ data: [] });
    const client = createGitlabClient(config);
    await client.getReleases(42);
    expect(mockAxiosInstance.get).toHaveBeenCalledWith(
      '/api/v4/projects/42/releases',
      { params: { per_page: 10 } }
    );
  });

  it('compareRefs calls the correct endpoint with from/to params', async () => {
    mockAxiosInstance.get.mockResolvedValue({ data: { commits: [], diffs: [] } });
    const client = createGitlabClient(config);
    await client.compareRefs(42, 'v1.0.0', 'v1.1.0');
    expect(mockAxiosInstance.get).toHaveBeenCalledWith(
      '/api/v4/projects/42/repository/compare',
      { params: { from: 'v1.0.0', to: 'v1.1.0', straight: true } }
    );
  });

  it('getTagCommits calls the correct endpoint', async () => {
    mockAxiosInstance.get.mockResolvedValue({ data: [] });
    const client = createGitlabClient(config);
    await client.getTagCommits(42, 'v1.0.0');
    expect(mockAxiosInstance.get).toHaveBeenCalledWith(
      '/api/v4/projects/42/repository/commits',
      { params: { ref_name: 'v1.0.0', per_page: 100 } }
    );
  });

  it('updateRelease puts to the correct endpoint', async () => {
    mockAxiosInstance.put.mockResolvedValue({ data: {} });
    const client = createGitlabClient(config);
    await client.updateRelease(42, 'v1.0.0', 'New release notes');
    expect(mockAxiosInstance.put).toHaveBeenCalledWith(
      '/api/v4/projects/42/releases/v1.0.0',
      { description: 'New release notes' }
    );
  });

  it('updateRelease URL-encodes tags containing special characters', async () => {
    mockAxiosInstance.put.mockResolvedValue({ data: {} });
    const client = createGitlabClient(config);
    await client.updateRelease(42, 'v1.0.0+build.1', 'Notes');
    expect(mockAxiosInstance.put).toHaveBeenCalledWith(
      expect.stringContaining('/releases/'),
      expect.any(Object)
    );
  });
});
