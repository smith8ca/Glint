import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Config } from '../../config';

vi.mock('../../services/claude');
vi.mock('../../services/openaiCompatible');

import { createAiClient, configuredModel } from '../../services/ai';
import { createClaudeClient } from '../../services/claude';
import { createOpenAICompatibleClient } from '../../services/openaiCompatible';

const config: Config = {
  port: 3000,
  gitlabBaseUrl: 'https://gitlab.example.com',
  gitlabToken: 'test-token',
  webhookSecret: 'test-secret',
  aiProvider: 'anthropic',
  anthropicApiKey: 'test-key',
  anthropicModel: 'claude-sonnet-4-6',
  openaiBaseUrl: 'https://api.openai.com/v1',
  maxDiffChars: 20_000,
  gitlabRejectUnauthorized: false,
  logLevel: 'silent',
};

const claudeClient = { summarizeMR: vi.fn(), generateReleaseNotes: vi.fn() };
const openaiClient = { summarizeMR: vi.fn(), generateReleaseNotes: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createClaudeClient).mockReturnValue(claudeClient);
  vi.mocked(createOpenAICompatibleClient).mockReturnValue(openaiClient);
});

describe('createAiClient', () => {
  it('uses Claude for the anthropic provider', () => {
    expect(createAiClient(config)).toBe(claudeClient);
    expect(createOpenAICompatibleClient).not.toHaveBeenCalled();
  });

  it('uses the OpenAI-compatible client for the openai-compatible provider', () => {
    const client = createAiClient({ ...config, aiProvider: 'openai-compatible', openaiModel: 'm' });
    expect(client).toBe(openaiClient);
    expect(createClaudeClient).not.toHaveBeenCalled();
  });
});

describe('configuredModel', () => {
  it('returns the Anthropic model for the anthropic provider', () => {
    expect(configuredModel(config)).toBe('claude-sonnet-4-6');
  });

  it('returns the OpenAI-compatible model for that provider', () => {
    expect(
      configuredModel({ ...config, aiProvider: 'openai-compatible', openaiModel: 'llama3.2' })
    ).toBe('llama3.2');
  });

  it('marks a missing model rather than returning undefined', () => {
    expect(configuredModel({ ...config, aiProvider: 'openai-compatible' })).toBe('(unset)');
  });
});
