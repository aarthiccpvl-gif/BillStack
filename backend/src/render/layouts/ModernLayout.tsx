import {
  BankBlock,
  CompanyIdentity,
  FooterNote,
  ItemsTable,
  Logo,
  MetaRows,
  NotesBlock,
  PartyBlock,
  SignatureBlock,
  TaxSummaryBlock,
  TotalsBlock,
  type BlockProps,
} from '../blocks';

/**
 * Modern — no banner. A large title, a thin accent rule and generous whitespace,
 * with the metadata inline rather than boxed.
 */
export const modernCss = `
  .modern-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 8mm; }
  .modern-title .doc-title { color: var(--primary); }
  .modern-number {
    margin-top: 1mm;
    font-size: 1.15em;
    font-weight: 600;
    letter-spacing: 0.02em;
  }
  .modern-rule {
    height: 1mm;
    background: var(--primary);
    margin-top: 4mm;
    width: 28mm;
  }

  .modern-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6mm 10mm;
    margin-top: var(--section-gap);
    padding: 3mm 0;
    border-top: 0.2mm solid var(--border);
    border-bottom: 0.2mm solid var(--border);
  }
  .modern-meta .label { display: block; margin-bottom: 0.6mm; }
  .modern-meta .value { font-weight: 600; }

  .modern-lower { display: flex; gap: 8mm; align-items: flex-start; }
  .modern-lower > * { flex: 1 1 0; }

  /* A lighter table suits the airier layout. */
  .items--MINIMAL thead th { background: transparent; border-bottom: 0.4mm solid var(--primary); }
`;

export const ModernLayout = ({ data, config }: BlockProps) => {
  const meta = MetaRows({ data, config });

  return (
    <div className="page">
      <div className="modern-head">
        <div className="modern-title">
          <div className="doc-title">{config.layout.documentTitle}</div>
          <div className="modern-number">{data.number}</div>
          <div className="modern-rule" />
        </div>
        <div style={{ textAlign: 'right' }}>
          {config.branding.logo.show && data.company.logo && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '2.5mm' }}>
              <Logo data={data} config={config} />
            </div>
          )}
          <CompanyIdentity data={data} config={config} />
        </div>
      </div>

      <div className="modern-meta block">
        {meta
          .filter((row) => !row.label.toLowerCase().includes('no.'))
          .map((row) => (
            <div key={row.label}>
              <span className="label">{row.label}</span>
              <span className="value">{row.value}</span>
            </div>
          ))}
      </div>

      <PartyBlock data={data} config={config} />

      {data.subject && (
        <div className="section block">
          <span className="label">Subject</span> {data.subject}
        </div>
      )}

      <ItemsTable data={data} config={config} />
      <TotalsBlock data={data} config={config} />

      <div className="modern-lower section">
        <TaxSummaryBlock data={data} config={config} />
        <BankBlock data={data} config={config} />
      </div>

      <NotesBlock data={data} config={config} />
      <SignatureBlock data={data} config={config} />
      <FooterNote data={data} config={config} />
    </div>
  );
};
