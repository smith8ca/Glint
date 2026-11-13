import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { createHmac } from 'node:crypto';
import { validateSecret } from '../../middleware/validateSecret';
import type { Config } from '../../config';

const RAW_KEY = Buffer.from('test-signing-key-32-bytes-exactly').toString('base64');
const SIGNING_TOKEN = `whsec_${RAW_KEY}`;

const BASE_CONFIG: Config = {
  port: 3000,
  gitlabBaseUrl: 'https://gitlab.example.com',
  gitlabToken: 'test-token',
  webhookSecret: 'test-secret',
  anthropicApiKey: 'test-key',
  anthropicModel: 'claude-sonnet-4-6',
  gitlabRejectUnauthorized: false,
};

function makeReq(overrides: Record<string, unknown> = {}): Request {
  return { headers: {}, ...overrides } as unknown as Request;
}

function makeRes(): Response {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
}

function makeNext(): NextFunction {
  return vi.fn() as unknown as NextFunction;
}

function buildSignature(token: string, id: string, tsSec: number, body: string): string {
  const key = token.startsWith('whsec_')
    ? Buffer.from(token.slice('whsec_'.length), 'base64')
    : Buffer.from(token, 'base64');
  const sig = createHmac('sha256', key).update(`${id}.${tsSec}.${body}`).digest('base64');
  return `v1,${sig}`;
}

describe('validateSecret', () => {
  describe('legacy X-Gitlab-Token mode', () => {
    const config: Config = { ...BASE_CONFIG, webhookSigningToken: undefined };

    it('calls next() when token matches', () => {
      const req = makeReq({ headers: { 'x-gitlab-token': 'test-secret' } });
      const res = makeRes();
      const next = makeNext();
      validateSecret(config)(req, res, next);
      expect(next).toHaveBeenCalledOnce();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('returns 401 when token does not match', () => {
      const req = makeReq({ headers: { 'x-gitlab-token': 'wrong-token' } });
      const res = makeRes();
      const next = makeNext();
      validateSecret(config)(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 when token header is absent', () => {
      const req = makeReq({ headers: {} });
      const res = makeRes();
      const next = makeNext();
      validateSecret(config)(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 when token is a prefix of the secret', () => {
      const req = makeReq({ headers: { 'x-gitlab-token': 'test-' } });
      const res = makeRes();
      const next = makeNext();
      validateSecret(config)(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 when the token header is repeated (array value)', () => {
      const req = makeReq({ headers: { 'x-gitlab-token': ['test-secret', 'test-secret'] } });
      const res = makeRes();
      const next = makeNext();
      validateSecret(config)(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 when no secret is configured', () => {
      const req = makeReq({ headers: { 'x-gitlab-token': '' } });
      const res = makeRes();
      const next = makeNext();
      validateSecret({ ...config, webhookSecret: undefined })(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('HMAC signing token mode', () => {
    const config: Config = {
      ...BASE_CONFIG,
      webhookSigningToken: SIGNING_TOKEN,
      webhookSecret: undefined,
    };
    const BODY = '{"event":"test"}';
    const MSG_ID = 'msg_abc123';

    function validHeaders(body = BODY, offsetSec = 0): Record<string, string> {
      const ts = Math.floor(Date.now() / 1000) + offsetSec;
      return {
        'webhook-id': MSG_ID,
        'webhook-timestamp': String(ts),
        'webhook-signature': buildSignature(SIGNING_TOKEN, MSG_ID, ts, body),
      };
    }

    it('calls next() with a valid signature', () => {
      const req = makeReq({ headers: validHeaders(), rawBody: Buffer.from(BODY) });
      const res = makeRes();
      const next = makeNext();
      validateSecret(config)(req, res, next);
      expect(next).toHaveBeenCalledOnce();
    });

    it('returns 401 for a tampered signature', () => {
      const headers = { ...validHeaders(), 'webhook-signature': 'v1,invalidsig==' };
      const req = makeReq({ headers, rawBody: Buffer.from(BODY) });
      const res = makeRes();
      const next = makeNext();
      validateSecret(config)(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 when timestamp is older than 5 minutes', () => {
      const headers = validHeaders(BODY, -400);
      const req = makeReq({ headers, rawBody: Buffer.from(BODY) });
      const res = makeRes();
      const next = makeNext();
      validateSecret(config)(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns 401 when webhook-id is missing', () => {
      const headers = validHeaders();
      delete headers['webhook-id'];
      const req = makeReq({ headers, rawBody: Buffer.from(BODY) });
      const res = makeRes();
      const next = makeNext();
      validateSecret(config)(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns 401 when webhook-timestamp is missing', () => {
      const headers = validHeaders();
      delete headers['webhook-timestamp'];
      const req = makeReq({ headers, rawBody: Buffer.from(BODY) });
      const res = makeRes();
      const next = makeNext();
      validateSecret(config)(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns 401 when webhook-signature is missing', () => {
      const headers = validHeaders();
      delete headers['webhook-signature'];
      const req = makeReq({ headers, rawBody: Buffer.from(BODY) });
      const res = makeRes();
      const next = makeNext();
      validateSecret(config)(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns 401 when rawBody is absent', () => {
      const req = makeReq({ headers: validHeaders() });
      const res = makeRes();
      const next = makeNext();
      validateSecret(config)(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('accepts a token without the whsec_ prefix', () => {
      const plainToken = RAW_KEY;
      const plainConfig: Config = { ...config, webhookSigningToken: plainToken };
      const ts = Math.floor(Date.now() / 1000);
      const headers = {
        'webhook-id': MSG_ID,
        'webhook-timestamp': String(ts),
        'webhook-signature': buildSignature(plainToken, MSG_ID, ts, BODY),
      };
      const req = makeReq({ headers, rawBody: Buffer.from(BODY) });
      const res = makeRes();
      const next = makeNext();
      validateSecret(plainConfig)(req, res, next);
      expect(next).toHaveBeenCalledOnce();
    });

    it('accepts when the valid sig is second in a space-separated list', () => {
      const ts = Math.floor(Date.now() / 1000);
      const validSig = buildSignature(SIGNING_TOKEN, MSG_ID, ts, BODY);
      const headers = {
        'webhook-id': MSG_ID,
        'webhook-timestamp': String(ts),
        'webhook-signature': `v1,badsig== ${validSig}`,
      };
      const req = makeReq({ headers, rawBody: Buffer.from(BODY) });
      const res = makeRes();
      const next = makeNext();
      validateSecret(config)(req, res, next);
      expect(next).toHaveBeenCalledOnce();
    });

    it('returns 401 when signature has wrong version prefix', () => {
      const ts = Math.floor(Date.now() / 1000);
      const sig = buildSignature(SIGNING_TOKEN, MSG_ID, ts, BODY).replace('v1,', 'v2,');
      const headers = { 'webhook-id': MSG_ID, 'webhook-timestamp': String(ts), 'webhook-signature': sig };
      const req = makeReq({ headers, rawBody: Buffer.from(BODY) });
      const res = makeRes();
      const next = makeNext();
      validateSecret(config)(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns 401 when signature entry has no comma', () => {
      const ts = Math.floor(Date.now() / 1000);
      const headers = { 'webhook-id': MSG_ID, 'webhook-timestamp': String(ts), 'webhook-signature': 'noseparator' };
      const req = makeReq({ headers, rawBody: Buffer.from(BODY) });
      const res = makeRes();
      const next = makeNext();
      validateSecret(config)(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });
});
