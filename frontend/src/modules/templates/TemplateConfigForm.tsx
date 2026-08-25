import {
  FONT_LABELS,
  ITEM_COLUMN_LABELS,
  type ItemColumnKey,
  type TemplateConfig,
} from '@app/shared';

/**
 * The configuration panel.
 *
 * Deliberately a closed set of controls rather than a code editor — everything
 * here maps to a validated field, so a template can never be saved in a state the
 * renderer cannot handle.
 */

interface Props {
  config: TemplateConfig;
  onChange: (next: TemplateConfig) => void;
  disabled: boolean;
}

const clone = (config: TemplateConfig): TemplateConfig =>
  JSON.parse(JSON.stringify(config)) as TemplateConfig;

const SECTION_LABELS: Record<keyof TemplateConfig['sections'], string> = {
  billingAddress: 'Billing address',
  shippingAddress: 'Shipping address',
  gstDetails: 'GST / tax numbers',
  taxSummary: 'Tax summary',
  hsnSummary: 'Summarise tax by HSN instead of component',
  bankDetails: 'Bank details',
  paymentInstructions: 'Payment instructions',
  notes: 'Notes',
  terms: 'Terms & conditions',
  customerMessage: 'Customer message',
  customFields: 'Custom fields',
  amountInWords: 'Amount in words',
  signature: 'Signature',
  seal: 'Company seal',
  declaration: 'Declaration',
};

