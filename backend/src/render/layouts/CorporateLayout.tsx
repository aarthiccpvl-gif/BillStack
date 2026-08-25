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
 * Corporate — a solid colour banner, logo left, document metadata in a panel on
 * the right. Dense and formal; the default for invoices.
 */
export const corporateCss = `
  .corporate-banner {
    background: var(--primary);
    color: #fff;
    padding: 5mm var(--margin-right) 5mm var(--margin-left);
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 6mm;
  }
  .corporate-banner .doc-title { color: #fff; }
  .corporate-banner .logo-slot { background: #fff; padding: 2mm; border-radius: 1mm; }

  .corporate-head {
    display: flex;
    justify-content: space-between;
    gap: 8mm;
    /* The page padding already separates this from the banner; adding the section
       gap on top of it leaves an obvious hole. */
    margin-top: 0;
  }
  .corporate-meta { min-width: 62mm; }
  .corporate-meta table { width: 100%; }
  .corporate-meta td { padding: 1mm 0; }
  .corporate-meta td:first-child { color: var(--muted); padding-right: 4mm; }
  .corporate-meta td:last-child { text-align: right; font-weight: 600; }

  .corporate-lower { display: flex; gap: 6mm; align-items: flex-start; }
  .corporate-lower > * { flex: 1 1 0; }
`;

export const CorporateLayout = ({ data, config }: BlockProps) => {
  const meta = MetaRows({ data, config });

  return (
    <>
      <div className="corporate-banner">
        {config.branding.logo.show && data.company.logo && (
          <div className="logo-slot">
            <Logo data={data} config={config} />
          </div>
        )}
        <div className="doc-title">{config.layout.documentTitle}</div>
      </div>

      <div className="page">
        <div className="corporate-head">
          <CompanyIdentity data={data} config={config} />
          <div className="corporate-meta block">
            <table>
              <tbody>
                {meta.map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td>{row.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <PartyBlock data={data} config={config} />

        {data.subject && (
          <div className="section block">
            <span className="label">Subject</span> {data.subject}
          </div>
        )}

        <ItemsTable data={data} config={config} />
        <TotalsBlock data={data} config={config} />

        <div className="corporate-lower section">
          <TaxSummaryBlock data={data} config={config} />
          <BankBlock data={data} config={config} />
        </div>

        <NotesBlock data={data} config={config} />
        <SignatureBlock data={data} config={config} />
        <FooterNote data={data} config={config} />
      </div>
    </>
  );
};
