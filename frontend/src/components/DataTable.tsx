import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { PaginationMeta } from '@app/shared';
import { Pagination } from './Pagination';
import { EmptyState, ErrorState, TableSkeleton } from './states';

/**
 * The list table every module uses.
 *
 * Wide content scrolls sideways rather than collapsing into cards: finance users
 * compare columns, so preserving the grid matters more than fitting the width.
 */

export interface Column<T> {
  key: string;
  header: string;
  /** Marks a column of figures: right-aligned with tabular numerals. */
  numeric?: boolean;
  sortable?: boolean;
  width?: string;
  render: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  meta?: PaginationMeta;
  onPageChange?: (page: number) => void;
  /** e.g. "-createdAt"; the caller owns the state so it can live in the URL. */
  sort?: string;
  onSortChange?: (sort: string) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  onRowClick?: (row: T) => void;
}

export const DataTable = <T,>({
  columns,
  rows,
  rowKey,
  isLoading = false,
  error = null,
  onRetry,
  meta,
  onPageChange,
  sort,
  onSortChange,
  emptyTitle = 'Nothing here yet',
  emptyDescription,
  emptyAction,
  onRowClick,
}: DataTableProps<T>) => {
  const currentField = sort?.startsWith('-') ? sort.slice(1) : sort;
  const currentDirection = sort?.startsWith('-') ? 'desc' : 'asc';

  const toggleSort = (key: string) => {
    if (!onSortChange) return;
    onSortChange(currentField === key && currentDirection === 'asc' ? `-${key}` : key);
  };

  return (
    <>
      <div className="table-scroll">
        <table className="table table-hover align-middle mb-0">
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={column.numeric ? 'text-numeric' : undefined}
                  style={column.width ? { width: column.width } : undefined}
                  aria-sort={
                    currentField === column.key
                      ? currentDirection === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : undefined
                  }
                >
                  {column.sortable && onSortChange ? (
                    <button
                      type="button"
                      className="btn btn-link btn-sm p-0 text-decoration-none text-reset fw-inherit"
                      onClick={() => toggleSort(column.key)}
                    >
                      {column.header}
                      {currentField === column.key &&
                        (currentDirection === 'asc' ? (
                          <ArrowUp size={12} className="ms-1" aria-hidden />
                        ) : (
                          <ArrowDown size={12} className="ms-1" aria-hidden />
                        ))}
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && <TableSkeleton columns={columns.length} />}

            {!isLoading &&
              rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  style={onRowClick ? { cursor: 'pointer' } : undefined}
                >
                  {columns.map((column) => (
                    <td key={column.key} className={column.numeric ? 'text-numeric' : undefined}>
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {error && <ErrorState message={error} onRetry={onRetry} />}

      {!isLoading && !error && rows.length === 0 && (
        <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
      )}

      {meta && onPageChange && rows.length > 0 && (
        <div className="card-footer bg-white">
          <Pagination meta={meta} onPageChange={onPageChange} />
        </div>
      )}
    </>
  );
};
