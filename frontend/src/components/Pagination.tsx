import type { PaginationMeta } from '@app/shared';

interface PaginationProps {
  meta: PaginationMeta;
  onPageChange: (page: number) => void;
}

const rangeLabel = (meta: PaginationMeta): string => {
  if (meta.total === 0) return 'No records';
  const first = (meta.page - 1) * meta.pageSize + 1;
  const last = Math.min(meta.page * meta.pageSize, meta.total);
  return `${first}–${last} of ${meta.total}`;
};

export const Pagination = ({ meta, onPageChange }: PaginationProps) => (
  <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
    <span className="small text-secondary text-numeric">{rangeLabel(meta)}</span>

    {meta.totalPages > 1 && (
      <nav aria-label="Pagination">
        <ul className="pagination pagination-sm mb-0">
          <li className={`page-item${meta.page <= 1 ? ' disabled' : ''}`}>
            <button
              type="button"
              className="page-link"
              onClick={() => onPageChange(meta.page - 1)}
              disabled={meta.page <= 1}
            >
              Previous
            </button>
          </li>
          <li className="page-item disabled">
            <span className="page-link text-numeric">
              {meta.page} / {meta.totalPages}
            </span>
          </li>
          <li className={`page-item${meta.page >= meta.totalPages ? ' disabled' : ''}`}>
            <button
              type="button"
              className="page-link"
              onClick={() => onPageChange(meta.page + 1)}
              disabled={meta.page >= meta.totalPages}
            >
              Next
            </button>
          </li>
        </ul>
      </nav>
    )}
  </div>
);
