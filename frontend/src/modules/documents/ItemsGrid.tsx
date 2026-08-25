import { useRef } from 'react';
import { ChevronDown, ChevronUp, Copy, Plus, Trash2 } from 'lucide-react';
import {
  formatMoney,
  type CalcResult,
  type CurrencyFormat,
  type DocumentLineInput,
  type ItemRecord,
  type TaxGroupRecord,
  type UnitRecord,
} from '@app/shared';

/**
 * The items grid.
 *
 * This is where a billing user spends their day, so it is built for the keyboard:
 * Enter on the last row adds another, Alt+↑/↓ reorders, and picking an item from
 * the master fills the description, rate, unit, HSN and tax in one go.
 *
 * Line amounts come from the shared engine, so they match the saved document.
 */

export const emptyLine = (): DocumentLineInput => ({
  itemId: null,
  name: '',
  description: null,
  hsnSacCode: null,
  unitCode: null,
  quantity: '1',
  rate: '0',
  discountMode: 'NONE',
  discountValue: '0',
  taxGroupId: null,
  isTaxExempt: false,
  exemptReason: null,
});

interface Props {
  items: DocumentLineInput[];
  onChange: (items: DocumentLineInput[]) => void;
  currency: CurrencyFormat;
  totals: CalcResult;
  itemMaster: ItemRecord[];
  taxGroups: TaxGroupRecord[];
  units: UnitRecord[];
  disabled?: boolean;
}