export const TemplateConfigForm = ({ config, onChange, disabled }: Props) => {
  const update = (mutate: (draft: TemplateConfig) => void) => {
    const draft = clone(config);
    mutate(draft);
    onChange(draft);
  };

  const visibleWidth = config.layout.itemColumns
    .filter((column) => column.show)
    .reduce((sum, column) => sum + column.widthPct, 0);

  const widthOk = Math.abs(visibleWidth - 100) <= 0.5;

  return (
    <div className="accordion" id="template-config">
      {/* --- branding --- */}
      <div className="accordion-item">
        <h2 className="accordion-header">
          <button
            className="accordion-button"
            type="button"
            data-bs-toggle="collapse"
            data-bs-target="#cfg-branding"
            aria-expanded="true"
          >
            Branding
          </button>
        </h2>
        <div id="cfg-branding" className="accordion-collapse collapse show">
          <div className="accordion-body">
            <div className="row g-3">
              <div className="col-6">
                <label className="form-label" htmlFor="logo-show">
                  Logo
                </label>
                <div className="form-check form-switch">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="logo-show"
                    disabled={disabled}
                    checked={config.branding.logo.show}
                    onChange={(event) =>
                      update((draft) => (draft.branding.logo.show = event.target.checked))
                    }
                  />
                  <label className="form-check-label small" htmlFor="logo-show">
                    Show the company logo
                  </label>
                </div>
              </div>

              <div className="col-6">
                <label className="form-label" htmlFor="logo-width">
                  Logo width ({config.branding.logo.widthMm} mm)
                </label>
                <input
                  id="logo-width"
                  type="range"
                  className="form-range"
                  min={15}
                  max={80}
                  disabled={disabled || !config.branding.logo.show}
                  value={config.branding.logo.widthMm}
                  onChange={(event) =>
                    update((draft) => (draft.branding.logo.widthMm = Number(event.target.value)))
                  }
                />
              </div>

              {(['primary', 'secondary', 'tableHeaderBg', 'border'] as const).map((key) => (
                <div className="col-6 col-xl-3" key={key}>
                  <label className="form-label small" htmlFor={`color-${key}`}>
                    {key === 'tableHeaderBg' ? 'Table header' : key}
                  </label>
                  <input
                    id={`color-${key}`}
                    type="color"
                    className="form-control form-control-color w-100"
                    disabled={disabled}
                    value={config.branding.colors[key]}
                    onChange={(event) =>
                      update((draft) => (draft.branding.colors[key] = event.target.value))
                    }
                  />
                </div>
              ))}

              <div className="col-6">
                <label className="form-label" htmlFor="sig-width">
                  Signature width ({config.branding.signature.widthMm} mm)
                </label>
                <input
                  id="sig-width"
                  type="range"
                  className="form-range"
                  min={15}
                  max={70}
                  disabled={disabled}
                  value={config.branding.signature.widthMm}
                  onChange={(event) =>
                    update(
                      (draft) => (draft.branding.signature.widthMm = Number(event.target.value)),
                    )
                  }
                />
              </div>

              <div className="col-6">
                <label className="form-label" htmlFor="seal-width">
                  Seal width ({config.branding.seal.widthMm} mm)
                </label>
                <input
                  id="seal-width"
                  type="range"
                  className="form-range"
                  min={15}
                  max={70}
                  disabled={disabled}
                  value={config.branding.seal.widthMm}
                  onChange={(event) =>
                    update((draft) => (draft.branding.seal.widthMm = Number(event.target.value)))
                  }
                />
              </div>

              <div className="col-12">
                <label className="form-label" htmlFor="seal-position">
                  Seal position
                </label>
                <select
                  id="seal-position"
                  className="form-select"
                  disabled={disabled}
                  value={config.branding.seal.position}
                  onChange={(event) =>
                    update(
                      (draft) =>
                        (draft.branding.seal.position = event.target
                          .value as TemplateConfig['branding']['seal']['position']),
                    )
                  }
                >
                  <option value="BESIDE_SIGNATURE">Beside the signature</option>
                  <option value="ABOVE_SIGNATURE">Above the signature</option>
                </select>
              </div>

              <div className="col-12">
                <label className="form-label" htmlFor="sig-label">
                  Signature label
                </label>
                <input
                  id="sig-label"
                  className="form-control"
                  disabled={disabled}
                  value={config.branding.signature.label}
                  onChange={(event) =>
                    update((draft) => (draft.branding.signature.label = event.target.value))
                  }
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* --- typography and layout --- */}
      <div className="accordion-item">
        <h2 className="accordion-header">
          <button
            className="accordion-button collapsed"
            type="button"
            data-bs-toggle="collapse"
            data-bs-target="#cfg-layout"
          >
            Typography &amp; layout
          </button>
        </h2>
        <div id="cfg-layout" className="accordion-collapse collapse">
          <div className="accordion-body">
            <div className="row g-3">
              <div className="col-6">
                <label className="form-label" htmlFor="doc-title">
                  Document title
                </label>
                <input
                  id="doc-title"
                  className="form-control"
                  disabled={disabled}
                  value={config.layout.documentTitle}
                  onChange={(event) =>
                    update((draft) => (draft.layout.documentTitle = event.target.value))
                  }
                />
              </div>

              <div className="col-6">
                <label className="form-label" htmlFor="font-family">
                  Typeface
                </label>
                <select
                  id="font-family"
                  className="form-select"
                  disabled={disabled}
                  value={config.typography.fontFamily}
                  onChange={(event) =>
                    update(
                      (draft) =>
                        (draft.typography.fontFamily = event.target
                          .value as TemplateConfig['typography']['fontFamily']),
                    )
                  }
                >
                  {Object.entries(FONT_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-6">
                <label className="form-label" htmlFor="base-size">
                  Body size ({config.typography.baseSizePt} pt)
                </label>
                <input
                  id="base-size"
                  type="range"
                  className="form-range"
                  min={7}
                  max={12}
                  step={0.5}
                  disabled={disabled}
                  value={config.typography.baseSizePt}
                  onChange={(event) =>
                    update((draft) => (draft.typography.baseSizePt = Number(event.target.value)))
                  }
                />
              </div>

              <div className="col-6">
                <label className="form-label" htmlFor="table-size">
                  Table size ({config.typography.tableSizePt} pt)
                </label>
                <input
                  id="table-size"
                  type="range"
                  className="form-range"
                  min={6}
                  max={11}
                  step={0.5}
                  disabled={disabled}
                  value={config.typography.tableSizePt}
                  onChange={(event) =>
                    update((draft) => (draft.typography.tableSizePt = Number(event.target.value)))
                  }
                />
              </div>

              <div className="col-6">
                <label className="form-label" htmlFor="table-style">
                  Table style
                </label>
                <select
                  id="table-style"
                  className="form-select"
                  disabled={disabled}
                  value={config.layout.tableStyle}
                  onChange={(event) =>
                    update(
                      (draft) =>
                        (draft.layout.tableStyle = event.target
                          .value as TemplateConfig['layout']['tableStyle']),
                    )
                  }
                >
                  <option value="BORDERED">Bordered</option>
                  <option value="STRIPED">Striped</option>
                  <option value="MINIMAL">Minimal</option>
                </select>
              </div>

              <div className="col-6">
                <label className="form-label" htmlFor="date-format">
                  Date format
                </label>
                <select
                  id="date-format"
                  className="form-select"
                  disabled={disabled}
                  value={config.locale.dateFormat}
                  onChange={(event) =>
                    update(
                      (draft) =>
                        (draft.locale.dateFormat = event.target
                          .value as TemplateConfig['locale']['dateFormat']),
                    )
                  }
                >
                  <option value="dd-MMM-yyyy">24-Aug-2026</option>
                  <option value="dd/MM/yyyy">24/08/2026</option>
                  <option value="yyyy-MM-dd">2026-08-24</option>
                </select>
              </div>

              {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
                <div className="col-3" key={side}>
                  <label className="form-label small" htmlFor={`margin-${side}`}>
                    {side} ({config.layout.marginsMm[side]}mm)
                  </label>
                  <input
                    id={`margin-${side}`}
                    type="number"
                    className="form-control"
                    min={5}
                    max={40}
                    disabled={disabled}
                    value={config.layout.marginsMm[side]}
                    onChange={(event) =>
                      update((draft) => (draft.layout.marginsMm[side] = Number(event.target.value)))
                    }
                  />
                </div>
              ))}

              <div className="col-12">
                <div className="form-check form-switch">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="page-numbers"
                    disabled={disabled}
                    checked={config.layout.footer.showPageNumbers}
                    onChange={(event) =>
                      update(
                        (draft) => (draft.layout.footer.showPageNumbers = event.target.checked),
                      )
                    }
                  />
                  <label className="form-check-label small" htmlFor="page-numbers">
                    Page numbers in the footer
                  </label>
                </div>
                <div className="form-check form-switch">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="header-all-pages"
                    disabled={disabled}
                    checked={config.layout.showHeaderOnAllPages}
                    onChange={(event) =>
                      update((draft) => (draft.layout.showHeaderOnAllPages = event.target.checked))
                    }
                  />
                  <label className="form-check-label small" htmlFor="header-all-pages">
                    Repeat company name and document number at the top of every page
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* --- item columns --- */}
      <div className="accordion-item">
        <h2 className="accordion-header">
          <button
            className="accordion-button collapsed"
            type="button"
            data-bs-toggle="collapse"
            data-bs-target="#cfg-columns"
          >
            Item columns
          </button>
        </h2>
        <div id="cfg-columns" className="accordion-collapse collapse">
          <div className="accordion-body">
            <div className={`alert py-2 small ${widthOk ? 'alert-light border' : 'alert-warning'}`}>
              Visible columns total <strong>{visibleWidth.toFixed(1)}%</strong> of the table width.
              {widthOk ? ' That adds up.' : ' They must total 100% before this can be saved.'}
            </div>

            <table className="table table-sm align-middle">
              <thead>
                <tr>
                  <th>Show</th>
                  <th>Column</th>
                  <th>Heading</th>
                  <th className="text-numeric">Width %</th>
                </tr>
              </thead>
              <tbody>
                {config.layout.itemColumns.map((column, index) => (
                  <tr key={column.key}>
                    <td>
                      <input
                        type="checkbox"
                        className="form-check-input"
                        disabled={disabled}
                        aria-label={`Show ${ITEM_COLUMN_LABELS[column.key as ItemColumnKey]}`}
                        checked={column.show}
                        onChange={(event) =>
                          update((draft) => {
                            const target = draft.layout.itemColumns[index];
                            if (target) target.show = event.target.checked;
                          })
                        }
                      />
                    </td>
                    <td className="small">{ITEM_COLUMN_LABELS[column.key as ItemColumnKey]}</td>
                    <td>
                      <input
                        className="form-control form-control-sm"
                        disabled={disabled || !column.show}
                        value={column.label}
                        onChange={(event) =>
                          update((draft) => {
                            const target = draft.layout.itemColumns[index];
                            if (target) target.label = event.target.value;
                          })
                        }
                      />
                    </td>
                    <td style={{ width: '6rem' }}>
                      <input
                        type="number"
                        className="form-control form-control-sm text-numeric"
                        min={2}
                        max={60}
                        disabled={disabled || !column.show}
                        value={column.widthPct}
                        onChange={(event) =>
                          update((draft) => {
                            const target = draft.layout.itemColumns[index];
                            if (target) target.widthPct = Number(event.target.value);
                          })
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* --- sections --- */}
      <div className="accordion-item">
        <h2 className="accordion-header">
          <button
            className="accordion-button collapsed"
            type="button"
            data-bs-toggle="collapse"
            data-bs-target="#cfg-sections"
          >
            Sections
          </button>
        </h2>
        <div id="cfg-sections" className="accordion-collapse collapse">
          <div className="accordion-body">
            <div className="row">
              {(Object.keys(SECTION_LABELS) as (keyof TemplateConfig['sections'])[]).map((key) => (
                <div className="col-12 col-md-6" key={key}>
                  <div className="form-check form-switch mb-2">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id={`section-${key}`}
                      disabled={disabled}
                      checked={config.sections[key]}
                      onChange={(event) =>
                        update((draft) => (draft.sections[key] = event.target.checked))
                      }
                    />
                    <label className="form-check-label small" htmlFor={`section-${key}`}>
                      {SECTION_LABELS[key]}
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* --- fixed text --- */}
      <div className="accordion-item">
        <h2 className="accordion-header">
          <button
            className="accordion-button collapsed"
            type="button"
            data-bs-toggle="collapse"
            data-bs-target="#cfg-content"
          >
            Fixed text
          </button>
        </h2>
        <div id="cfg-content" className="accordion-collapse collapse">
          <div className="accordion-body">
            <div className="mb-3">
              <label className="form-label" htmlFor="thank-you">
                Closing note
              </label>
              <input
                id="thank-you"
                className="form-control"
                disabled={disabled}
                value={config.content.thankYouNote}
                onChange={(event) =>
                  update((draft) => (draft.content.thankYouNote = event.target.value))
                }
              />
            </div>
            <div className="mb-3">
              <label className="form-label" htmlFor="footer-note">
                Footer note
              </label>
              <input
                id="footer-note"
                className="form-control"
                disabled={disabled}
                value={config.content.footerNote}
                onChange={(event) =>
                  update((draft) => (draft.content.footerNote = event.target.value))
                }
              />
            </div>
            <div>
              <label className="form-label" htmlFor="declaration">
                Declaration
              </label>
              <textarea
                id="declaration"
                rows={3}
                className="form-control"
                disabled={disabled}
                value={config.content.declarationText}
                onChange={(event) =>
                  update((draft) => (draft.content.declarationText = event.target.value))
                }
              />
              <div className="form-text">
                Only printed when the Declaration section is switched on.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
