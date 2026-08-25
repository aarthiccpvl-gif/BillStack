import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  PERMISSIONS,
  currencySchema,
  exchangeRateSchema,
  financialYearSchema,
  idParamSchema,
  itemCategorySchema,
  taxGroupSchema,
  taxRateSchema,
  unitSchema,
  updateCurrencySchema,
  updateNumberingSeriesSchema,
  updateTaxGroupSchema,
  updateTaxRateSchema,
  updateUnitSchema,
} from '@app/shared';
import { asyncHandler, sendSuccess } from '../../utils/http';
import {
  parsedBody,
  parsedParams,
  parsedQuery,
  validateBody,
  validateParams,
  validateQuery,
} from '../../middleware/validate';
import { getAuth } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/authorize';
import * as service from './masters.service';
import * as financialYearService from '../../services/financial-year.service';

/**
 * Master data.
 *
 * Reads are open to anyone who can read a document — the currency symbol and tax
 * label are needed to display one. Writes are Super Admin only (decision Q6).
 */
export const mastersRouter = Router();

const includeInactiveSchema = z.object({
  includeInactive: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

const read = requirePermission(PERMISSIONS.MASTER_READ);
const manage = requirePermission(PERMISSIONS.MASTER_MANAGE);

/* --- currencies --- */

mastersRouter.get(
  '/currencies',
  read,
  validateQuery(includeInactiveSchema),
  asyncHandler(async (_req: Request, res: Response) => {
    const { includeInactive } = parsedQuery(res, includeInactiveSchema);
    sendSuccess(res, await service.listCurrencies(includeInactive));
  }),
);

mastersRouter.post(
  '/currencies',
  manage,
  validateBody(currencySchema),
  asyncHandler(async (req: Request, res: Response) => {
    sendSuccess(res, await service.createCurrency(parsedBody(req, currencySchema)), {
      status: 201,
    });
  }),
);

const codeParamSchema = z.object({ code: z.string().trim().length(3).toUpperCase() });

mastersRouter.patch(
  '/currencies/:code',
  manage,
  validateParams(codeParamSchema),
  validateBody(updateCurrencySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { code } = parsedParams(res, codeParamSchema);
    sendSuccess(res, await service.updateCurrency(code, parsedBody(req, updateCurrencySchema)));
  }),
);

/* --- taxes --- */

mastersRouter.get(
  '/tax-types',
  read,
  asyncHandler(async (_req: Request, res: Response) => {
    sendSuccess(res, await service.listTaxTypes());
  }),
);

mastersRouter.get(
  '/tax-rates',
  read,
  validateQuery(includeInactiveSchema),
  asyncHandler(async (_req: Request, res: Response) => {
    const { includeInactive } = parsedQuery(res, includeInactiveSchema);
    sendSuccess(res, await service.listTaxRates(includeInactive));
  }),
);

mastersRouter.post(
  '/tax-rates',
  manage,
  validateBody(taxRateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    sendSuccess(res, await service.createTaxRate(parsedBody(req, taxRateSchema)), { status: 201 });
  }),
);

mastersRouter.patch(
  '/tax-rates/:id',
  manage,
  validateParams(idParamSchema),
  validateBody(updateTaxRateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = parsedParams(res, idParamSchema);
    sendSuccess(res, await service.updateTaxRate(id, parsedBody(req, updateTaxRateSchema)));
  }),
);

mastersRouter.get(
  '/tax-groups',
  read,
  validateQuery(includeInactiveSchema),
  asyncHandler(async (_req: Request, res: Response) => {
    const { includeInactive } = parsedQuery(res, includeInactiveSchema);
    sendSuccess(res, await service.listTaxGroups(includeInactive));
  }),
);

mastersRouter.post(
  '/tax-groups',
  manage,
  validateBody(taxGroupSchema),
  asyncHandler(async (req: Request, res: Response) => {
    sendSuccess(res, await service.createTaxGroup(parsedBody(req, taxGroupSchema)), {
      status: 201,
    });
  }),
);

