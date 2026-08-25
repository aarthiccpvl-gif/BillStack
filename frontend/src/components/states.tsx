import type { ReactNode } from 'react';
import { AlertCircle, Inbox } from 'lucide-react';

/** Shared loading / empty / error states, so every list behaves the same way. */

export const TableSkeleton = ({ columns, rows = 5 }: { columns: number; rows?: number }) => (
  <>
    {Array.from({ length: rows }, (_, rowIndex) => (
      <tr key={rowIndex} aria-hidden>
        {Array.from({ length: columns }, (_, columnIndex) => (
          <td key={columnIndex}>
            <span className="placeholder-glow">
              <span className="placeholder col-8" />
            </span>
          </td>
        ))}
      </tr>
    ))}
  </>
);

export const EmptyState = ({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) => (
  <div className="text-center text-secondary py-5">
    <Inbox size={22} className="mb-2" aria-hidden />
    <div className="fw-medium text-dark">{title}</div>
    {description && <div className="small mt-1">{description}</div>}
    {action && <div className="mt-3">{action}</div>}
  </div>
);

export const ErrorState = ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
  <div className="text-center py-5">
    <AlertCircle size={22} className="text-danger mb-2" aria-hidden />
    <div className="fw-medium">Could not load this</div>
    <div className="small text-secondary mt-1">{message}</div>
    {onRetry && (
      <button type="button" className="btn btn-sm btn-outline-secondary mt-3" onClick={onRetry}>
        Try again
      </button>
    )}
  </div>
);
