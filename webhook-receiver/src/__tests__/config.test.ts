import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../config';

// Resolved before the tests replace process.env, which os.tmpdir() depends on.
const TEMP_ROOT = os.tmpdir();

const BASE_ENV = {
  GITLAB_BASE_URL: 'https://gitlab.example.com',
  GITLAB_TOKEN: 'test-token',
  ANTHROPIC_API_KEY: 'test-key',
  WEBHOOK_SECRET: 'test-secret',
};

describe('loadConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...BASE_ENV };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('throws when neither WEBHOOK_SECRET nor WEBHOOK_SIGNING_TOKEN is set', () => {
    delete process.env['WEBHOOK_SECRET'];
    expect(() => loadConfig()).toThrow(
      'At least one of WEBHOOK_SECRET or WEBHOOK_SIGNING_TOKEN must be set'
    );
  });

  it('throws when GITLAB_BASE_URL is missing', () => {
    delete process.env['GITLAB_BASE_URL'];
    expect(() => loadConfig()).toThrow('GITLAB_BASE_URL');
  });

  it('throws when GITLAB_TOKEN is missing', () => {
    delete process.env['GITLAB_TOKEN'];
    expect(() => loadConfig()).toThrow('GITLAB_TOKEN');
  });

  it('throws when ANTHROPIC_API_KEY is missing', () => {
    delete process.env['ANTHROPIC_API_KEY'];
    expect(() => loadConfig()).toThrow('ANTHROPIC_API_KEY');
  });

  it('loads config with WEBHOOK_SECRET', () => {
    const config = loadConfig();
    expect(config.webhookSecret).toBe('test-secret');
    expect(config.webhookSigningToken).toBeUndefined();
  });

  it('loads config with WEBHOOK_SIGNING_TOKEN only', () => {
    delete process.env['WEBHOOK_SECRET'];
    process.env['WEBHOOK_SIGNING_TOKEN'] = 'whsec_abc123';
    const config = loadConfig();
    expect(config.webhookSigningToken).toBe('whsec_abc123');
    expect(config.webhookSecret).toBeUndefined();
  });

  it('accepts both WEBHOOK_SECRET and WEBHOOK_SIGNING_TOKEN simultaneously', () => {
    process.env['WEBHOOK_SIGNING_TOKEN'] = 'whsec_abc';
    const config = loadConfig();
    expect(config.webhookSecret).toBe('test-secret');
    expect(config.webhookSigningToken).toBe('whsec_abc');
  });

  it('defaults PORT to 3000', () => {
    const config = loadConfig();
    expect(config.port).toBe(3000);
  });

  it('parses custom PORT', () => {
    process.env['PORT'] = '8080';
    expect(loadConfig().port).toBe(8080);
  });

  it('defaults anthropicModel to claude-sonnet-4-6', () => {
    expect(loadConfig().anthropicModel).toBe('claude-sonnet-4-6');
  });

  it('uses custom ANTHROPIC_MODEL', () => {
    process.env['ANTHROPIC_MODEL'] = 'claude-haiku-4-5';
    expect(loadConfig().anthropicModel).toBe('claude-haiku-4-5');
  });

  describe('AI_PROVIDER', () => {
    it('defaults to anthropic', () => {
      const config = loadConfig();
      expect(config.aiProvider).toBe('anthropic');
      expect(config.openaiBaseUrl).toBe('https://api.openai.com/v1');
      expect(config.openaiModel).toBeUndefined();
      expect(config.openaiApiKey).toBeUndefined();
    });

    it('throws for an unknown provider', () => {
      process.env['AI_PROVIDER'] = 'gemini';
      expect(() => loadConfig()).toThrow('AI_PROVIDER must be one of');
    });

    it('needs OPENAI_MODEL but no Anthropic key for openai-compatible', () => {
      process.env['AI_PROVIDER'] = 'OpenAI-Compatible';
      delete process.env['ANTHROPIC_API_KEY'];
      expect(() => loadConfig()).toThrow('Missing required environment variable: OPENAI_MODEL');

      process.env['OPENAI_MODEL'] = 'llama3.2';
      const config = loadConfig();
      expect(config.aiProvider).toBe('openai-compatible');
      expect(config.openaiModel).toBe('llama3.2');
      expect(config.anthropicApiKey).toBeUndefined();
    });

    it('reads the OpenAI-compatible settings and trims trailing slashes from the URL', () => {
      process.env['AI_PROVIDER'] = 'openai-compatible';
      process.env['OPENAI_MODEL'] = 'llama3.2';
      process.env['OPENAI_BASE_URL'] = 'http://localhost:11434/v1//';
      process.env['OPENAI_API_KEY'] = 'test-openai-key';
      const config = loadConfig();
      expect(config.openaiBaseUrl).toBe('http://localhost:11434/v1');
      expect(config.openaiApiKey).toBe('test-openai-key');
    });

    it.each([['not a url'], ['ftp://example.com/v1']])(
      'throws for OPENAI_BASE_URL "%s"',
      (value) => {
        process.env['OPENAI_BASE_URL'] = value;
        expect(() => loadConfig()).toThrow('OPENAI_BASE_URL');
      }
    );
  });

  describe('MAX_DIFF_CHARS', () => {
    it('defaults to 20000', () => {
      expect(loadConfig().maxDiffChars).toBe(20_000);
    });

    it('accepts a custom value', () => {
      process.env['MAX_DIFF_CHARS'] = '6000';
      expect(loadConfig().maxDiffChars).toBe(6000);
    });

    it.each([['abc'], ['999'], ['1500.5'], ['-5']])('throws for "%s"', (value) => {
      process.env['MAX_DIFF_CHARS'] = value;
      expect(() => loadConfig()).toThrow('MAX_DIFF_CHARS must be a whole number');
    });
  });

  describe('LOG_LEVEL', () => {
    it('defaults to info', () => {
      expect(loadConfig().logLevel).toBe('info');
    });

    it('accepts a valid level, ignoring case and surrounding whitespace', () => {
      process.env['LOG_LEVEL'] = ' Debug ';
      expect(loadConfig().logLevel).toBe('debug');
    });

    it('throws for an unknown level', () => {
      process.env['LOG_LEVEL'] = 'verbose';
      expect(() => loadConfig()).toThrow('LOG_LEVEL must be one of');
    });
  });

  it('defaults gitlabRejectUnauthorized to true', () => {
    expect(loadConfig().gitlabRejectUnauthorized).toBe(true);
  });

  it('sets gitlabRejectUnauthorized=false when env is "false"', () => {
    process.env['GITLAB_REJECT_UNAUTHORIZED'] = 'false';
    expect(loadConfig().gitlabRejectUnauthorized).toBe(false);
  });

  it('keeps gitlabRejectUnauthorized=true for non-"false" values', () => {
    process.env['GITLAB_REJECT_UNAUTHORIZED'] = '0';
    expect(loadConfig().gitlabRejectUnauthorized).toBe(true);
  });

  describe('GITLAB_CA_FILE', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(TEMP_ROOT, 'glint-ca-'));
    });

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('leaves gitlabCaCertificate undefined when not set', () => {
      expect(loadConfig().gitlabCaCertificate).toBeUndefined();
    });

    it('reads the PEM certificate from the file', () => {
      const pem = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n';
      const caFile = path.join(tempDir, 'ca.crt');
      fs.writeFileSync(caFile, pem);
      process.env['GITLAB_CA_FILE'] = caFile;
      expect(loadConfig().gitlabCaCertificate).toBe(pem);
    });

    it('throws a clear error when the file cannot be read', () => {
      const caFile = path.join(tempDir, 'missing.crt');
      process.env['GITLAB_CA_FILE'] = caFile;
      expect(() => loadConfig()).toThrow(`GITLAB_CA_FILE: cannot read "${caFile}"`);
    });

    it('throws when the file is not a PEM certificate', () => {
      const caFile = path.join(tempDir, 'ca.der');
      fs.writeFileSync(caFile, 'not a certificate');
      process.env['GITLAB_CA_FILE'] = caFile;
      expect(() => loadConfig()).toThrow('does not contain a PEM certificate');
    });
  });

  it('maps gitlabBaseUrl, gitlabToken, anthropicApiKey correctly', () => {
    const config = loadConfig();
    expect(config.gitlabBaseUrl).toBe('https://gitlab.example.com');
    expect(config.gitlabToken).toBe('test-token');
    expect(config.anthropicApiKey).toBe('test-key');
  });
});
