import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatNumber } from '../../lib/format';

interface PaginationProps {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  /** Noun for the summary line, e.g. "hostnames". */
  itemLabel?: string;
}

export const Pagination: React.FC<PaginationProps> = ({
  page,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [25, 50, 100, 250],
  itemLabel = 'results',
}) => {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const first = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, totalItems);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-surface-border bg-surface-raised/30">
      <p className="text-micro font-mono text-slate-500 order-2 sm:order-1">
        <span className="text-slate-300">{formatNumber(first)}</span>–
        <span className="text-slate-300">{formatNumber(last)}</span> of{' '}
        <span className="text-slate-300">{formatNumber(totalItems)}</span> {itemLabel}
      </p>

      <div className="flex items-center gap-3 order-1 sm:order-2">
        {onPageSizeChange && (
          <label className="flex items-center gap-2 text-micro font-mono text-slate-500">
            <span className="hidden sm:inline uppercase tracking-wider">Rows</span>
            <select
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              className="bg-background border border-surface-border rounded-md px-2 py-1 text-micro text-slate-300 font-mono hover:border-surface-border-strong focus:border-primary focus:outline-none"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="flex items-center gap-1">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label="Previous page"
            className="p-1.5 rounded-md border border-surface-border text-slate-500 transition-colors hover:text-primary hover:border-primary/40 disabled:opacity-30 disabled:pointer-events-none"
          >
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          </button>

          <span className="text-micro text-slate-400 font-mono px-2 tabular-nums">
            {page} / {totalPages}
          </span>

          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            aria-label="Next page"
            className="p-1.5 rounded-md border border-surface-border text-slate-500 transition-colors hover:text-primary hover:border-primary/40 disabled:opacity-30 disabled:pointer-events-none"
          >
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
};
