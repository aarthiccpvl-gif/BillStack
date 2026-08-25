import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app';

const app = createApp();

/**
 * Contract-level tests that need no database. The credential and RBAC matrix tests
 * that do need one live in src/test/integration and skip themselves when MySQL is
 * unavailable.
 */

describe('POST /api/auth/login — validation', () => {
  it('rejects a missing body with field-level detail', async () => {
    const response = await request(app).post('/api/auth/login').send({});

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    const paths = response.body.error.details.map((detail: { path: string }) => detail.path);
    expect(paths).toContain('email');
    expect(paths).toContain('password');
  });

  it('rejects an address that is not an email', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'not-an-email', password: 'whatever' });

    expect(response.status).toBe(422);
    expect(response.body.error.details[0].message).toMatch(/valid email/i);
  });

  it('never echoes the submitted password back', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'x', password: 'Sup3rSecret!' });

    expect(JSON.stringify(response.body)).not.toContain('Sup3rSecret!');
  });
});

describe('authentication is required', () => {
  const protectedEndpoints: [string, string][] = [
    ['get', '/api/auth/me'],
    ['get', '/api/users'],
    ['post', '/api/users'],
    ['get', '/api/roles'],
    ['get', '/api/permissions'],
  ];

  it.each(protectedEndpoints)('%s %s returns 401 without a session', async (method, path) => {
    const response = await request(app)[method as 'get' | 'post'](path).send({});

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a forged access token', async () => {
    const response = await request(app).get('/api/auth/me').set('Cookie', ['at=not.a.real.token']);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });
});

describe('POST /api/auth/logout', () => {
  it('succeeds without a session and clears the cookies', async () => {
    const response = await request(app).post('/api/auth/logout').send({});

    expect(response.status).toBe(200);
    expect(response.body.data.loggedOut).toBe(true);

    const cookies = response.headers['set-cookie'] as unknown as string[] | undefined;
    expect((cookies ?? []).join(';')).toMatch(/at=;|rt=;/);
  });
});

describe('POST /api/auth/refresh', () => {
  it('refuses when there is no refresh cookie', async () => {
    const response = await request(app).post('/api/auth/refresh').send({});

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });
});
