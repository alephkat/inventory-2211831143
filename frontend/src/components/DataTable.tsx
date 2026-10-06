import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import { cn } from '@/lib/format';
import { Button, EmptyState, LoadingBlock } from './ui';

export interface Column<T> {
  key: string;
  header: string;
  /** Cell renderer. Receives the whole row so cells can render siblings. */
  render: (row: T) => ReactNode;
  className?: string;
  headerClassName?: string;
  /** Hidden below the `lg` breakpoint to keep dense tables readable. */
  secondary?: boolean;
}

interface DataTableProps<T> {
  columns: Array<Column<T>>;
  rows: T[];
  rowKey: (row: T) => string;
  isLoading?: boolean;
  error?: unknown;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  onRowClick?: (row: T) => void;
}

/**
 * Table shell: loading, error and empty states are handled here so no page has
 * to re-implement them. `secondary` columns collapse to stacked label/value
 * pairs on narrow screens via the `data-label` attribute the cells carry.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  isLoading = false,
  error,
  emptyTitle = 'Nothing to show',
  emptyDescription,
  emptyAction,
  onRowClick,
}: DataTableProps<T>) {
  if (isLoading) return <LoadingBlock />;

  if (error) {
    return (
      <div className="p-5">
        <EmptyState
          title="Could not load this data"
          description={error instanceof Error ? error.message : 'An unexpected error occurred.'}
          icon={<Inbox className="h-10 w-10" />}
        />
      </div>
    );
  }

  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} icon={<Inbox className="h-10 w-10" />} />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className={cn('th', column.secondary && 'hidden lg:table-cell', column.headerClassName)}
                scope="col"
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn('bg-white transition', onRowClick && 'cursor-pointer hover:bg-slate-50')}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  data-label={column.header}
                  className={cn('td', column.secondary && 'hidden lg:table-cell', column.className)}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface PaginationProps {
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
  onLimitChange?: (limit: number) => void;
}

const LIMIT_OPTIONS = [10, 20, 50, 100];

export function Pagination({ page, limit, total, onPageChange, onLimitChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const first = total === 0 ? 0 : (page - 1) * limit + 1;
  const last = Math.min(page * limit, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
      <p className="text-xs text-slate-500">
        Showing <span className="font-medium text-slate-700">{first}</span>–
        <span className="font-medium text-slate-700">{last}</span> of{' '}
        <span className="font-medium text-slate-700">{total}</span>
      </p>

      <div className="flex items-center gap-3">
        {onLimitChange ? (
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            Rows
            <select
              value={limit}
              onChange={(event) => onLimitChange(Number(event.target.value))}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              {LIMIT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <div className="flex items-center gap-1">
          <Button
            variant="secondary"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="px-2 text-xs text-slate-600">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}