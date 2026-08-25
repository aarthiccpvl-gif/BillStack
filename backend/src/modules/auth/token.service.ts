import { createHash, randomBytes } from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import type { CookieOptions, Response } from 'express';
import { env, isProduction } from '../../config/env';
import { UnauthenticatedError } from '../../utils/errors';

/**
 * Token strategy.
 *
 *   access   short-lived JWT, httpOnly cookie scoped to /api
 *   refresh  opaque random string, httpOnly cookie scoped to /api/auth,
 *            stored only as a SHA-256 hash and rotated on every use
 *
 * The refresh token is deliberately not a JWT: an opaque value that must exist in
 * the database gives immediate revocation and makes reuse detection trivial.
 * Neither token is ever readable by JavaScript, so an XSS bug cannot exfiltrate a
 * session.
 */

export const ACCESS_COOKIE = 'at';
export const REFRESH_COOKIE = 'rt';

export interface AccessTokenClaims {
  sub: string;
  roleKey: string;
  /** Bumped on password change so every existing session dies at once. */
  tokenVersion: number;
}

const requireSecret = (value: string | undefined, name: string): string => {
  if (!value) {
    throw new Error(
      `${name} is not set. Run \`npm run setup:env\` in the repository root to generate it.`,
    );
  }
  return value;
};

export const signAccessToken = (claims: AccessTokenClaims): string =>
  jwt.sign(claims, requireSecret(env.JWT_ACCESS_SECRET, 'JWT_ACCESS_SECRET'), {
    expiresIn: env.JWT_ACCESS_TTL,
    issuer: 'invoice-api',
  } as SignOptions);

export const verifyAccessToken = (token: string): AccessTokenClaims => {
  try {
    const payload = jwt.verify(token, requireSecret(env.JWT_ACCESS_SECRET, 'JWT_ACCESS_SECRET'), {
      issuer: 'invoice-api',
    });

    if (typeof payload === 'string' || !payload.sub) {
      throw new UnauthenticatedError('Your session is not valid. Please sign in again.');
    }

    return {
      sub: String(payload.sub),
      roleKey: String((payload as Record<string, unknown>).roleKey ?? ''),
      tokenVersion: Number((payload as Record<string, unknown>).tokenVersion ?? 0),
    };
  } catch (error) {
    if (error instanceof UnauthenticatedError) throw error;
    throw new UnauthenticatedError('Your session has expired. Please sign in again.');
  }
};

/** 48 random bytes, base64url — never stored in plain form. */
export const generateRefreshToken = (): string => randomBytes(48).toString('base64url');

export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

/** "7d" / "15m" / "3600" → milliseconds. */
export const parseDuration = (value: string): number => {
  const match = /^(\d+)\s*([smhd])?$/i.exec(value.trim());
  if (!match) throw new Error(`Cannot parse duration "${value}"`);
  const amount = Number(match[1]);
  const unit = (match[2] ?? 's').toLowerCase();
  const multipliers: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return amount * (multipliers[unit] ?? 1000);
};

const baseCookie = (): CookieOptions => ({
  httpOnly: true,
  secure: env.COOKIE_SECURE || isProduction,
  /* Lax rather than Strict: the app is a same-origin SPA, and Strict would break a
     link that lands the user on an authenticated page from an external bookmark. */
  sameSite: 'lax',
  domain: env.COOKIE_DOMAIN === 'localhost' ? undefined : env.COOKIE_DOMAIN,
});

export const setAuthCookies = (res: Response, accessToken: string, refreshToken: string): void => {
  res.cookie(ACCESS_COOKIE, accessToken, {
    ...baseCookie(),
    path: '/api',
    maxAge: parseDuration(env.JWT_ACCESS_TTL),
  });

  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...baseCookie(),
    /* Scoped so the refresh token is never sent to ordinary API calls. */
    path: '/api/auth',
    maxAge: parseDuration(env.JWT_REFRESH_TTL),
  });
};

export const clearAuthCookies = (res: Response): void => {
  res.clearCookie(ACCESS_COOKIE, { ...baseCookie(), path: '/api' });
  res.clearCookie(REFRESH_COOKIE, { ...baseCookie(), path: '/api/auth' });
};

export const refreshExpiryDate = (): Date =>
  new Date(Date.now() + parseDuration(env.JWT_REFRESH_TTL));
