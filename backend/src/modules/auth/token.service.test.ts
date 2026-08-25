import { describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { UnauthenticatedError } from '../../utils/errors';
import {
  generateRefreshToken,
  hashToken,
  parseDuration,
  signAccessToken,
  verifyAccessToken,
} from './token.service';

describe('access tokens', () => {
  const claims = { sub: '7', roleKey: 'ADMIN', tokenVersion: 3 };

  it('round-trips its claims', () => {
    const decoded = verifyAccessToken(signAccessToken(claims));
    expect(decoded).toMatchObject(claims);
  });

  it('rejects a tampered token', () => {
    const token = signAccessToken(claims);
    const tampered = `${token.slice(0, -3)}abc`;
    expect(() => verifyAccessToken(tampered)).toThrow(UnauthenticatedError);
  });

  it('rejects a token signed with a different secret', () => {
    const foreign = jwt.sign(claims, 'a-completely-different-secret-value-32ch', {
      issuer: 'invoice-api',
    });
    expect(() => verifyAccessToken(foreign)).toThrow(UnauthenticatedError);
  });

  it('rejects a token from another issuer', () => {
    const foreign = jwt.sign(claims, env.JWT_ACCESS_SECRET as string, { issuer: 'somewhere-else' });
    expect(() => verifyAccessToken(foreign)).toThrow(UnauthenticatedError);
  });

  it('rejects an expired token', () => {
    const expired = jwt.sign(claims, env.JWT_ACCESS_SECRET as string, {
      issuer: 'invoice-api',
      expiresIn: '-1s',
    });
    expect(() => verifyAccessToken(expired)).toThrow(/expired/i);
  });

  it('carries the token version, so a password change can end every session', () => {
    const decoded = verifyAccessToken(signAccessToken({ ...claims, tokenVersion: 9 }));
    expect(decoded.tokenVersion).toBe(9);
  });
});

describe('refresh tokens', () => {
  it('is opaque, long and unpredictable', () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(64);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('is stored only as a stable one-way hash', () => {
    const token = generateRefreshToken();
    const hash = hashToken(token);
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain(token);
    expect(hashToken(token)).toBe(hash);
    expect(hashToken(generateRefreshToken())).not.toBe(hash);
  });
});

describe('parseDuration', () => {
  it('understands the units used in configuration', () => {
    expect(parseDuration('30s')).toBe(30_000);
    expect(parseDuration('15m')).toBe(900_000);
    expect(parseDuration('2h')).toBe(7_200_000);
    expect(parseDuration('7d')).toBe(604_800_000);
    expect(parseDuration('45')).toBe(45_000);
  });

  it('refuses something it cannot interpret rather than guessing', () => {
    expect(() => parseDuration('soon')).toThrow(/duration/i);
    expect(() => parseDuration('7 weeks')).toThrow(/duration/i);
  });
});
