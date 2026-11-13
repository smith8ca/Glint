import fs from 'node:fs';

export interface Config {
  port: number;
  gitlabBaseUrl: string;
  gitlabToken: string;
  webhookSecret?: string;
  webhookSigningToken?: string;
  anthropicApiKey: string;
  anthropicModel: string;
  gitlabRejectUnauthorized: boolean;
  /** PEM certificate(s) to trust for GitLab connections, read from GITLAB_CA_FILE. */
  gitlabCaCertificate?: string;
}

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

export function loadConfig(): Config {
  const webhookSecret = process.env['WEBHOOK_SECRET'];
  const webhookSigningToken = process.env['WEBHOOK_SIGNING_TOKEN'];
  if (!webhookSecret && !webhookSigningToken) {
    throw new Error('At least one of WEBHOOK_SECRET or WEBHOOK_SIGNING_TOKEN must be set');
  }

  return {
    port: Number.parseInt(process.env['PORT'] ?? '3000', 10),
    gitlabBaseUrl: requireEnv('GITLAB_BASE_URL'),
    gitlabToken: requireEnv('GITLAB_TOKEN'),
    webhookSecret,
    webhookSigningToken,
    anthropicApiKey: requireEnv('ANTHROPIC_API_KEY'),
    anthropicModel: process.env['ANTHROPIC_MODEL'] ?? 'claude-sonnet-4-6',
    gitlabRejectUnauthorized: process.env['GITLAB_REJECT_UNAUTHORIZED'] !== 'false',
    gitlabCaCertificate: loadGitlabCaCertificate(),
  };
}
