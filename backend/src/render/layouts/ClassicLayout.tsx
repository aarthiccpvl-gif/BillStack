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
 * Classic — the traditional Indian tax-invoice shape: everything inside a ruled
 * box, company centred at the top, title in a bar beneath it.
 */
export const classicCss = `
  .classic-frame { border: 0.3mm solid var(--text); }

  .classic-masthead {
    text-align: center;
    padding: 4mm 5mm 3mm;
    border-bottom: 0.3mm solid var(--text);
  }
  .classic-masthead .company { font-size: 1.35em; font-weight: 700; letter-spacing: 0.02em; }
  .classic-masthead address { font-style: normal; }
  .classic-logo { display: flex; justify-content: center; margin-bottom: 2mm; }

  .classic-title {
    text-align: center;
    padding: 2mm;
    border-bottom: 0.3mm solid var(--text);
    background: var(--table-header-bg);
  }
  .classic-title .doc-title { font-size: calc(var(--heading-size) * 0.72); letter-spacing: 0.12em; }

  .classic-meta { display: flex; border-bottom: 0.3mm solid var(--text); }
  .classic-meta > div { flex: 1 1 0; padding: 3mm 4mm; }
  .classic-meta > div + div { border-left: 0.3mm solid var(--text); }
  .classic-meta table td { padding: 0.8mm 0; }
  .classic-meta table td:first-child { color: var(--muted); padding-right: 3mm; }

  .classic-body { padding: 4mm; }

  /* The frame already rules the edges, so the table only needs inner lines. */
  .classic-body .items--BORDERED th,
  .classic-body .items--BORDERED td { border: 0.2mm solid var(--text); }
`;

export const ClassicLayout = ({ data, config }: BlockProps) => {
  const meta = MetaRows({ data, config });
  const half = Math.ceil(meta.length / 2);

  return (
    <div className="page">
      <div className="classic-frame">
        <div className="classic-masthead">
          {config.branding.logo.show && data.company.logo && (
            <div className="classic-logo">
              <Logo data={data} config={config} />
            </div>
          )}
          <div className="company">{data.company.legalName || data.company.name}</div>
          <CompanyIdentity data={data} config={config} />
        </div>

        <div className="classic-title">
          <div className="doc-title">{config.layout.documentTitle}</div>
        </div>

        <div className="classic-meta">
          <div>
            <table>
              <tbody>
                {meta.slice(0, half).map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td className="strong">{row.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <table>
              <tbody>
                {meta.slice(half).map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td className="strong">{row.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="classic-body">
          <PartyBlock data={data} config={config} />

          {data.subject && (
            <div className="section block">
              <span className="label">Subject</span> {data.subject}
            </div>
          )}

          <ItemsTable data={data} config={config} />
          <TotalsBlock data={data} config={config} />
          <TaxSummaryBlock data={data} config={config} />
          <BankBlock data={data} config={config} />
          <NotesBlock data={data} config={config} />
          <SignatureBlock data={data} config={config} />
        </div>
      </div>

      <FooterNote data={data} config={config} />
    </div>
  );
};
