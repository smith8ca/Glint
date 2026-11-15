import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import type { Config } from '../config';

const config: Config = {
  port: 3000,
  gitlabBaseUrl: 'https://gitlab.example.com',
  gitlabToken: 'test-token',
  webhookSecret: 'test-secret',
  aiProvider: 'anthropic',
  anthropicApiKey: 'test-key',
  openaiBaseUrl: 'https://api.openai.com/v1',
  maxDiffChars: 20_000,
  anthropicModel: 'claude-sonnet-4-6',
  gitlabRejectUnauthorized: false,
  logLevel: 'silent',
};

describe('createApp', () => {
  it('responds to GET /health with status 200', async () => {
    const app = createApp(config);
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('returns JSON content-type for /health', async () => {
    const app = createApp(config);
    const res = await request(app).get('/health');
    expect(res.headers['content-type']).toMatch(/json/);
  });

  it('returns 404 for unknown routes', async () => {
    const app = createApp(config);
    const res = await request(app).get('/nonexistent');
    expect(res.status).toBe(404);
  });
});
