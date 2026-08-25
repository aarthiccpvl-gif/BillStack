import type { ReactNode } from 'react';
import {
  formatMoney,
  formatPercent,
  formatQuantity,
  type AddressBlock,
  type DocumentData,
  type DocumentLine,
  type TemplateConfig,
} from '@app/shared';

/**
 * The pieces every layout is assembled from.
 *
 * The three templates differ in *arrangement*, not in data — so these blocks carry
 * all the rendering logic and a new template is a new arrangement file plus a
 * registry entry, not a rewrite.
 */

export interface BlockProps {
  data: DocumentData;
  config: TemplateConfig;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Dates are plain YYYY-MM-DD strings; formatting them never touches a timezone. */
export const formatDate = (value: string | null | undefined, format: string): string => {
  if (!value) return '';
  const [year = '', month = '', day = ''] = value.split('-');
  const monthIndex = Number(month) - 1;

  switch (format) {
    case 'dd/MM/yyyy':
      return `${day}/${month}/${year}`;
    case 'yyyy-MM-dd':
      return value;
    default:
      return `${day}-${MONTHS[monthIndex] ?? month}-${year}`;
  }
};

export const money = (value: string, data: DocumentData): string =>
  formatMoney(value, data.currency);

export const AddressLines = ({ address }: { address?: AddressBlock | null }) => {
  if (!address) return null;

  const cityLine = [address.city, address.state].filter(Boolean).join(', ');
  const countryLine = [address.country, address.postalCode].filter(Boolean).join(' ');

  return (
    <address>
      {address.line1 && <div>{address.line1}</div>}
      {address.line2 && <div>{address.line2}</div>}
      {cityLine && <div>{cityLine}</div>}
      {countryLine && <div>{countryLine}</div>}
    </address>
  );
};

/** Bill-to / ship-to. GST details sit here because that is where a reader looks. */
export const PartyBlock = ({ data, config }: BlockProps) => {
  const { sections } = config;
  const showShipping =
    sections.shippingAddress && data.shippingAddress && data.shippingAddress.line1;

  return (
    <div className="parties section">
      {sections.billingAddress && (
        <div className="party block">
          <div className="label">Bill to</div>
          <div className="strong">{data.customer.companyName || data.customer.name}</div>
          {data.customer.companyName && data.customer.companyName !== data.customer.name && (
            <div>{data.customer.name}</div>
          )}
          <AddressLines address={data.billingAddress} />
          {sections.gstDetails && data.customer.gstin && (
            <div className="muted">GSTIN: {data.customer.gstin}</div>
          )}
          {data.customer.contactPerson && (
            <div className="muted">Attn: {data.customer.contactPerson}</div>
          )}
          {data.customer.email && <div className="muted">{data.customer.email}</div>}
        </div>
      )}

      {showShipping && (
        <div className="party block">
          <div className="label">Ship to</div>
          <AddressLines address={data.shippingAddress} />
        </div>
      )}
    </div>
  );
};

const lineTaxLabel = (line: DocumentLine): string => {
  if (line.taxes.length === 0) return '—';
  return line.taxes.map((tax) => `${tax.label}`).join(' + ');
};

const lineTaxAmount = (line: DocumentLine, data: DocumentData): string => {
  if (line.taxes.length === 0) return money('0', data);
  const total = line.taxes.reduce((sum, tax) => sum + Number(tax.taxAmount), 0);
  return formatMoney(String(total), data.currency);
};

/** The items table. Column set, labels, widths and alignment all come from config. */
export const ItemsTable = ({ data, config }: BlockProps) => {
  const columns = config.layout.itemColumns.filter((column) => column.show);

  const cell = (line: DocumentLine, key: string): ReactNode => {
    switch (key) {
      case 'sno':
        return line.lineNumber;
      case 'item':
        return (
          <>
            <div className="item-name">{line.name}</div>
            {line.description && <div className="item-desc">{line.description}</div>}
          </>
        );
      case 'description':
        return line.description ? <div className="item-desc">{line.description}</div> : '';
      case 'hsn':
        return line.hsnSac ?? '';
      case 'unit':
        return line.unit ?? '';
      case 'qty':
        return formatQuantity(line.quantity);
      case 'rate':
        return money(line.rate, data);
      case 'discount':
        return line.discountAmount && Number(line.discountAmount) > 0
          ? `${line.discountLabel ? `${line.discountLabel} ` : ''}${money(line.discountAmount, data)}`
          : '—';
      case 'tax':
        return (
          <>
            <div>{lineTaxAmount(line, data)}</div>
            <div className="item-desc">{lineTaxLabel(line)}</div>
          </>
        );
      case 'amount':
        return money(line.lineTotal, data);
      default:
        return '';
    }
  };

  return (
    <table className={`items items--${config.layout.tableStyle} section`}>
      <colgroup>
        {columns.map((column) => (
          <col key={column.key} style={{ width: `${column.widthPct}%` }} />
        ))}
      </colgroup>
      <thead>
        <tr>
          {columns.map((column) => (
            <th
              key={column.key}
              className={
                column.align === 'right' ? 'num' : column.align === 'center' ? 'center' : ''
              }
            >
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.lines.map((line) => (
          <tr key={line.lineNumber}>
            {columns.map((column) => (
              <td
                key={column.key}
                className={
                  column.align === 'right' ? 'num' : column.align === 'center' ? 'center' : ''
                }
              >
                {cell(line, column.key)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const TotalRow = ({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) => (
  <tr className={className}>
    <td>{label}</td>
    <td className="num">{value}</td>
  </tr>
);

export const TotalsBlock = ({ data, config }: BlockProps) => {
  const { totals } = data;
  const hasDiscount = Number(totals.discountTotal) !== 0;
  const hasAdjustment = Number(totals.adjustment) !== 0;
  const hasRoundOff = Number(totals.roundOff) !== 0;
  const hasPaid =
    totals.amountPaid !== null && totals.amountPaid !== undefined && Number(totals.amountPaid) > 0;

  return (
    <>
      <div className="totals">
        <table>
          <tbody>
            <TotalRow label="Subtotal" value={money(totals.subtotal, data)} />
            {hasDiscount && (
              <TotalRow label="Discount" value={`− ${money(totals.discountTotal, data)}`} />
            )}
            <TotalRow label="Taxable value" value={money(totals.taxableTotal, data)} />
            <TotalRow label="Tax" value={money(totals.taxTotal, data)} />
            {hasAdjustment && (
              <TotalRow label="Adjustment" value={money(totals.adjustment, data)} />
            )}
            {hasRoundOff && <TotalRow label="Round off" value={money(totals.roundOff, data)} />}
            <TotalRow label="Total" value={money(totals.grandTotal, data)} className="grand" />
            {hasPaid && (
              <>
                <TotalRow label="Amount paid" value={money(totals.amountPaid ?? '0', data)} />
                <TotalRow
                  label="Balance due"
                  value={money(totals.balanceDue ?? '0', data)}
                  className="strong"
                />
              </>
            )}
          </tbody>
        </table>
      </div>

      {config.sections.amountInWords && totals.amountInWords && (
        <div className="words block">
          <span className="label">Amount in words</span> {totals.amountInWords}
        </div>
      )}
    </>
  );
};

/** The per-component GST breakdown — CGST and SGST shown separately, as required. */
export const TaxSummaryBlock = ({ data, config }: BlockProps) => {
  const rows = config.sections.hsnSummary
    ? (data.taxSummary.byHsn ?? data.taxSummary.byComponent)
    : data.taxSummary.byComponent;

  if (!config.sections.taxSummary || rows.length === 0) return null;

  return (
    <div className="section block">
      <div className="label">Tax summary</div>
      <table className={`items items--${config.layout.tableStyle}`}>
        <thead>
          <tr>
            <th>{config.sections.hsnSummary ? 'HSN/SAC' : 'Component'}</th>
            <th className="num">Rate</th>
            <th className="num">Taxable value</th>
            <th className="num">Tax</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="summary-row">
              <td>{row.label}</td>
              <td className="num">{row.ratePercent ? formatPercent(row.ratePercent) : '—'}</td>
              <td className="num">{money(row.taxableAmount, data)}</td>
              <td className="num">{money(row.taxAmount, data)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export const BankBlock = ({ data, config }: BlockProps) => {
  if (!config.sections.bankDetails || !data.bank) return null;

  const { bank } = data;

  return (
    <div className="section block">
      <div className="label">Payment details</div>
      <table style={{ width: 'auto' }}>
        <tbody>
          <tr>
            <td className="muted" style={{ paddingRight: '4mm' }}>
              Bank
            </td>
            <td>{bank.bankName}</td>
          </tr>
          <tr>
            <td className="muted">Account name</td>
            <td>{bank.accountName}</td>
          </tr>
          <tr>
            <td className="muted">Account number</td>
            <td>{bank.accountNumber}</td>
          </tr>
          {bank.ifsc && (
            <tr>
              <td className="muted">IFSC</td>
              <td>{bank.ifsc}</td>
            </tr>
          )}
          {bank.swift && (
            <tr>
              <td className="muted">SWIFT</td>
              <td>{bank.swift}</td>
            </tr>
          )}
          {bank.branch && (
            <tr>
              <td className="muted">Branch</td>
              <td>{bank.branch}</td>
            </tr>
          )}
        </tbody>
      </table>
      {config.sections.paymentInstructions && bank.paymentInstructions && (
        <p className="muted" style={{ marginTop: '1.5mm' }}>
          {bank.paymentInstructions}
        </p>
      )}
    </div>
  );
};

export const NotesBlock = ({ data, config }: BlockProps) => (
  <>
    {config.sections.customerMessage && data.customerMessage && (
      <div className="section block">
        <div className="label">Message</div>
        <p style={{ whiteSpace: 'pre-line' }}>{data.customerMessage}</p>
      </div>
    )}
    {config.sections.notes && data.notes && (
      <div className="section block">
        <div className="label">Notes</div>
        <p style={{ whiteSpace: 'pre-line' }}>{data.notes}</p>
      </div>
    )}
    {config.sections.terms && data.terms && (
      <div className="section block">
        <div className="label">Terms &amp; conditions</div>
        <p style={{ whiteSpace: 'pre-line' }}>{data.terms}</p>
      </div>
    )}
    {config.sections.customFields && (data.customFields?.length ?? 0) > 0 && (
      <div className="section block">
        {data.customFields?.map((field) => (
          <div key={field.label}>
            <span className="muted">{field.label}: </span>
            {field.value}
          </div>
        ))}
      </div>
    )}
    {config.sections.declaration && config.content.declarationText && (
      <div className="section block">
        <div className="label">Declaration</div>
        <p style={{ whiteSpace: 'pre-line' }}>{config.content.declarationText}</p>
      </div>
    )}
  </>
);

/**
 * Signature and seal.
 *
 * Two independent images with their own areas (decision Q13) — the seal can sit
 * beside the signature or above it.
 */
export const SignatureBlock = ({ data, config }: BlockProps) => {
  const showSignature = config.sections.signature && config.branding.signature.show;
  const showSeal = config.sections.seal && config.branding.seal.show && data.company.seal;

  if (!showSignature && !showSeal) return null;

  const seal = showSeal ? (
    <div className="seal-block">
      <img src={data.company.seal?.dataUri} alt="" style={{ width: 'var(--seal-width)' }} />
    </div>
  ) : null;

  const stacked = config.branding.seal.position === 'ABOVE_SIGNATURE';

  return (
    <div className="signature-area">
      {!stacked && seal}
      {showSignature && (
        <div className="signature-block">
          {stacked && seal}
          {data.company.signature && (
            <img
              src={data.company.signature.dataUri}
              alt=""
              style={{ width: 'var(--signature-width)' }}
            />
          )}
          <div className="signature-rule">
            <div className="muted">For {data.company.name}</div>
            <div>{data.company.signatureLabel || config.branding.signature.label}</div>
          </div>
        </div>
      )}
      {!showSignature && stacked && seal}
    </div>
  );
};

export const FooterNote = ({ config }: BlockProps) =>
  config.content.footerNote || config.content.thankYouNote ? (
    <div className="footer-note">
      {config.content.thankYouNote && <div>{config.content.thankYouNote}</div>}
      {config.content.footerNote && <div>{config.content.footerNote}</div>}
    </div>
  ) : null;

/** Document number, dates and reference — the metadata every layout shows. */
export const MetaRows = ({ data, config }: BlockProps): { label: string; value: string }[] => {
  const format = config.locale.dateFormat;
  const isInvoice = data.docType === 'INVOICE';

  const rows: { label: string; value: string }[] = [
    { label: isInvoice ? 'Invoice no.' : 'Quotation no.', value: data.number },
    { label: 'Date', value: formatDate(data.dates.document, format) },
  ];

  if (isInvoice && data.dates.due) {
    rows.push({ label: 'Due date', value: formatDate(data.dates.due, format) });
  }
  if (!isInvoice && data.dates.expiry) {
    rows.push({ label: 'Valid until', value: formatDate(data.dates.expiry, format) });
  }
  if (data.reference) rows.push({ label: 'Reference', value: data.reference });
  if (data.customer.placeOfSupply && config.sections.gstDetails) {
    rows.push({ label: 'Place of supply', value: data.customer.placeOfSupply });
  }

  return rows;
};

export const CompanyIdentity = ({ data, config }: BlockProps) => (
  <div>
    <div className="strong" style={{ fontSize: '1.15em' }}>
      {data.company.legalName || data.company.name}
    </div>
    <AddressLines address={data.company.address} />
    {data.company.phone && <div className="muted">{data.company.phone}</div>}
    {data.company.email && <div className="muted">{data.company.email}</div>}
    {config.sections.gstDetails && data.company.gstin && (
      <div className="muted">GSTIN: {data.company.gstin}</div>
    )}
    {config.sections.gstDetails && data.company.pan && (
      <div className="muted">PAN: {data.company.pan}</div>
    )}
  </div>
);

export const Logo = ({ data, config }: BlockProps) =>
  config.branding.logo.show && data.company.logo ? (
    <img
      src={data.company.logo.dataUri}
      alt={data.company.name}
      style={{ width: 'var(--logo-width)', display: 'block' }}
    />
  ) : null;
