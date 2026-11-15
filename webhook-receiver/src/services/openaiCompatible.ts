import axios from 'axios';
import { Config } from '../config';
import type { AiClient } from './ai';
import { buildMRSummaryPrompt, buildReleaseNotesPrompt } from './prompts';

/** Local models can be slow, especially on the first request while they load. */
const REQUEST_TIMEOUT_MS = 5 * 60 * 1000;

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: unknown } }>;
}

/**
 * Client for any server that implements the OpenAI Chat Completions API:
 * OpenAI itself, Ollama, LM Studio, vLLM, OpenRouter, Gemini's OpenAI-compatible
 * endpoint and others. Only `POST {base}/chat/completions` with a single user
 * message is used, which every one of them supports.
 *
 * No output-token limit is sent: the parameter's name differs between servers
 * and model generations (`max_tokens` vs `max_completion_tokens`), and the
 * prompts already ask for concise output.
 */
export function createOpenAICompatibleClient(config: Config): AiClient {
  const http = axios.create({
    baseURL: config.openaiBaseUrl,
    timeout: REQUEST_TIMEOUT_MS,
    // Ollama and other local servers need no key; send the header only when one is set.
    headers: config.openaiApiKey ? { Authorization: `Bearer ${config.openaiApiKey}` } : {},
  });

  async function complete(prompt: string): Promise<string> {
    const { data } = await http.post<ChatCompletionResponse>('/chat/completions', {
      model: config.openaiModel,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
    });

    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.trim() === '') {
      throw new Error('Unexpected response structure from the OpenAI-compatible API');
    }
    return content;
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
