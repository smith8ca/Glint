import { Config } from '../config';
import { MRDetails, DiffFile, Commit } from './gitlab';
import { createClaudeClient } from './claude';
import { createOpenAICompatibleClient } from './openaiCompatible';

/** What the webhook route needs from an AI provider. */
export interface AiClient {
  summarizeMR: (details: MRDetails, diffs: DiffFile[]) => Promise<string>;
  generateReleaseNotes: (
    releaseName: string,
    tagName: string,
    prevTagName: string | null,
    commits: Commit[],
    diffs: DiffFile[]
  ) => Promise<string>;
}

/** Builds the client for the provider selected by AI_PROVIDER. */
export function createAiClient(config: Config): AiClient {
  if (config.aiProvider === 'openai-compatible') {
    return createOpenAICompatibleClient(config);
  }
  return createClaudeClient(config);
}

/** The model the configured provider will use, for logging. */
export function configuredModel(config: Config): string {
  return config.aiProvider === 'openai-compatible'
    ? (config.openaiModel ?? '(unset)')
    : config.anthropicModel;
}
