import { Request, Response, NextFunction } from 'express';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Config } from '../config';

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const WHSEC_PREFIX = 'whsec_';

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

function verifySigningToken(signingToken: string, req: RawBodyRequest): boolean {
  const msgId = req.headers['webhook-id'];
  const msgTimestamp = req.headers['webhook-timestamp'];
  const msgSignature = req.headers['webhook-signature'];

  if (
    typeof msgId !== 'string' ||
    typeof msgTimestamp !== 'string' ||
    typeof msgSignature !== 'string' ||
    !req.rawBody
  ) {
    return false;
  }

  // Replay protection: reject requests outside a 5-minute window
  const timestampMs = Number.parseInt(msgTimestamp, 10) * 1000;
  if (Math.abs(Date.now() - timestampMs) > FIVE_MINUTES_MS) {
    return false;
  }

  const keyBase64 = signingToken.startsWith(WHSEC_PREFIX)
    ? signingToken.slice(WHSEC_PREFIX.length)
    : signingToken;
  const key = Buffer.from(keyBase64, 'base64');

  const toSign = `${msgId}.${msgTimestamp}.${req.rawBody.toString('utf8')}`;
  const expectedSig = createHmac('sha256', key).update(toSign).digest('base64');
  const expectedBuf = Buffer.from(expectedSig, 'base64');

  // Signature header may contain multiple entries: "v1,<sig1> v1,<sig2>"
  return msgSignature.split(' ').some((entry) => {
    const comma = entry.indexOf(',');
    if (comma === -1 || entry.slice(0, comma) !== 'v1') return false;
    try {
      const sigBuf = Buffer.from(entry.slice(comma + 1), 'base64');
      return sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf);
    } catch {
      return false;
    }
  });
}

/**
 * Constant-time comparison of the legacy X-Gitlab-Token header against the
 * configured secret. Both values are hashed first so the comparison runs on
 * equal-length buffers and does not leak the secret's length.
 */
function verifyLegacySecret(secret: string | undefined, header: unknown): boolean {
  if (!secret || typeof header !== 'string') return false;
  const expected = createHash('sha256').update(secret).digest();
  const actual = createHash('sha256').update(header).digest();
  return timingSafeEqual(expected, actual);
}

export function validateSecret(config: Config) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (config.webhookSigningToken) {
      if (!verifySigningToken(config.webhookSigningToken, req as RawBodyRequest)) {
        res.status(401).json({ error: 'Unauthorized: invalid webhook signature' });
        return;
      }
    } else if (!verifyLegacySecret(config.webhookSecret, req.headers['x-gitlab-token'])) {
      res.status(401).json({ error: 'Unauthorized: invalid webhook token' });
      return;
    }
    next();
  };
}
