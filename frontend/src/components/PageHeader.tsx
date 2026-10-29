import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export interface Crumb {
  label: string;
  to?: string;
}

interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: Crumb[];
  actions?: ReactNode;
}

export const PageHeader = ({ title, description, breadcrumbs, actions }: PageHeaderProps) => (
  <div className="page-header d-flex flex-wrap align-items-start justify-content-between gap-3 mb-4">
    <div>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb">
          <ol className="breadcrumb mb-1 small">
            {breadcrumbs.map((crumb, index) => {
              const isLast = index === breadcrumbs.length - 1;
              return (
                <li
                  key={`${crumb.label}-${index}`}
                  className={`breadcrumb-item${isLast ? ' active' : ''}`}
                  aria-current={isLast ? 'page' : undefined}
                >
                  {crumb.to && !isLast ? <Link to={crumb.to}>{crumb.label}</Link> : crumb.label}
                </li>
              );
            })}
          </ol>
        </nav>
      )}
      <h1 className="page-title">{title}</h1>
      {description && <p className="text-secondary mb-0 mt-1">{description}</p>}
    </div>
    {actions && (
      <div className="page-header__actions d-flex flex-wrap align-items-center gap-2">
        {actions}
      </div>
    )}
  </div>
);
