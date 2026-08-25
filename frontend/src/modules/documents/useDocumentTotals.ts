import { useMemo } from 'react';
import {
  calculateDocument,
  type CalcResult,
  type CalcTaxComponent,
  type CurrencyFormat,
  type DocumentLineInput,
  type TaxGroupRecord,
} from '@app/shared';

/**
 * Live totals for the editor.
 *
 * This calls the **same** engine the server uses, from `@app/shared` — not a
 * reimplementation. That is why the figure on screen while typing is identical to
 * the one the API stores on save, to the last minor unit. The server still
 * recalculates and remains the authority; this exists so the user is not typing
 * blind.
 */

export interface UseDocumentTotalsInput {
  items: DocumentLineInput[];
  discountMode: 'NONE' | 'PERCENT' | 'AMOUNT';
  discountValue: string;
  adjustment: string;
  roundOffEnabled: boolean;
  currency: CurrencyFormat;
  taxGroups: TaxGroupRecord[];
  exchangeRateToBase?: string;
}

const toComponents = (
  taxGroupId: number | null | undefined,
  taxGroups: TaxGroupRecord[],
): CalcTaxComponent[] => {
  if (!taxGroupId) return [];
  const group = taxGroups.find((entry) => entry.id === taxGroupId);
  if (!group) return [];

  return group.rates.map((rate) => ({
    taxRateId: rate.id,
    taxTypeKey: rate.taxTypeKey,
    label: rate.name,
    ratePercent: rate.rate,
  }));
};

/** Anything the engine would choke on is skipped rather than throwing mid-keystroke. */
const isUsable = (line: DocumentLineInput): boolean =>
  /^\d+(\.\d+)?$/.test(String(line.quantity ?? '')) &&
  /^\d+(\.\d+)?$/.test(String(line.rate ?? ''));

export const useDocumentTotals = ({
  items,
  discountMode,
  discountValue,
  adjustment,
  roundOffEnabled,
  currency,
  taxGroups,
  exchangeRateToBase,
}: UseDocumentTotalsInput): CalcResult =>
  useMemo(() => {
    const usable = items.filter(isUsable);

    return calculateDocument({
      decimalPlaces: currency.decimalPlaces,
      lines: usable.map((line) => ({
        quantity: line.quantity,
        rate: line.rate,
        discountMode: line.discountMode,
        discountValue: /^\d+(\.\d+)?$/.test(String(line.discountValue ?? ''))
          ? line.discountValue
          : '0',
        isTaxExempt: line.isTaxExempt,
        taxes: toComponents(line.taxGroupId, taxGroups),
      })),
      discountMode,
      discountValue: /^\d+(\.\d+)?$/.test(discountValue) ? discountValue : '0',
      adjustment: /^-?\d+(\.\d+)?$/.test(adjustment) ? adjustment : '0',
      roundOffEnabled,
      exchangeRateToBase: exchangeRateToBase ?? '1',
    });
  }, [
    items,
    discountMode,
    discountValue,
    adjustment,
    roundOffEnabled,
    currency.decimalPlaces,
    taxGroups,
    exchangeRateToBase,
  ]);