export const ItemsGrid = ({
  items,
  onChange,
  currency,
  totals,
  itemMaster,
  taxGroups,
  units,
  disabled = false,
}: Props) => {
  const nameRefs = useRef<(HTMLInputElement | null)[]>([]);

  const update = (index: number, patch: Partial<DocumentLineInput>) => {
    onChange(items.map((line, position) => (position === index ? { ...line, ...patch } : line)));
  };

  const addLine = () => {
    onChange([...items, emptyLine()]);
    /* Focus the new row so typing can continue without reaching for the mouse. */
    window.setTimeout(() => nameRefs.current[items.length]?.focus(), 0);
  };

  const removeLine = (index: number) => {
    onChange(
      items.length === 1 ? [emptyLine()] : items.filter((_, position) => position !== index),
    );
  };

  const duplicateLine = (index: number) => {
    const source = items[index];
    if (!source) return;
    const next = [...items];
    next.splice(index + 1, 0, { ...source });
    onChange(next);
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(index, 1);
    if (moved) next.splice(target, 0, moved);
    onChange(next);
  };

  /** Picking from the master fills everything the master knows. */
  const applyItem = (index: number, itemId: number) => {
    const master = itemMaster.find((entry) => entry.id === itemId);
    if (!master) return;

    update(index, {
      itemId: master.id,
      name: master.name,
      description: master.description,
      hsnSacCode: master.hsnSacCode,
      unitCode: master.unitCode,
      rate: master.defaultRate,
      taxGroupId: master.defaultTaxGroupId,
    });
  };

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (index === items.length - 1) addLine();
      else nameRefs.current[index + 1]?.focus();
    }
    if (event.altKey && event.key === 'ArrowUp') {
      event.preventDefault();
      move(index, -1);
    }
    if (event.altKey && event.key === 'ArrowDown') {
      event.preventDefault();
      move(index, 1);
    }
  };

  return (
    <div className="card">
      <div className="card-header bg-white d-flex justify-content-between align-items-center">
        <span className="label-caps">Items</span>
        <span className="small text-secondary d-none d-lg-inline">
          Enter adds a row · Alt+↑/↓ reorders
        </span>
      </div>

      <div className="table-scroll">
        <table className="table table-sm align-middle mb-0" style={{ minWidth: '60rem' }}>
          <thead>
            <tr>
              <th style={{ width: '2.5rem' }}>#</th>
              <th style={{ minWidth: '16rem' }}>Item &amp; description</th>
              <th style={{ width: '7rem' }}>HSN/SAC</th>
              <th style={{ width: '6rem' }} className="text-numeric">
                Qty
              </th>
              <th style={{ width: '6rem' }}>Unit</th>
              <th style={{ width: '8rem' }} className="text-numeric">
                Rate
              </th>
              <th style={{ width: '9rem' }}>Discount</th>
              <th style={{ width: '11rem' }}>Tax</th>
              <th style={{ width: '9rem' }} className="text-numeric">
                Amount
              </th>
              {!disabled && <th style={{ width: '5rem' }} />}
            </tr>
          </thead>
          <tbody>
            {items.map((line, index) => {
              const computed = totals.lines[index];

              return (
                <tr key={index}>
                  <td className="text-secondary small">{index + 1}</td>

                  <td>
                    <div className="d-flex gap-1">
                      <select
                        className="form-select form-select-sm"
                        style={{ maxWidth: '2.6rem' }}
                        aria-label={`Pick a saved item for line ${index + 1}`}
                        disabled={disabled}
                        value=""
                        onChange={(event) => {
                          if (event.target.value) applyItem(index, Number(event.target.value));
                        }}
                      >
                        <option value="">＋</option>
                        {itemMaster.map((master) => (
                          <option key={master.id} value={master.id}>
                            {master.name}
                          </option>
                        ))}
                      </select>
                      <input
                        ref={(element) => {
                          nameRefs.current[index] = element;
                        }}
                        className="form-control form-control-sm"
                        placeholder="Description of the work"
                        aria-label={`Item name, line ${index + 1}`}
                        disabled={disabled}
                        value={line.name}
                        onKeyDown={(event) => onKeyDown(event, index)}
                        onChange={(event) => update(index, { name: event.target.value })}
                      />
                    </div>
                    <textarea
                      className="form-control form-control-sm mt-1"
                      rows={1}
                      placeholder="Further detail (optional)"
                      aria-label={`Item detail, line ${index + 1}`}
                      disabled={disabled}
                      value={line.description ?? ''}
                      onChange={(event) =>
                        update(index, { description: event.target.value || null })
                      }
                    />
                  </td>

                  <td>
                    <input
                      className="form-control form-control-sm text-mono"
                      aria-label={`HSN or SAC, line ${index + 1}`}
                      disabled={disabled}
                      value={line.hsnSacCode ?? ''}
                      onChange={(event) =>
                        update(index, { hsnSacCode: event.target.value || null })
                      }
                    />
                  </td>

                  <td>
                    <input
                      className="form-control form-control-sm text-numeric"
                      inputMode="decimal"
                      aria-label={`Quantity, line ${index + 1}`}
                      disabled={disabled}
                      value={String(line.quantity)}
                      onChange={(event) => update(index, { quantity: event.target.value })}
                    />
                  </td>

                  <td>
                    <select
                      className="form-select form-select-sm"
                      aria-label={`Unit, line ${index + 1}`}
                      disabled={disabled}
                      value={line.unitCode ?? ''}
                      onChange={(event) => update(index, { unitCode: event.target.value || null })}
                    >
                      <option value="">—</option>
                      {units.map((unit) => (
                        <option key={unit.id} value={unit.code}>
                          {unit.code}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td>
                    <input
                      className="form-control form-control-sm text-numeric"
                      inputMode="decimal"
                      aria-label={`Rate, line ${index + 1}`}
                      disabled={disabled}
                      value={String(line.rate)}
                      onChange={(event) => update(index, { rate: event.target.value })}
                    />
                  </td>

                  <td>
                    <div className="input-group input-group-sm">
                      <input
                        className="form-control text-numeric"
                        inputMode="decimal"
                        aria-label={`Discount, line ${index + 1}`}
                        disabled={disabled || line.discountMode === 'NONE'}
                        value={String(line.discountValue)}
                        onChange={(event) => update(index, { discountValue: event.target.value })}
                      />
                      <select
                        className="form-select"
                        style={{ maxWidth: '4rem' }}
                        aria-label={`Discount type, line ${index + 1}`}
                        disabled={disabled}
                        value={line.discountMode}
                        onChange={(event) =>
                          update(index, {
                            discountMode: event.target.value as DocumentLineInput['discountMode'],
                          })
                        }
                      >
                        <option value="NONE">—</option>
                        <option value="PERCENT">%</option>
                        <option value="AMOUNT">{currency.symbol}</option>
                      </select>
                    </div>
                  </td>

                  <td>
                    <select
                      className="form-select form-select-sm"
                      aria-label={`Tax, line ${index + 1}`}
                      disabled={disabled || line.isTaxExempt}
                      value={line.taxGroupId ?? ''}
                      onChange={(event) =>
                        update(index, {
                          taxGroupId: event.target.value ? Number(event.target.value) : null,
                        })
                      }
                    >
                      <option value="">No tax</option>
                      {taxGroups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                    {computed && computed.taxes.length > 0 && (
                      <div className="small text-secondary mt-1">
                        {computed.taxes
                          .map(
                            (tax) =>
                              `${tax.label} ${formatMoney(tax.taxAmount, currency, { omitSymbol: true })}`,
                          )
                          .join(' + ')}
                      </div>
                    )}
                  </td>

                  <td className="text-numeric">
                    {computed ? formatMoney(computed.lineTotal, currency) : '—'}
                  </td>

                  {!disabled && (
                    <td>
                      <div className="btn-group btn-group-sm">
                        <button
                          type="button"
                          className="btn btn-outline-secondary px-1"
                          title="Move up"
                          onClick={() => move(index, -1)}
                        >
                          <ChevronUp size={13} aria-hidden />
                          <span className="visually-hidden">Move line {index + 1} up</span>
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline-secondary px-1"
                          title="Move down"
                          onClick={() => move(index, 1)}
                        >
                          <ChevronDown size={13} aria-hidden />
                          <span className="visually-hidden">Move line {index + 1} down</span>
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline-secondary px-1"
                          title="Duplicate"
                          onClick={() => duplicateLine(index)}
                        >
                          <Copy size={13} aria-hidden />
                          <span className="visually-hidden">Duplicate line {index + 1}</span>
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline-secondary px-1"
                          title="Remove"
                          onClick={() => removeLine(index)}
                        >
                          <Trash2 size={13} aria-hidden />
                          <span className="visually-hidden">Remove line {index + 1}</span>
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!disabled && (
        <div className="card-footer bg-white">
          <button type="button" className="btn btn-sm btn-outline-primary" onClick={addLine}>
            <Plus size={14} className="me-1" aria-hidden />
            Add item
          </button>
        </div>
      )}
    </div>
  );
};