mastersRouter.patch(
  '/tax-groups/:id',
  manage,
  validateParams(idParamSchema),
  validateBody(updateTaxGroupSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = parsedParams(res, idParamSchema);
    sendSuccess(res, await service.updateTaxGroup(id, parsedBody(req, updateTaxGroupSchema)));
  }),
);

/* --- units and categories --- */

mastersRouter.get(
  '/units',
  read,
  validateQuery(includeInactiveSchema),
  asyncHandler(async (_req: Request, res: Response) => {
    const { includeInactive } = parsedQuery(res, includeInactiveSchema);
    sendSuccess(res, await service.listUnits(includeInactive));
  }),
);

mastersRouter.post(
  '/units',
  manage,
  validateBody(unitSchema),
  asyncHandler(async (req: Request, res: Response) => {
    sendSuccess(res, await service.createUnit(parsedBody(req, unitSchema)), { status: 201 });
  }),
);

mastersRouter.patch(
  '/units/:id',
  manage,
  validateParams(idParamSchema),
  validateBody(updateUnitSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = parsedParams(res, idParamSchema);
    sendSuccess(res, await service.updateUnit(id, parsedBody(req, updateUnitSchema)));
  }),
);

mastersRouter.get(
  '/item-categories',
  read,
  asyncHandler(async (_req: Request, res: Response) => {
    sendSuccess(res, await service.listItemCategories());
  }),
);

mastersRouter.post(
  '/item-categories',
  manage,
  validateBody(itemCategorySchema),
  asyncHandler(async (req: Request, res: Response) => {
    sendSuccess(res, await service.createItemCategory(parsedBody(req, itemCategorySchema)), {
      status: 201,
    });
  }),
);

/* --- financial years --- */

mastersRouter.get(
  '/financial-years',
  read,
  asyncHandler(async (_req: Request, res: Response) => {
    sendSuccess(res, await financialYearService.listFinancialYears());
  }),
);

mastersRouter.post(
  '/financial-years',
  manage,
  validateBody(financialYearSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { startDate } = parsedBody(req, financialYearSchema);
    await financialYearService.createFinancialYear(startDate);
    sendSuccess(res, await financialYearService.listFinancialYears(), { status: 201 });
  }),
);

const fyStatusSchema = z.object({ status: z.enum(['OPEN', 'CLOSED']) });

mastersRouter.post(
  '/financial-years/:id/status',
  manage,
  validateParams(idParamSchema),
  validateBody(fyStatusSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = parsedParams(res, idParamSchema);
    const { status } = parsedBody(req, fyStatusSchema);
    await financialYearService.setFinancialYearStatus(id, status);
    sendSuccess(res, await financialYearService.listFinancialYears());
  }),
);

/* --- numbering --- */

mastersRouter.get(
  '/numbering-series',
  read,
  asyncHandler(async (_req: Request, res: Response) => {
    sendSuccess(res, await service.listNumberingSeries());
  }),
);

mastersRouter.patch(
  '/numbering-series/:id',
  manage,
  validateParams(idParamSchema),
  validateBody(updateNumberingSeriesSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = parsedParams(res, idParamSchema);
    sendSuccess(
      res,
      await service.updateNumberingSeries(id, parsedBody(req, updateNumberingSeriesSchema)),
    );
  }),
);

/* --- exchange rates (decision Q3) --- */

mastersRouter.get(
  '/exchange-rates',
  read,
  asyncHandler(async (_req: Request, res: Response) => {
    sendSuccess(res, await service.listExchangeRates());
  }),
);

mastersRouter.post(
  '/exchange-rates',
  manage,
  validateBody(exchangeRateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const auth = getAuth(req);
    sendSuccess(
      res,
      await service.upsertExchangeRate(parsedBody(req, exchangeRateSchema), auth.userId),
      { status: 201 },
    );
  }),
);
