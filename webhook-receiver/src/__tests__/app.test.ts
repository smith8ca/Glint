import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import type { Request, Response } from 'express';
import { createApp, errorHandler } from '../app';
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
    expect(res.body).toEqual({ error: 'Not Found' });
  });
});

describe('error responses', () => {
  const post = (app: ReturnType<typeof createApp>) =>
    request(app).post('/webhook').set('Content-Type', 'application/json');

  it('answers malformed JSON with a JSON 400 and no stack trace', async () => {
    const res = await post(createApp(config)).send('{oops');
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body).toEqual({ error: 'Bad Request: invalid JSON body' });
    expect(res.text).not.toMatch(/SyntaxError|at JSON\.parse|node_modules|\.[jt]s:\d+/);
  });

  it('rejects malformed JSON before authentication without leaking details', async () => {
    // No X-Gitlab-Token: the body parser fails first, so this must stay generic.
    const res = await post(createApp(config)).send('[1,');
    expect(res.status).toBe(400);
    expect(res.text).not.toContain('<html');
  });

  it('answers an oversized body with a JSON 413', async () => {
    const res = await post(createApp(config)).send(JSON.stringify({ pad: 'x'.repeat(200_000) }));
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: 'Payload Too Large' });
  });

  function fakeResponse(headersSent = false) {
    const res = { headersSent, status: vi.fn(), json: vi.fn() };
    res.status.mockReturnValue(res);
    return res;
  }
  const req = { path: '/webhook', ip: '127.0.0.1' } as Request;

  it('answers an unexpected error with a generic JSON 500', () => {
    const res = fakeResponse();
    const next = vi.fn();
    errorHandler(new Error('secret internal detail'), req, res as unknown as Response, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal Server Error' });
    expect(next).not.toHaveBeenCalled();
  });

  it('treats a non-4xx status on the error as a 500', () => {
    const res = fakeResponse();
    errorHandler({ status: 302 }, req, res as unknown as Response, vi.fn());
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('passes other client errors through with their standard label', () => {
    const res = fakeResponse();
    errorHandler({ status: 415, type: 'charset.unsupported' }, req, res as unknown as Response, vi.fn());
    expect(res.status).toHaveBeenCalledWith(415);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unsupported Media Type' });
  });

  it('defers to Express when the response has already started', () => {
    const res = fakeResponse(true);
    const next = vi.fn();
    const err = new Error('late');
    errorHandler(err, req, res as unknown as Response, next);
    expect(next).toHaveBeenCalledWith(err);
    expect(res.status).not.toHaveBeenCalled();
  });
});
