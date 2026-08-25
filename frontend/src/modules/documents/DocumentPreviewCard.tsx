import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileDown, RefreshCw } from 'lucide-react';
import { ApiError } from '@/services/api-client';

/**
 * The rendered-document pane.
 *
 * The iframe holds the *actual* renderer output — the same HTML Puppeteer turns
 * into the PDF — so nothing here is an approximation of the printed page. It
 * reflects the document as last saved: the totals panel updates as you type, this
 * updates when you save, and the caption says so rather than leaving you to guess.
 */

interface Props {
  /** Query key segment identifying the document being previewed. */
  cacheKey: readonly unknown[];
  fetchHtml: () => Promise<string>;
  enabled: boolean;
  /** Shown instead of the frame when there is nothing to render yet. */
  placeholder: string;
  onDownloadPdf?: () => void;
  downloading?: boolean;
}

const ZOOM_STEPS = [0.5, 0.62, 0.8, 1] as const;

export const DocumentPreviewCard = ({
  cacheKey,
  fetchHtml,
  enabled,
  placeholder,
  onDownloadPdf,
  downloading = false,
}: Props) => {
  const [zoom, setZoom] = useState<number>(0.62);

  const preview = useQuery({
    queryKey: cacheKey,
    queryFn: fetchHtml,
    enabled,
    staleTime: 0,
    gcTime: 0,
  });

  return (
    <div className="card position-sticky" style={{ top: '4.5rem' }}>
      <div className="card-header bg-white d-flex flex-wrap justify-content-between align-items-center gap-2">
        <span className="label-caps">
          Document preview
          {preview.isFetching && (
            <RefreshCw size={12} className="ms-2 text-secondary" aria-hidden />
          )}
        </span>

        <div className="d-flex align-items-center gap-2">
          <label className="small text-secondary mb-0" htmlFor="preview-zoom">
            Zoom
          </label>
          <select
            id="preview-zoom"
            className="form-select form-select-sm"
            style={{ width: 'auto' }}
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          >
            {ZOOM_STEPS.map((step) => (
              <option key={step} value={step}>
                {Math.round(step * 100)}%
              </option>
            ))}
          </select>

          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            disabled={!enabled || preview.isFetching}
            onClick={() => void preview.refetch()}
          >
            <RefreshCw size={13} className="me-1" aria-hidden />
            Refresh
          </button>

          {onDownloadPdf && (
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              disabled={!enabled || downloading}
              onClick={onDownloadPdf}
            >
              <FileDown size={13} className="me-1" aria-hidden />
              {downloading ? 'Preparing…' : 'PDF'}
            </button>
          )}
        </div>
      </div>

      <div className="card-body p-0 overflow-hidden" style={{ background: '#f1f3f5' }}>
        {!enabled && <div className="p-5 text-center text-secondary small">{placeholder}</div>}

        {enabled && preview.isError && (
          <div className="p-4 text-center text-secondary small">
            {preview.error instanceof ApiError
              ? preview.error.message
              : 'Could not render the preview.'}
          </div>
        )}

        {enabled && !preview.isError && (
          <div
            style={{
              /* The frame is a true A4 page scaled down; reserve the scaled height
                 so the card does not collapse behind the transformed content. */
              height: `calc(297mm * ${zoom})`,
              overflow: 'hidden',
            }}
          >
            {preview.data ? (
              <iframe
                title="Document preview"
                srcDoc={preview.data}
                sandbox=""
                style={{
                  width: '210mm',
                  height: '297mm',
                  border: 0,
                  background: '#fff',
                  transform: `scale(${zoom})`,
                  transformOrigin: 'top left',
                  display: 'block',
                }}
              />
            ) : (
              <div className="p-5 text-center text-secondary small">Rendering…</div>
            )}
          </div>
        )}
      </div>

      <div className="card-footer bg-white small text-secondary">
        This is the real renderer output, as the document was last saved — the PDF is produced from
        exactly this HTML.
      </div>
    </div>
  );
};
