import { formatMoney, type CurrencyFormat, type MonthPoint } from '@app/shared';

/**
 * The monthly chart, drawn as plain SVG.
 *
 * No charting library: three series of twelve bars does not justify a dependency,
 * and hand-drawing it means the figures are formatted by the same `formatMoney`
 * the rest of the application uses rather than by a library's own locale guess.
 *
 * The table underneath is not a fallback — it is the accessible version of the
 * same data, and the one a finance user will actually read a number off.
 */

const HEIGHT = 160;
const BAR_GAP = 4;

interface Props {
  months: MonthPoint[];
  currency: CurrencyFormat;
}

const SERIES = [
  { key: 'invoiceBilledBase', label: 'Billed', className: 'chart-bar--billed' },
  { key: 'invoiceReceivedBase', label: 'Received', className: 'chart-bar--received' },
  { key: 'quotationValueBase', label: 'Quoted', className: 'chart-bar--quoted' },
] as const;

export const MonthlyChart = ({ months, currency }: Props) => {
  const values = months.flatMap((month) => SERIES.map((series) => Number(month[series.key])));
  const peak = Math.max(...values, 1);

  const groupWidth = 100 / Math.max(months.length, 1);
  const barWidth = (groupWidth - BAR_GAP) / SERIES.length;

  const compact = (amount: string): string => {
    const value = Number(amount);
    if (value >= 10_000_000) return `${(value / 10_000_000).toFixed(1)}Cr`;
    if (value >= 100_000) return `${(value / 100_000).toFixed(1)}L`;
    if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
    return String(Math.round(value));
  };

  return (
    <div>
      <div className="d-flex gap-3 mb-2 small">
        {SERIES.map((series) => (
          <span key={series.key} className="d-inline-flex align-items-center gap-1">
            <span className={`chart-swatch ${series.className}`} aria-hidden />
            {series.label}
          </span>
        ))}
        <span className="ms-auto text-secondary">
          {currency.code} · converted at each document&rsquo;s own rate
        </span>
      </div>

      <svg
        viewBox={`0 0 100 ${HEIGHT}`}
        preserveAspectRatio="none"
        className="w-100"
        style={{ height: `${HEIGHT}px` }}
        role="img"
        aria-label={`Monthly billed, received and quoted value in ${currency.code}. The table below has the figures.`}
      >
        {[0.25, 0.5, 0.75, 1].map((fraction) => (
          <line
            key={fraction}
            x1="0"
            x2="100"
            y1={HEIGHT - fraction * HEIGHT}
            y2={HEIGHT - fraction * HEIGHT}
            className="chart-gridline"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {months.map((month, monthIndex) =>
          SERIES.map((series, seriesIndex) => {
            const value = Number(month[series.key]);
            const height = value <= 0 ? 0 : Math.max((value / peak) * (HEIGHT - 8), 1.5);

            return (
              <rect
                key={`${month.month}-${series.key}`}
                x={monthIndex * groupWidth + BAR_GAP / 2 + seriesIndex * barWidth}
                y={HEIGHT - height}
                width={barWidth - 0.4}
                height={height}
                className={`chart-bar ${series.className}`}
              >
                <title>{`${month.label} · ${series.label} · ${formatMoney(month[series.key], currency)}`}</title>
              </rect>
            );
          }),
        )}
      </svg>

      <div className="d-flex justify-content-between small text-secondary mt-1">
        {months.map((month) => (
          <span key={month.month} style={{ width: `${groupWidth}%` }} className="text-center">
            {month.label.split(' ')[0]}
          </span>
        ))}
      </div>

      <details className="mt-3">
        <summary className="small text-secondary">Show the figures</summary>
        <div className="table-scroll mt-2">
          <table className="table table-sm mb-0">
            <thead>
              <tr>
                <th scope="col">Month</th>
                {SERIES.map((series) => (
                  <th key={series.key} scope="col" className="text-numeric">
                    {series.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {months.map((month) => (
                <tr key={month.month}>
                  <th scope="row" className="fw-normal">
                    {month.label}
                  </th>
                  {SERIES.map((series) => (
                    <td key={series.key} className="text-numeric" title={month[series.key]}>
                      {compact(month[series.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
};
