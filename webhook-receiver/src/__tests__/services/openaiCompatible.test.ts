import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { createOpenAICompatibleClient } from '../../services/openaiCompatible';
import type { Config } from '../../config';
import type { MRDetails, DiffFile, Commit } from '../../services/gitlab';

vi.mock('axios');

const mockPost = vi.fn();

const config: Config = {
  port: 3000,
  gitlabBaseUrl: 'https://gitlab.example.com',
  gitlabToken: 'test-token',
  webhookSecret: 'test-secret',
  aiProvider: 'openai-compatible',
  anthropicModel: 'claude-sonnet-4-6',
  openaiBaseUrl: 'http://ollama.example.com:11434/v1',
  openaiModel: 'test-model',
  maxDiffChars: 20_000,
  gitlabRejectUnauthorized: false,
  logLevel: 'silent',
};

const MR: MRDetails = {
  iid: 1,
  title: 'Add new feature',
  description: 'Adds a great feature',
  state: 'opened',
  source_branch: 'feature/foo',
  target_branch: 'main',
  author: { name: 'Alice', username: 'alice' },
  web_url: 'https://gitlab.example.com/-/merge_requests/1',
};

const DIFF: DiffFile = {
  old_path: 'src/foo.ts',
  new_path: 'src/foo.ts',
  diff: '@@ -1 +1 @@\n-old\n+new',
  new_file: false,
  deleted_file: false,
  renamed_file: false,
};

const COMMIT: Commit = {
  id: 'abc123',
  short_id: 'abc',
  title: 'feat: add something',
  message: 'feat: add something',
  author_name: 'Alice',
};

function reply(content: unknown) {
  return { data: { choices: [{ message: { role: 'assistant', content } }] } };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(axios.create).mockReturnValue({ post: mockPost } as unknown as ReturnType<
    typeof axios.create
  >);
});

describe('createOpenAICompatibleClient', () => {
  it('uses the configured base URL and sends no Authorization header without a key', () => {
    createOpenAICompatibleClient(config);
    expect(axios.create).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: 'http://ollama.example.com:11434/v1', headers: {} })
    );
  });

  it('sends the API key as a bearer token when one is configured', () => {
    createOpenAICompatibleClient({ ...config, openaiApiKey: 'test-openai-key' });
    expect(axios.create).toHaveBeenCalledWith(
      expect.objectContaining({ headers: { Authorization: 'Bearer test-openai-key' } })
    );
  });

  it('sets a request timeout so a stalled server cannot hang processing forever', () => {
    createOpenAICompatibleClient(config);
    const { timeout } = vi.mocked(axios.create).mock.calls[0][0] as { timeout: number };
    expect(timeout).toBeGreaterThan(0);
  });
});

describe('summarizeMR', () => {
  it('posts one user message to /chat/completions and returns the reply text', async () => {
    mockPost.mockResolvedValue(reply('Great MR.'));
    const client = createOpenAICompatibleClient(config);

    await expect(client.summarizeMR(MR, [DIFF])).resolves.toBe('Great MR.');

    expect(mockPost).toHaveBeenCalledOnce();
    const [path, body] = mockPost.mock.calls[0];
    expect(path).toBe('/chat/completions');
    expect(body.model).toBe('test-model');
    expect(body.stream).toBe(false);
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].role).toBe('user');
    expect(body.messages[0].content).toContain('Add new feature');
    expect(body.messages[0].content).toContain('1 file)');
  });

  it('sends no output-token limit, whose name differs between servers', async () => {
    mockPost.mockResolvedValue(reply('Summary.'));
    await createOpenAICompatibleClient(config).summarizeMR(MR, [DIFF]);
    const body = mockPost.mock.calls[0][1];
    expect(body).not.toHaveProperty('max_tokens');
    expect(body).not.toHaveProperty('max_completion_tokens');
  });

  it('truncates the diff at the configured MAX_DIFF_CHARS', async () => {
    mockPost.mockResolvedValue(reply('Summary.'));
    const client = createOpenAICompatibleClient({ ...config, maxDiffChars: 2_000 });
    await client.summarizeMR(MR, [{ ...DIFF, diff: 'x'.repeat(5_000) }]);
    const prompt: string = mockPost.mock.calls[0][1].messages[0].content;
    expect(prompt).toContain('*(diff truncated due to size)*');
    expect(prompt.length).toBeLessThan(4_000);
  });

  it.each([
    ['no choices', { data: { choices: [] } }],
    ['a missing body', { data: undefined }],
    ['empty content', reply('   ')],
    ['non-text content', reply([{ type: 'text', text: 'hi' }])],
    ['null content', reply(null)],
  ])('throws for a response with %s', async (_label, response) => {
    mockPost.mockResolvedValue(response);
    const client = createOpenAICompatibleClient(config);
    await expect(client.summarizeMR(MR, [DIFF])).rejects.toThrow('Unexpected response structure');
  });

  it('propagates request failures to the caller', async () => {
    mockPost.mockRejectedValue(new Error('connect ECONNREFUSED'));
    const client = createOpenAICompatibleClient(config);
    await expect(client.summarizeMR(MR, [DIFF])).rejects.toThrow('ECONNREFUSED');
  });
});

describe('generateReleaseNotes', () => {
  it('posts the release prompt and returns the reply text', async () => {
    mockPost.mockResolvedValue(reply('Release notes.'));
    const client = createOpenAICompatibleClient(config);

    await expect(
      client.generateReleaseNotes('Release 1.1', 'v1.1.0', 'v1.0.0', [COMMIT], [DIFF])
    ).resolves.toBe('Release notes.');

    const prompt: string = mockPost.mock.calls[0][1].messages[0].content;
    expect(prompt).toContain('Release 1.1');
    expect(prompt).toContain('v1.0.0');
    expect(prompt).toContain('abc feat: add something (Alice)');
  });

  it('uses "first release" wording when there is no previous tag', async () => {
    mockPost.mockResolvedValue(reply('First.'));
    const client = createOpenAICompatibleClient(config);
    await client.generateReleaseNotes('v1.0.0', 'v1.0.0', null, [COMMIT], []);
    const prompt: string = mockPost.mock.calls[0][1].messages[0].content;
    expect(prompt).toContain('first release');
    expect(prompt).toContain('*(no diff available)*');
  });
});
