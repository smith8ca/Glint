import fs from 'node:fs';
import { LOG_LEVELS, LogLevel } from './logger';

export interface Config {
  port: number;
  gitlabBaseUrl: string;
  gitlabToken: string;
  webhookSecret?: string;
  webhookSigningToken?: string;
  /** Which AI service writes the summaries, from AI_PROVIDER (default `anthropic`). */
  aiProvider: AiProvider;
  /** Required when aiProvider is `anthropic`. */
  anthropicApiKey?: string;
  anthropicModel: string;
  /** Base URL of an OpenAI-compatible API, including any `/v1` path, without a trailing slash. */
  openaiBaseUrl: string;
  /** Optional: local servers such as Ollama need no key. */
  openaiApiKey?: string;
  /** Required when aiProvider is `openai-compatible`. */
  openaiModel?: string;
  /** Maximum characters of diff sent to the model, from MAX_DIFF_CHARS. */
  maxDiffChars: number;
  gitlabRejectUnauthorized: boolean;
  /** PEM certificate(s) to trust for GitLab connections, read from GITLAB_CA_FILE. */
  gitlabCaCertificate?: string;
  /** Minimum level written to the log, from LOG_LEVEL (default `info`). */
  logLevel: LogLevel;
}

export const AI_PROVIDERS = ['anthropic', 'openai-compatible'] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export const DEFAULT_MAX_DIFF_CHARS = 20_000;
const MIN_MAX_DIFF_CHARS = 1_000;
const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';

const PEM_CERTIFICATE_HEADER = '-----BEGIN CERTIFICATE-----';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

/** Read the CA bundle named by GITLAB_CA_FILE, failing at startup rather than on the first request. */
function loadGitlabCaCertificate(): string | undefined {
  const caFile = process.env['GITLAB_CA_FILE'];
  if (!caFile) return undefined;

  let pem: string;
  try {
    pem = fs.readFileSync(caFile, 'utf8');
  } catch (err) {
    // Prefer the short errno code (e.g. ENOENT); the full message repeats the path.
    const reason = (err as NodeJS.ErrnoException).code ?? String(err);
    throw new Error(`GITLAB_CA_FILE: cannot read "${caFile}": ${reason}`);
  }

  if (!pem.includes(PEM_CERTIFICATE_HEADER)) {
    throw new Error(`GITLAB_CA_FILE: "${caFile}" does not contain a PEM certificate`);
  }
  return pem;
}

function loadLogLevel(): LogLevel {
  const value = (process.env['LOG_LEVEL'] ?? 'info').trim().toLowerCase();
  if (!(LOG_LEVELS as readonly string[]).includes(value)) {
    throw new Error(`LOG_LEVEL must be one of ${LOG_LEVELS.join(', ')} (got "${value}")`);
  }
  return value as LogLevel;
}

function loadAiProvider(): AiProvider {
  const value = (process.env['AI_PROVIDER'] ?? 'anthropic').trim().toLowerCase();
  if (!(AI_PROVIDERS as readonly string[]).includes(value)) {
    throw new Error(`AI_PROVIDER must be one of ${AI_PROVIDERS.join(', ')} (got "${value}")`);
  }
  return value as AiProvider;
}

function loadMaxDiffChars(): number {
  const raw = process.env['MAX_DIFF_CHARS'];
  if (!raw) return DEFAULT_MAX_DIFF_CHARS;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < MIN_MAX_DIFF_CHARS) {
    throw new Error(
      `MAX_DIFF_CHARS must be a whole number of at least ${MIN_MAX_DIFF_CHARS} (got "${raw}")`
    );
  }
  return value;
}

/** Validate OPENAI_BASE_URL and drop trailing slashes, so `/chat/completions` can be appended. */
function loadOpenaiBaseUrl(): string {
  const raw = (process.env['OPENAI_BASE_URL'] ?? DEFAULT_OPENAI_BASE_URL).trim();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`OPENAI_BASE_URL is not a valid URL (got "${raw}")`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`OPENAI_BASE_URL must start with http:// or https:// (got "${raw}")`);
  }
  return raw.replace(/\/+$/, '');
}

export function loadConfig(): Config {
  const webhookSecret = process.env['WEBHOOK_SECRET'];
  const webhookSigningToken = process.env['WEBHOOK_SIGNING_TOKEN'];
  if (!webhookSecret && !webhookSigningToken) {
    throw new Error('At least one of WEBHOOK_SECRET or WEBHOOK_SIGNING_TOKEN must be set');
  }

  // Only the selected provider's settings are required.
  const aiProvider = loadAiProvider();
  const anthropicApiKey =
    aiProvider === 'anthropic'
      ? requireEnv('ANTHROPIC_API_KEY')
      : process.env['ANTHROPIC_API_KEY'] || undefined;
  const openaiModel =
    aiProvider === 'openai-compatible'
      ? requireEnv('OPENAI_MODEL')
      : process.env['OPENAI_MODEL'] || undefined;

  return {
    port: Number.parseInt(process.env['PORT'] ?? '3000', 10),
    gitlabBaseUrl: requireEnv('GITLAB_BASE_URL'),
    gitlabToken: requireEnv('GITLAB_TOKEN'),
    webhookSecret,
    webhookSigningToken,
    aiProvider,
    anthropicApiKey,
    anthropicModel: process.env['ANTHROPIC_MODEL'] ?? 'claude-sonnet-4-6',
    openaiBaseUrl: loadOpenaiBaseUrl(),
    openaiApiKey: process.env['OPENAI_API_KEY'] || undefined,
    openaiModel,
    maxDiffChars: loadMaxDiffChars(),
    gitlabRejectUnauthorized: process.env['GITLAB_REJECT_UNAUTHORIZED'] !== 'false',
    gitlabCaCertificate: loadGitlabCaCertificate(),
    logLevel: loadLogLevel(),
  };
}
