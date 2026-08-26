import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FileText, Package, ReceiptText, Search, Users } from 'lucide-react';
import type { SearchHit } from '@app/shared';
import { SEARCH_PLACEHOLDER } from '@/constants/app';
import { dashboardApi, dashboardKeys } from '@/services/dashboard-api';

/**
 * Global search.
 *
 * Debounced, keyboard-navigable, and deliberately thin: it finds a document, a
 * customer or an item and takes you there. What it can find is decided on the
 * server by what your role may read, not by hiding results here.
 */

const ICONS = {
  QUOTATION: FileText,
  INVOICE: ReceiptText,
  CUSTOMER: Users,
  ITEM: Package,
} as const;

const GROUP_LABELS = {
  QUOTATION: 'Quotations',
  INVOICE: 'Invoices',
  CUSTOMER: 'Customers',
  ITEM: 'Products & services',
} as const;

export const GlobalSearch = () => {
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(term.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [term]);

  const query = useQuery({
    queryKey: dashboardKeys.search(debounced),
    queryFn: () => dashboardApi.search(debounced),
    enabled: debounced.length >= 2,
    staleTime: 30_000,
  });

  const hits = query.data?.hits ?? [];

  useEffect(() => setActive(0), [debounced]);

  /* Close when the focus or the pointer leaves the whole control. */
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const go = (hit: SearchHit) => {
    setOpen(false);
    setTerm('');
    navigate(hit.path);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (hits.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => (index + 1) % hits.length);
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => (index - 1 + hits.length) % hits.length);
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const hit = hits[active];
      if (hit) go(hit);
    }
  };

  let lastType: string | null = null;

  return (
    <div className="app-topbar__search position-relative" ref={containerRef}>
      <div className="input-group input-group-sm">
        <span className="input-group-text bg-white border-end-0" id="global-search-icon">
          <Search size={15} aria-hidden />
        </span>
        <input
          type="search"
          className="form-control border-start-0"
          placeholder={SEARCH_PLACEHOLDER}
          aria-label="Global search"
          aria-describedby="global-search-icon"
          aria-expanded={open}
          aria-controls="global-search-results"
          role="combobox"
          value={term}
          onChange={(event) => {
            setTerm(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
      </div>

      {open && debounced.length >= 2 && (
        <div
          id="global-search-results"
          className="card position-absolute w-100 mt-1 shadow-sm"
          style={{ zIndex: 1050, maxHeight: '24rem', overflowY: 'auto' }}
          role="listbox"
        >
          {query.isFetching && hits.length === 0 && (
            <div className="p-3 small text-secondary">Searching…</div>
          )}

          {!query.isFetching && hits.length === 0 && (
            <div className="p-3 small text-secondary">
              Nothing matched “{debounced}”. Numbers, customer names, references and HSN codes are
              all searched.
            </div>
          )}

          <ul className="list-unstyled mb-0">
            {hits.map((hit, index) => {
              const Icon = ICONS[hit.type];
              const showGroup = hit.type !== lastType;
              lastType = hit.type;

              return (
                <li key={`${hit.type}-${hit.id}`}>
                  {showGroup && (
                    <div className="px-3 pt-2 pb-1 label-caps border-top">
                      {GROUP_LABELS[hit.type]}
                    </div>
                  )}
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === active}
                    className={`btn btn-link text-decoration-none text-reset d-block w-100 text-start px-3 py-2${
                      index === active ? ' bg-light' : ''
                    }`}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => go(hit)}
                  >
                    <span className="d-flex align-items-center gap-2">
                      <Icon size={14} className="text-secondary flex-shrink-0" aria-hidden />
                      <span className="text-truncate">
                        <span className="fw-medium">{hit.title}</span>
                        <span className="small text-secondary d-block text-truncate">
                          {hit.subtitle}
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {query.data?.truncated && (
            <div className="px-3 py-2 small text-secondary border-top">
              Showing the closest matches only — open the list pages to filter properly.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
