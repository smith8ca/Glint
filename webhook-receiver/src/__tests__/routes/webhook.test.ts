import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app';
import type { Config } from '../../config';

vi.mock('../../services/gitlab');
vi.mock('../../services/claude');

import { createGitlabClient } from '../../services/gitlab';
import { createClaudeClient } from '../../services/claude';

const config: Config = {
  port: 3000,
  gitlabBaseUrl: 'https://gitlab.example.com',
  gitlabToken: 'test-token',
  webhookSecret: 'test-secret',
  anthropicApiKey: 'test-key',
  anthropicModel: 'claude-sonnet-4-6',
  gitlabRejectUnauthorized: false,
};

const mockGitlab = {
  getMRDetails: vi.fn(),
  getMRDiffs: vi.fn(),
  postMRNote: vi.fn(),
  getReleases: vi.fn(),
  compareRefs: vi.fn(),
  getTagCommits: vi.fn(),
  updateRelease: vi.fn(),
};

const mockClaude = {
  summarizeMR: vi.fn(),
  generateReleaseNotes: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createGitlabClient).mockReturnValue(mockGitlab as ReturnType<typeof createGitlabClient>);
  vi.mocked(createClaudeClient).mockReturnValue(mockClaude as ReturnType<typeof createClaudeClient>);
});

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

const AUTH = { 'X-Gitlab-Token': 'test-secret', 'Content-Type': 'application/json' };
const MR_EVENT = { ...AUTH, 'X-Gitlab-Event': 'Merge Request Hook' };
const REL_EVENT = { ...AUTH, 'X-Gitlab-Event': 'Release Hook' };

const MR_PAYLOAD = {
  object_kind: 'merge_request',
  project: { id: 1 },
  object_attributes: { iid: 42, action: 'open' },
};

const RELEASE_PAYLOAD = {
  object_kind: 'release',
  project: { id: 1 },
  tag: 'v1.0.0',
  name: 'Release v1.0.0',
  action: 'create',
};

describe('POST /webhook — auth', () => {
  it('returns 401 with no token', async () => {
    const app = createApp(config);
    const res = await request(app).post('/webhook').set('Content-Type', 'application/json').send(MR_PAYLOAD);
    expect(res.status).toBe(401);
  });

  it('returns 401 with wrong token', async () => {
    const app = createApp(config);
    const res = await request(app)
      .post('/webhook')
      .set({ ...AUTH, 'X-Gitlab-Token': 'wrong' })
      .send(MR_PAYLOAD);
    expect(res.status).toBe(401);
  });
});

