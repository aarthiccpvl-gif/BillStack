import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Info, Lock } from 'lucide-react';
import {
  formatDocumentNumber,
  getFinancialYearBounds,
  toDateOnlyString,
  type NumberingSeriesRecord,
} from '@app/shared';
import { ErrorState } from '@/components/states';
import { useToast } from '@/components/Toast';
import { ApiError } from '@/services/api-client';
import { masterKeys, mastersApi } from '@/services/masters-api';
import { useNumberingSeries } from '@/hooks/useMasters';

const TOKENS = [
  ['{PREFIX}', 'the prefix below'],
  ['{SEQ}', 'the running number, zero-padded'],
  ['{FY_LONG}', '2026-2027'],
  ['{FY_FULL}', '2026-27'],
  ['{FY_SHORT}', '26-27'],
  ['{FY_START}', '2026'],
  ['{YYYY} {MM}', 'from the document date'],
];

/**
 * Document numbering.
 *
 * The preview is rendered by the very same formatter the backend uses to allocate
 * real numbers, so what is shown here is exactly what will be issued.
 */
const SeriesCard = ({
  series,
  canManage,
}: {
  series: NumberingSeriesRecord;
  canManage: boolean;
}) => {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [prefix, setPrefix] = useState(series.prefix);
  const [pattern, setPattern] = useState(series.pattern);
  const [padding, setPadding] = useState(series.padding);

  useEffect(() => {
    setPrefix(series.prefix);
    setPattern(series.pattern);
    setPadding(series.padding);
  }, [series]);

  const locked = series.lastNumber > 0;
  const startYear = getFinancialYearBounds(toDateOnlyString(new Date())).startYear;

  let livePreview = '—';
  let previewError: string | null = null;
  try {
    livePreview = formatDocumentNumber(
      { prefix, pattern, padding },
      { sequence: series.lastNumber + 1, financialYearStart: startYear },
    );
    if (!pattern.includes('{SEQ}') && !/\{SEQ:\d{1,2}\}/.test(pattern)) {
      previewError = 'The pattern must contain {SEQ}, otherwise every number would be identical.';
    }
  } catch {
    previewError = 'That pattern cannot be rendered.';
  }

  const mutation = useMutation({
    mutationFn: () => mastersApi.updateNumberingSeries(series.id, { prefix, pattern, padding }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: masterKeys.numbering() });
      toast.success(`${series.docType === 'INVOICE' ? 'Invoice' : 'Quotation'} numbering updated`);
    },
    onError: (error: unknown) =>
      toast.error(error instanceof ApiError ? error.message : 'Could not save the format.'),
  });

  const dirty =
    prefix !== series.prefix || pattern !== series.pattern || padding !== series.padding;

  return (
    <div className="card mb-3">
      <div className="card-header bg-white d-flex justify-content-between align-items-center">
        <span className="label-caps">
          {series.docType === 'INVOICE' ? 'Invoices' : 'Quotations'}
        </span>
        <span className="text-mono">{series.preview}</span>
      </div>

      <div className="card-body">
        {locked && (
          <div className="alert alert-light border d-flex align-items-start gap-2 py-2 small">
            <Lock size={15} className="flex-shrink-0 mt-1" aria-hidden />
            <div>
              {series.lastNumber} document{series.lastNumber === 1 ? ' has' : 's have'} already been
              numbered this financial year, so the format is locked. It can be changed at the start
              of the next year — otherwise one series would contain two different shapes.
            </div>
          </div>
        )}

        <div className="row">
          <div className="col-md-3 mb-3">
            <label className="form-label" htmlFor={`prefix-${series.id}`}>
              Prefix
            </label>
            <input
              id={`prefix-${series.id}`}
              className="form-control text-mono"
              value={prefix}
              disabled={!canManage || locked}
              onChange={(event) => setPrefix(event.target.value)}
            />
          </div>

          <div className="col-md-5 mb-3">
            <label className="form-label" htmlFor={`pattern-${series.id}`}>
              Pattern
            </label>
            <input
              id={`pattern-${series.id}`}
              className={`form-control text-mono${previewError ? ' is-invalid' : ''}`}
              value={pattern}
              disabled={!canManage || locked}
              onChange={(event) => setPattern(event.target.value)}
            />
            {previewError && <div className="invalid-feedback">{previewError}</div>}
          </div>

          <div className="col-md-2 mb-3">
            <label className="form-label" htmlFor={`padding-${series.id}`}>
              Padding
            </label>
            <input
              id={`padding-${series.id}`}
              type="number"
              min={1}
              max={10}
              className="form-control"
              value={padding}
              disabled={!canManage || locked}
              onChange={(event) => setPadding(Number(event.target.value))}
            />
          </div>

          <div className="col-md-2 mb-3">
            <span className="form-label d-block">Next number</span>
            <div className="form-control-plaintext text-mono fw-medium">{livePreview}</div>
          </div>
        </div>

        <details className="small">
          <summary className="text-secondary">
            <Info size={13} className="me-1" aria-hidden />
            Available tokens
          </summary>
          <ul className="list-unstyled mt-2 mb-0">
            {TOKENS.map(([token, meaning]) => (
              <li key={token}>
                <code>{token}</code> <span className="text-secondary">— {meaning}</span>
              </li>
            ))}
          </ul>
        </details>
      </div>

      {canManage && !locked && (
        <div className="card-footer bg-white d-flex justify-content-end">
          <button
            type="button"
            className="btn btn-sm btn-primary"
            disabled={!dirty || Boolean(previewError) || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? 'Saving…' : 'Save format'}
          </button>
        </div>
      )}
    </div>
  );
};

export const NumberingTab = ({ canManage }: { canManage: boolean }) => {
  const query = useNumberingSeries();

  if (query.isError) {
    return (
      <ErrorState
        message={query.error instanceof ApiError ? query.error.message : 'Unexpected error.'}
        onRetry={() => void query.refetch()}
      />
    );
  }

  return (
    <>
      {(query.data ?? []).map((series) => (
        <SeriesCard key={series.id} series={series} canManage={canManage} />
      ))}
      <p className="small text-secondary">
        Numbers are allocated by the server inside the same transaction that saves the document, so
        two people saving at once can never receive the same number. The sequence restarts at the
        beginning of each financial year.
      </p>
    </>
  );
};
