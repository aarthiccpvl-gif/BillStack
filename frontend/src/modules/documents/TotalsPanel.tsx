import { formatMoney, formatPercent, type CalcResult, type CurrencyFormat } from '@app/shared';

/**
 * The totals panel.
 *
 * Every figure comes from the shared engine, so it matches what the server will
 * store. `adjustment` and `roundOff` stay visibly separate — one is a deliberate
 * entry, the other an automatic correction, and a customer will ask about both.
 */

interface Props {
  totals: CalcResult;
  currency: CurrencyFormat;
  discountMode: 'NONE' | 'PERCENT' | 'AMOUNT';
  discountValue: string;
  adjustment: string;
  roundOffEnabled: boolean;
  amountInWords: string;
  onChange: (patch: {
    discountMode?: 'NONE' | 'PERCENT' | 'AMOUNT';
    discountValue?: string;
    adjustment?: string;
    roundOffEnabled?: boolean;
  }) => void;
  disabled?: boolean;
}

const Row = ({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) => (
  <div className={`d-flex justify-content-between py-1${strong ? ' fw-semibold' : ''}`}>
    <span className={strong ? '' : 'text-secondary'}>{label}</span>
    <span className="text-numeric">{value}</span>
  </div>
);

export const TotalsPanel = ({
  totals,
  currency,
  discountMode,
  discountValue,
  adjustment,
  roundOffEnabled,
  amountInWords,
  onChange,
  disabled = false,
}: Props) => (
  <div className="card">
    <div className="card-header bg-white">
      <span className="label-caps">Totals</span>
    </div>

    <div className="card-body">
      <Row label="Subtotal" value={formatMoney(totals.subtotal, currency)} />

      <div className="d-flex justify-content-between align-items-center py-1 gap-2">
        <div className="d-flex align-items-center gap-2">
          <span className="text-secondary">Discount</span>
          <div className="input-group input-group-sm" style={{ width: '9.5rem' }}>
            <input
              className="form-control text-numeric"
              inputMode="decimal"
              aria-label="Document discount"
              disabled={disabled || discountMode === 'NONE'}
              value={discountValue}
              onChange={(event) => onChange({ discountValue: event.target.value })}
            />
            <select
              className="form-select"
              style={{ maxWidth: '4rem' }}
              aria-label="Discount type"
              disabled={disabled}
              value={discountMode}
              onChange={(event) =>
                onChange({ discountMode: event.target.value as Props['discountMode'] })
              }
            >
              <option value="NONE">—</option>
              <option value="PERCENT">%</option>
              <option value="AMOUNT">{currency.symbol}</option>
            </select>
          </div>
        </div>
        <span className="text-numeric">
          {Number(totals.discountTotal) > 0 ? '− ' : ''}
          {formatMoney(totals.discountTotal, currency)}
        </span>
      </div>

      <Row label="Taxable value" value={formatMoney(totals.taxableTotal, currency)} />

      {totals.taxSummary.map((row) => (
        <Row
          key={`${row.taxTypeKey}-${row.ratePercent}`}
          label={`${row.label} (${formatPercent(row.ratePercent)})`}
          value={formatMoney(row.taxAmount, currency)}
        />
      ))}

      {totals.taxSummary.length === 0 && (
        <Row label="Tax" value={formatMoney(totals.taxTotal, currency)} />
      )}

      <div className="d-flex justify-content-between align-items-center py-1 gap-2">
        <div className="d-flex align-items-center gap-2">
          <span className="text-secondary">Adjustment</span>
          <input
            className="form-control form-control-sm text-numeric"
            style={{ width: '7rem' }}
            inputMode="decimal"
            aria-label="Adjustment"
            disabled={disabled}
            value={adjustment}
            onChange={(event) => onChange({ adjustment: event.target.value })}
          />
        </div>
        <span className="text-numeric">{formatMoney(totals.adjustment, currency)}</span>
      </div>

      <div className="d-flex justify-content-between align-items-center py-1">
        <div className="form-check form-switch mb-0">
          <input
            className="form-check-input"
            type="checkbox"
            id="round-off"
            disabled={disabled}
            checked={roundOffEnabled}
            onChange={(event) => onChange({ roundOffEnabled: event.target.checked })}
          />
          <label className="form-check-label text-secondary" htmlFor="round-off">
            Round off
          </label>
        </div>
        <span className="text-numeric">{formatMoney(totals.roundOff, currency)}</span>
      </div>

      <hr className="my-2" />
      <div className="d-flex justify-content-between fs-5 fw-semibold">
        <span>Total</span>
        <span className="text-numeric">{formatMoney(totals.grandTotal, currency)}</span>
      </div>

      {amountInWords && (
        <div className="small text-secondary mt-2 border-top pt-2">{amountInWords}</div>
      )}
    </div>
  </div>
);