describe('POST /webhook — unknown event', () => {
  it('returns 200 and ignores unknown events', async () => {
    const app = createApp(config);
    const res = await request(app)
      .post('/webhook')
      .set({ ...AUTH, 'X-Gitlab-Event': 'Push Hook' })
      .send({ object_kind: 'push' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/Ignored/);
  });
});

describe('POST /webhook — Merge Request Hook', () => {
  it('returns 200 for wrong object_kind', async () => {
    const app = createApp(config);
    const res = await request(app)
      .post('/webhook')
      .set(MR_EVENT)
      .send({ ...MR_PAYLOAD, object_kind: 'note' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/Ignored/);
  });

  it('returns 200 for unhandled action (close)', async () => {
    const app = createApp(config);
    const res = await request(app)
      .post('/webhook')
      .set(MR_EVENT)
      .send({ ...MR_PAYLOAD, object_attributes: { iid: 42, action: 'close' } });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/Ignored/);
  });

  it('returns 202 for MR open and triggers async processing', async () => {
    mockGitlab.getMRDetails.mockResolvedValue({
      iid: 42, title: 'Test MR', description: null,
      source_branch: 'feat', target_branch: 'main',
      author: { name: 'Alice', username: 'alice' }, web_url: '',
    });
    mockGitlab.getMRDiffs.mockResolvedValue([]);
    mockClaude.summarizeMR.mockResolvedValue('Great summary!');
    mockGitlab.postMRNote.mockResolvedValue(undefined);

    const app = createApp(config);
    const res = await request(app).post('/webhook').set(MR_EVENT).send(MR_PAYLOAD);
    expect(res.status).toBe(202);

    await flushPromises();
    expect(mockGitlab.getMRDetails).toHaveBeenCalledWith(1, 42);
    expect(mockGitlab.getMRDiffs).toHaveBeenCalledWith(1, 42);
    expect(mockClaude.summarizeMR).toHaveBeenCalled();
    expect(mockGitlab.postMRNote).toHaveBeenCalledWith(1, 42, expect.stringContaining('Great summary!'));
  });

  it('returns 202 for MR reopen', async () => {
    mockGitlab.getMRDetails.mockResolvedValue({ iid: 42, title: 'T', description: null, source_branch: 'f', target_branch: 'main', author: { name: 'A', username: 'a' }, web_url: '' });
    mockGitlab.getMRDiffs.mockResolvedValue([]);
    mockClaude.summarizeMR.mockResolvedValue('Summary.');
    mockGitlab.postMRNote.mockResolvedValue(undefined);

    const app = createApp(config);
    const res = await request(app)
      .post('/webhook')
      .set(MR_EVENT)
      .send({ ...MR_PAYLOAD, object_attributes: { iid: 42, action: 'reopen' } });
    expect(res.status).toBe(202);
  });

  it('logs error when async MR processing fails', async () => {
    mockGitlab.getMRDetails.mockRejectedValue(new Error('GitLab down'));
    mockGitlab.getMRDiffs.mockResolvedValue([]);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const app = createApp(config);
    await request(app).post('/webhook').set(MR_EVENT).send(MR_PAYLOAD);
    await flushPromises();

    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('POST /webhook — Release Hook', () => {
  it('returns 200 for wrong object_kind', async () => {
    const app = createApp(config);
    const res = await request(app)
      .post('/webhook')
      .set(REL_EVENT)
      .send({ ...RELEASE_PAYLOAD, object_kind: 'tag_push' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/Ignored/);
  });

  it('returns 200 for non-create release action', async () => {
    const app = createApp(config);
    const res = await request(app)
      .post('/webhook')
      .set(REL_EVENT)
      .send({ ...RELEASE_PAYLOAD, action: 'update' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/Ignored/);
  });

  it('returns 202 and processes with compareRefs when a previous release exists', async () => {
    mockGitlab.getReleases.mockResolvedValue([{ tag_name: 'v1.0.0' }, { tag_name: 'v0.9.0' }]);
    mockGitlab.compareRefs.mockResolvedValue({ commits: [], diffs: [] });
    mockClaude.generateReleaseNotes.mockResolvedValue('Release notes!');
    mockGitlab.updateRelease.mockResolvedValue(undefined);

    const app = createApp(config);
    const res = await request(app).post('/webhook').set(REL_EVENT).send(RELEASE_PAYLOAD);
    expect(res.status).toBe(202);

    await flushPromises();
    expect(mockGitlab.getReleases).toHaveBeenCalledWith(1);
    expect(mockGitlab.compareRefs).toHaveBeenCalledWith(1, 'v0.9.0', 'v1.0.0');
    expect(mockGitlab.updateRelease).toHaveBeenCalledWith(
      1, 'v1.0.0', expect.stringContaining('Release notes!')
    );
  });

  it('uses getTagCommits for the first release (no previous tag)', async () => {
    mockGitlab.getReleases.mockResolvedValue([{ tag_name: 'v1.0.0' }]);
    mockGitlab.getTagCommits.mockResolvedValue([]);
    mockClaude.generateReleaseNotes.mockResolvedValue('First release!');
    mockGitlab.updateRelease.mockResolvedValue(undefined);

    const app = createApp(config);
    const res = await request(app).post('/webhook').set(REL_EVENT).send(RELEASE_PAYLOAD);
    expect(res.status).toBe(202);

    await flushPromises();
    expect(mockGitlab.getTagCommits).toHaveBeenCalledWith(1, 'v1.0.0');
    expect(mockGitlab.compareRefs).not.toHaveBeenCalled();
  });

  it('uses getTagCommits when tag is not found in releases list (index -1)', async () => {
    mockGitlab.getReleases.mockResolvedValue([{ tag_name: 'v0.9.0' }]);
    mockGitlab.getTagCommits.mockResolvedValue([]);
    mockClaude.generateReleaseNotes.mockResolvedValue('Notes.');
    mockGitlab.updateRelease.mockResolvedValue(undefined);

    const app = createApp(config);
    await request(app).post('/webhook').set(REL_EVENT).send(RELEASE_PAYLOAD);
    await flushPromises();

    expect(mockGitlab.getTagCommits).toHaveBeenCalledWith(1, 'v1.0.0');
  });

  it('logs error when async release processing fails', async () => {
    mockGitlab.getReleases.mockRejectedValue(new Error('API error'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const app = createApp(config);
    await request(app).post('/webhook').set(REL_EVENT).send(RELEASE_PAYLOAD);
    await flushPromises();

    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('POST /webhook — payload validation', () => {
  it.each([
    ['string project id', { ...MR_PAYLOAD, project: { id: '1/../2' } }],
    ['zero project id', { ...MR_PAYLOAD, project: { id: 0 } }],
    ['missing project', { object_kind: 'merge_request', object_attributes: { iid: 42, action: 'open' } }],
    ['negative iid', { ...MR_PAYLOAD, object_attributes: { iid: -1, action: 'open' } }],
    ['fractional iid', { ...MR_PAYLOAD, object_attributes: { iid: 4.2, action: 'open' } }],
    ['missing object_attributes', { object_kind: 'merge_request', project: { id: 1 } }],
  ])('returns 400 for an MR payload with %s', async (_label, payload) => {
    const app = createApp(config);
    const res = await request(app).post('/webhook').set(MR_EVENT).send(payload);
    expect(res.status).toBe(400);
    await flushPromises();
    expect(mockGitlab.getMRDetails).not.toHaveBeenCalled();
  });

  it.each([
    ['string project id', { ...RELEASE_PAYLOAD, project: { id: 'abc' } }],
    ['missing tag', { ...RELEASE_PAYLOAD, tag: undefined }],
    ['empty tag', { ...RELEASE_PAYLOAD, tag: '' }],
    ['tag with whitespace', { ...RELEASE_PAYLOAD, tag: 'v1 0' }],
    ['tag with a newline', { ...RELEASE_PAYLOAD, tag: 'v1\nInjected' }],
    ['tag with a non-whitespace control character', { ...RELEASE_PAYLOAD, tag: 'v1\u0001' }],
    ['tag with a DEL character', { ...RELEASE_PAYLOAD, tag: 'v1\u007f' }],
    ['tag longer than 255 characters', { ...RELEASE_PAYLOAD, tag: 'v'.repeat(256) }],
  ])('returns 400 for a release payload with %s', async (_label, payload) => {
    const app = createApp(config);
    const res = await request(app).post('/webhook').set(REL_EVENT).send(payload);
    expect(res.status).toBe(400);
    await flushPromises();
    expect(mockGitlab.getReleases).not.toHaveBeenCalled();
  });

  it('falls back to the tag name when the release name is missing', async () => {
    mockGitlab.getReleases.mockResolvedValue([{ tag_name: 'v1.0.0' }]);
    mockGitlab.getTagCommits.mockResolvedValue([]);
    mockClaude.generateReleaseNotes.mockResolvedValue('Notes.');
    mockGitlab.updateRelease.mockResolvedValue(undefined);

    const app = createApp(config);
    await request(app).post('/webhook').set(REL_EVENT).send({ ...RELEASE_PAYLOAD, name: null });
    await flushPromises();

    expect(mockClaude.generateReleaseNotes).toHaveBeenCalledWith('v1.0.0', 'v1.0.0', null, [], []);
  });
});

describe('POST /webhook — error logging', () => {
  it('does not log the GitLab token when an API call fails', async () => {
    const { AxiosError, AxiosHeaders } = await import('axios');
    const axiosConfig = {
      method: 'get',
      url: '/api/v4/projects/1/merge_requests/42',
      headers: new AxiosHeaders({ 'PRIVATE-TOKEN': 'test-token' }),
    };
    mockGitlab.getMRDetails.mockRejectedValue(
      new AxiosError('Request failed', 'ERR_BAD_RESPONSE', axiosConfig, {}, {
        status: 500, statusText: 'Error', headers: {}, config: axiosConfig, data: {},
      })
    );
    mockGitlab.getMRDiffs.mockResolvedValue([]);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const app = createApp(config);
    await request(app).post('/webhook').set(MR_EVENT).send(MR_PAYLOAD);
    await flushPromises();

    expect(spy).toHaveBeenCalledOnce();
    const logged = spy.mock.calls.flat().map(String).join(' ');
    expect(logged).toContain('failed with status 500');
    expect(logged).not.toContain('test-token');
    spy.mockRestore();
  });
});
