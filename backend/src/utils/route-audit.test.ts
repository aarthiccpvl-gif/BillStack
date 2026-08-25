import express from 'express';
import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from '@app/shared';
import { createApp } from '../app';
import { requirePermission } from '../middleware/authorize';
import { assertRoutesProtected, collectRoutes } from './route-audit';

describe('route guard audit', () => {
  it('finds the mounted routes', () => {
    const routes = collectRoutes(createApp());
    const paths = routes.map((route) => `${route.method.toUpperCase()} ${route.path}`);

    expect(paths).toContain('GET /api/health');
    expect(paths).toContain('POST /api/auth/login');
    expect(paths).toContain('POST /api/users');
  });

  it('passes for the real application — every mutating route declares a permission', () => {
    expect(() => assertRoutesProtected(createApp())).not.toThrow();
  });

  it('every mutating route is tagged', () => {
    const untagged = collectRoutes(createApp()).filter(
      (route) => ['post', 'patch', 'put', 'delete'].includes(route.method) && !route.tagged,
    );
    expect(untagged).toEqual([]);
  });

  it('fails the boot when a mutating route forgets its guard', () => {
    const app = express();
    const router = express.Router();
    router.post('/oops', (_req, res) => res.json({ ok: true }));
    app.use('/api', router);

    expect(() => assertRoutesProtected(app)).toThrow(/declare no permission/i);
    expect(() => assertRoutesProtected(app)).toThrow(/POST/);
  });

  it('accepts a mutating route once a permission is declared', () => {
    const app = express();
    const router = express.Router();
    router.post('/fine', requirePermission(PERMISSIONS.INVOICE_CREATE), (_req, res) =>
      res.json({ ok: true }),
    );
    app.use('/api', router);

    expect(() => assertRoutesProtected(app)).not.toThrow();
  });

  it('does not object to an unguarded read', () => {
    const app = express();
    const router = express.Router();
    router.get('/open', (_req, res) => res.json({ ok: true }));
    app.use('/api', router);

    expect(() => assertRoutesProtected(app)).not.toThrow();
  });
});
