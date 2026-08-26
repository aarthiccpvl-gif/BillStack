import { Router, type RequestHandler } from 'express';
import { healthRouter } from '../modules/health/health.routes';
import { authRouter } from '../modules/auth/auth.routes';
import { permissionsRouter, rolesRouter, usersRouter } from '../modules/users/users.routes';
import { companyRouter } from '../modules/company/company.routes';
import { mastersRouter } from '../modules/masters/masters.routes';
import { customersRouter } from '../modules/customers/customers.routes';
import { itemsRouter } from '../modules/items/items.routes';
import { templatesRouter } from '../modules/templates/templates.routes';
import { filesRouter } from '../modules/files/files.routes';
import { quotationsRouter } from '../modules/quotations/quotations.routes';
import { invoicesRouter } from '../modules/invoices/invoices.routes';
import { dashboardRouter, searchRouter } from '../modules/dashboard/dashboard.routes';
import { downloadsRouter } from '../modules/downloads/downloads.routes';
import { publicRouter } from '../modules/public/public.routes';
import {
  authenticate,
  enforcePasswordChange,
  enforceReadOnlyRole,
} from '../middleware/authenticate';

/**
 * The single mount point for the API surface, so the whole application is readable
 * in one screen.
 *
 * Guards are applied per mount rather than as a catch-all: mounting them at the
 * router root would make every unknown path answer 401 instead of 404, which is
 * both confusing to debug and inconsistent depending on whether the caller happens
 * to be signed in.
 *
 * Three guards run before any protected controller: authentication, the read-only
 * role block, and the outstanding-password-change block. Individual routes then
 * declare the specific permission they need.
 */

const guarded: RequestHandler[] = [authenticate, enforceReadOnlyRole, enforcePasswordChange];

export const apiRouter = Router();

/* Public. */
apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
/* Secure share links — the only other unauthenticated surface (decision Q9). */
apiRouter.use('/public', publicRouter);

/* Authenticated. */
apiRouter.use('/users', ...guarded, usersRouter);
apiRouter.use('/roles', ...guarded, rolesRouter);
apiRouter.use('/permissions', ...guarded, permissionsRouter);
apiRouter.use('/company', ...guarded, companyRouter);
apiRouter.use('/masters', ...guarded, mastersRouter);
apiRouter.use('/customers', ...guarded, customersRouter);
apiRouter.use('/items', ...guarded, itemsRouter);
apiRouter.use('/templates', ...guarded, templatesRouter);
apiRouter.use('/quotations', ...guarded, quotationsRouter);
apiRouter.use('/invoices', ...guarded, invoicesRouter);
apiRouter.use('/files', ...guarded, filesRouter);
apiRouter.use('/dashboard', ...guarded, dashboardRouter);
apiRouter.use('/search', ...guarded, searchRouter);
apiRouter.use('/export', ...guarded, downloadsRouter);

/* Phase 8 → reports, spreadsheet exports, audit-logs */
