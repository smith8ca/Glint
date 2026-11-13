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
