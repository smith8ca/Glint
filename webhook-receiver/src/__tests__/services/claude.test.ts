import { describe, it, expect, vi, beforeEach } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { createClaudeClient } from '../../services/claude';
import type { Config } from '../../config';
import type { MRDetails, DiffFile, Commit } from '../../services/gitlab';

vi.mock('@anthropic-ai/sdk');

const config: Config = {
  port: 3000,
  gitlabBaseUrl: 'https://gitlab.example.com',
  gitlabToken: 'test-token',
  webhookSecret: 'test-secret',
  anthropicApiKey: 'test-key',
  anthropicModel: 'claude-sonnet-4-6',
  gitlabRejectUnauthorized: false,
};

const mockCreate = vi.fn();

beforeEach(() => {
  vi.mocked(Anthropic).mockImplementation(
    () => ({ messages: { create: mockCreate } }) as unknown as Anthropic
  );
  mockCreate.mockClear();
});

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

describe('summarizeMR', () => {
  it('returns the text from the Claude response', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'Great MR.' }] });
    const client = createClaudeClient(config);
    const result = await client.summarizeMR(MR, [DIFF]);
    expect(result).toBe('Great MR.');
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-sonnet-4-6', max_tokens: 1024 })
    );
  });

  it('includes (new file) label in the prompt', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'Summary.' }] });
    const client = createClaudeClient(config);
    await client.summarizeMR(MR, [{ ...DIFF, new_file: true }]);
    const prompt: string = mockCreate.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain('(new file)');
  });

  it('includes (deleted) label in the prompt', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'Summary.' }] });
    const client = createClaudeClient(config);
    await client.summarizeMR(MR, [{ ...DIFF, deleted_file: true }]);
    const prompt: string = mockCreate.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain('(deleted)');
  });

  it('includes (renamed from …) label in the prompt', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'Summary.' }] });
    const client = createClaudeClient(config);
    await client.summarizeMR(MR, [{ ...DIFF, renamed_file: true, old_path: 'src/old.ts' }]);
    const prompt: string = mockCreate.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain('(renamed from src/old.ts)');
  });

  it('truncates the diff and appends a truncation notice', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'Summary.' }] });
    const client = createClaudeClient(config);
    await client.summarizeMR(MR, [{ ...DIFF, diff: 'x'.repeat(25_000) }]);
    const prompt: string = mockCreate.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain('*(diff truncated due to size)*');
  });

  it('uses singular "file" for exactly 1 diff', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'Summary.' }] });
    const client = createClaudeClient(config);
    await client.summarizeMR(MR, [DIFF]);
    const prompt: string = mockCreate.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain('1 file)');
  });

  it('uses plural "files" for multiple diffs', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'Summary.' }] });
    const client = createClaudeClient(config);
    await client.summarizeMR(MR, [DIFF, DIFF]);
    const prompt: string = mockCreate.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain('2 files)');
  });

  it('throws when the response block is not text type', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'image' }] });
    const client = createClaudeClient(config);
    await expect(client.summarizeMR(MR, [DIFF])).rejects.toThrow('Unexpected response structure');
  });
});

describe('generateReleaseNotes', () => {
  it('returns the text from the Claude response', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'Release notes.' }] });
    const client = createClaudeClient(config);
    const result = await client.generateReleaseNotes('v1.1.0', 'v1.1.0', 'v1.0.0', [COMMIT], [DIFF]);
    expect(result).toBe('Release notes.');
  });

  it('uses "first release" language when prevTagName is null', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'First release.' }] });
    const client = createClaudeClient(config);
    await client.generateReleaseNotes('v1.0.0', 'v1.0.0', null, [COMMIT], []);
    const prompt: string = mockCreate.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain('first release');
  });

  it('uses range description when prevTagName is provided', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'Notes.' }] });
    const client = createClaudeClient(config);
    await client.generateReleaseNotes('v1.1.0', 'v1.1.0', 'v1.0.0', [COMMIT], []);
    const prompt: string = mockCreate.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain('v1.0.0');
    expect(prompt).toContain('v1.1.0');
  });

  it('truncates large diffs and appends a notice', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'Notes.' }] });
    const client = createClaudeClient(config);
    await client.generateReleaseNotes('v1.1.0', 'v1.1.0', 'v1.0.0', [COMMIT], [
      { ...DIFF, diff: 'x'.repeat(25_000) },
    ]);
    const prompt: string = mockCreate.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain('*(diff truncated due to size)*');
  });

  it('truncates long commit lists and appends a notice', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'Notes.' }] });
    const client = createClaudeClient(config);
    const manyCommits: Commit[] = Array.from({ length: 500 }, (_, i) => ({
      ...COMMIT,
      id: `id${i}`,
      short_id: `sh${i}`,
      title: `feat: long commit message that takes up space — number ${i}`.repeat(3),
    }));
    await client.generateReleaseNotes('v1.1.0', 'v1.1.0', 'v1.0.0', manyCommits, []);
    const prompt: string = mockCreate.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain('*(truncated)*');
  });

  it('uses singular "commit" for exactly 1 commit', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'Notes.' }] });
    const client = createClaudeClient(config);
    await client.generateReleaseNotes('v1.0.0', 'v1.0.0', null, [COMMIT], []);
    const prompt: string = mockCreate.mock.calls[0][0].messages[0].content;
    expect(prompt).toMatch(/\b1 commit\b/);
  });

  it('includes (new file) label in the release diff', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'Notes.' }] });
    const client = createClaudeClient(config);
    await client.generateReleaseNotes('v1.1.0', 'v1.1.0', 'v1.0.0', [COMMIT], [
      { ...DIFF, new_file: true },
    ]);
    const prompt: string = mockCreate.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain('(new file)');
  });

  it('includes (deleted) label in the release diff', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'Notes.' }] });
    const client = createClaudeClient(config);
    await client.generateReleaseNotes('v1.1.0', 'v1.1.0', 'v1.0.0', [COMMIT], [
      { ...DIFF, deleted_file: true },
    ]);
    const prompt: string = mockCreate.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain('(deleted)');
  });

  it('shows *(no diff available)* when diffs array is empty', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'Notes.' }] });
    const client = createClaudeClient(config);
    await client.generateReleaseNotes('v1.0.0', 'v1.0.0', null, [COMMIT], []);
    const prompt: string = mockCreate.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain('*(no diff available)*');
  });

  it('throws when the response block is not text type', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'image' }] });
    const client = createClaudeClient(config);
    await expect(
      client.generateReleaseNotes('v1.0.0', 'v1.0.0', null, [COMMIT], [])
    ).rejects.toThrow('Unexpected response structure');
  });
});
