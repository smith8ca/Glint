import Anthropic from '@anthropic-ai/sdk';
import { Config } from '../config';
import type { AiClient } from './ai';
import { buildMRSummaryPrompt, buildReleaseNotesPrompt } from './prompts';

export function createClaudeClient(config: Config): AiClient {
  const client = new Anthropic({ apiKey: config.anthropicApiKey });

  async function complete(prompt: string): Promise<string> {
    const message = await client.messages.create({
      model: config.anthropicModel,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const block = message.content[0];
    if (block?.type !== 'text') {
      throw new Error('Unexpected response structure from Claude API');
    }
    return block.text;
  }

  return {
    summarizeMR(details, diffs) {
      return complete(buildMRSummaryPrompt(details, diffs, config.maxDiffChars));
    },
    generateReleaseNotes(releaseName, tagName, prevTagName, commits, diffs) {
      return complete(
        buildReleaseNotesPrompt(
          releaseName,
          tagName,
          prevTagName,
          commits,
          diffs,
          config.maxDiffChars
        )
      );
    },
  };
}
