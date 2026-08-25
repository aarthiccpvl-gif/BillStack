import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app';

const app = createApp();

describe('GET /api/health', () => {
  it('returns the success envelope with the checks payload', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject({
      environment: expect.any(String),
      version: expect.any(String),
      timestamp: expect.any(String),
      checks: { database: expect.stringMatching(/^(up|down|not_configured)$/) },
    });
    // Liveness stays 200 even when the database is unreachable.
    expect(['ok', 'degraded']).toContain(response.body.data.status);
  });

  it('echoes a correlation id on every response', async () => {
    const response = await request(app).get('/api/health');
    expect(response.headers['x-request-id']).toBeTruthy();
  });

  it('honours an incoming correlation id', async () => {
    const response = await request(app).get('/api/health').set('x-request-id', 'trace-me-123');
    expect(response.headers['x-request-id']).toBe('trace-me-123');
  });
});

describe('error contract', () => {
  it('returns the failure envelope for an unknown route', async () => {
    const response = await request(app).get('/api/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      success: false,
      error: { code: 'NOT_FOUND', message: expect.stringContaining('/api/does-not-exist') },
    });
    expect(response.body.error.requestId).toBeTruthy();
    expect(response.body.error).not.toHaveProperty('stack');
  });

  it('rejects a malformed JSON body with a validation error, not a crash', async () => {
    const response = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"broken":');

    expect([400, 404]).toContain(response.status);
    expect(response.body.success).toBe(false);
  });

  it('does not leak the framework fingerprint', async () => {
    const response = await request(app).get('/api/health');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});
