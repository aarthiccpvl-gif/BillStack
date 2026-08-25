import type { CalcTaxComponent } from '@app/shared';
import { prisma, type Db } from '../db/prisma';
import { BusinessRuleError } from '../utils/errors';

/**
 * Tax resolution.
 *
 * A user picks one thing on a line — "GST 18% (Intra-state)" — and this expands it
 * into the component rates that actually get stored and printed. Which group is
 * appropriate depends on the place of supply, which is why that decision is made
 * here rather than guessed at in the UI.
 */

export type SupplyScope = 'INTRA_STATE' | 'INTER_STATE' | 'UNION_TERRITORY' | 'NONE';

/** Union territories have no state GST, so they use UTGST instead of SGST. */
const UNION_TERRITORY_CODES = new Set(['04', '07', '25', '26', '31', '34', '35', '38', '97']);

export interface PlaceOfSupplyInput {
  companyStateCode: string | null | undefined;
  customerStateCode: string | null | undefined;
  taxTreatment: string;
}

/**
 * Decides which kind of tax applies.
 *
 * The result is a *suggestion*: it pre-selects the right group when a customer is
 * chosen, and the user can still override per line. Whatever they end up with is
 * stored on the document, never re-derived at read time.
 */
export const resolveSupplyScope = ({
  companyStateCode,
  customerStateCode,
  taxTreatment,
}: PlaceOfSupplyInput): SupplyScope => {
  /* An export or an SEZ supply is zero-rated regardless of geography. */
  if (taxTreatment === 'OVERSEAS' || taxTreatment === 'SEZ') return 'NONE';

  if (!companyStateCode || !customerStateCode) return 'INTRA_STATE';

  if (companyStateCode === customerStateCode) {
    return UNION_TERRITORY_CODES.has(customerStateCode) ? 'UNION_TERRITORY' : 'INTRA_STATE';
  }

  return 'INTER_STATE';
};

export interface ResolvedTaxGroup {
  taxGroupId: number;
  name: string;
  components: CalcTaxComponent[];
}

/**
 * Expands tax groups into their components, in one query for the whole document.
 *
 * A rate is checked against the document date: a rate that had not taken effect,
 * or has since been retired, must not be applied to a document dated outside its
 * window.
 */
export const resolveTaxGroups = async (
  taxGroupIds: number[],
  documentDate: Date,
  db: Db = prisma,
): Promise<Map<number, ResolvedTaxGroup>> => {
  const unique = [...new Set(taxGroupIds)];
  if (unique.length === 0) return new Map();

  const groups = await db.taxGroup.findMany({
    where: { id: { in: unique } },
    include: { rates: { include: { rate: { include: { taxType: true } } } } },
  });

  const missing = unique.filter((id) => !groups.some((group) => group.id === id));
  if (missing.length > 0) {
    throw new BusinessRuleError(`Tax group ${missing.join(', ')} does not exist.`);
  }

  const resolved = new Map<number, ResolvedTaxGroup>();

  for (const group of groups) {
    if (!group.isActive) {
      throw new BusinessRuleError(
        `"${group.name}" is no longer active. Choose a current tax for this line.`,
      );
    }

    const components: CalcTaxComponent[] = [];

    for (const link of group.rates) {
      const rate = link.rate;

      if (rate.effectiveFrom && rate.effectiveFrom > documentDate) {
        throw new BusinessRuleError(
          `${rate.name} does not take effect until ${rate.effectiveFrom.toISOString().slice(0, 10)}, which is after this document's date.`,
        );
      }
      if (rate.effectiveTo && rate.effectiveTo < documentDate) {
        throw new BusinessRuleError(
          `${rate.name} stopped applying on ${rate.effectiveTo.toISOString().slice(0, 10)}, before this document's date.`,
        );
      }

      components.push({
        taxRateId: rate.id,
        taxTypeKey: rate.taxType.key,
        label: rate.name,
        ratePercent: rate.rate.toString(),
      });
    }

    resolved.set(group.id, {
      taxGroupId: group.id,
      name: group.name,
      components,
    });
  }

  return resolved;
};

/** The group a new line should default to, given the supply scope. */
export const suggestTaxGroup = async (
  scope: SupplyScope,
  preferredTotalRate = 18,
  db: Db = prisma,
): Promise<number | null> => {
  if (scope === 'NONE') {
    const zero = await db.taxGroup.findFirst({ where: { name: 'Zero Rated', isActive: true } });
    return zero?.id ?? null;
  }

  const group = await db.taxGroup.findFirst({
    where: { scope, isActive: true, totalRate: preferredTotalRate },
  });

  return group?.id ?? null;
};
