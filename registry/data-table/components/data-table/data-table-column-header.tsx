'use client';

import { type Column, type Header, type RowData, flexRender } from '@tanstack/react-table';
import type { DataTableFeatures } from './table-features';
import { Button } from '@/components/ui/button';
import { TableHead } from '@/components/ui/table';

interface DataTableColumnHeaderProps<TData extends RowData> {
    header: Header<DataTableFeatures, TData, unknown>;
    column: Column<DataTableFeatures, TData, unknown>;
}

export function DataTableColumnHeader<TData extends RowData>({
    header,
    column,
}: DataTableColumnHeaderProps<TData>) {
    // React Compiler (enabled by default in both official Laravel React starter kits)
    // memoizes this component against TanStack's stable `column` object, but
    // `column.getIsSorted()` changes during render. Opt out so the sort arrow
    // re-renders when the sort state changes.
    "use no memo";
    const canSort = column.getCanSort();
    const headerTitle = typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id;
    const isSorted = column.getIsSorted();
    const toggleSorting = column.getToggleSortingHandler();

    // Derive the announced next action from TanStack Table so the label matches
    // the actual toggle behavior for both ascending-first columns (default) and
    // descending-first columns (via column-level `sortDescFirst`). Relying on
    // `getNextSortingOrder()` keeps the label consistent regardless of column
    // configuration.
    const nextSortingOrder = column.getNextSortingOrder();
    const currentState = isSorted === false
        ? 'unsorted'
        : isSorted === 'asc'
            ? 'sorted ascending'
            : 'sorted descending';
    const nextActionText = nextSortingOrder === false
        ? 'Click to clear sorting.'
        : nextSortingOrder === 'desc'
            ? 'Click to sort descending.'
            : 'Click to sort ascending.';
    const sortIndex = column.getSortIndex();
    // 1-based position in the sorting state; only meaningful when sorted.
    const sortPriority = sortIndex === -1 ? undefined : sortIndex + 1;
    const priorityText = sortPriority !== undefined && sortPriority > 1
        ? `Secondary sort, priority ${sortPriority}. `
        : '';

    // Accessible label that communicates the column, its current sorting state,
    // its priority within multi-sort, and the action the next click will perform.
    const ariaLabel = canSort
        ? `Sort by ${headerTitle}, ${priorityText}currently ${currentState}. ${nextActionText}`
        : headerTitle;

    // Column alignment, defaulting to left for backward compatibility.
    const align = (column.columnDef.meta?.align ?? 'left') as 'left' | 'center' | 'right';

    // Explicit Tailwind class mappings; never dynamically constructed class names.
    const textAlign = {
        left: 'text-left',
        center: 'text-center',
        right: 'text-right',
    }[align];
    const justify = {
        left: 'justify-start',
        center: 'justify-center',
        right: 'justify-end',
    }[align];

    return (
        <TableHead
            className={`px-4 py-3 ${textAlign} align-middle font-medium text-muted-foreground`}
            scope="col"
            aria-sort={
                // Apply aria-sort to the primary sorted column only. Omit the
                // attribute from secondary and unsorted sortable columns so
                // screen readers announce a single sort state at a time, per
                // WAI-ARIA / MDN guidance. Multi-sort priority and state are
                // communicated through the accessible label instead.
                canSort && column.getSortIndex() === 0
                    ? isSorted === 'asc'
                        ? 'ascending'
                        : 'descending'
                    : undefined
            }
        >
            <div className={`flex items-center gap-1 min-w-0 ${justify}`}>
                {canSort ? (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={(event) => toggleSorting?.(event)}
                        className={
                            align === 'left'
                                ? '-ml-3 h-8 text-xs font-medium hover:bg-accent data-[state=open]:bg-accent'
                                : 'h-8 text-xs font-medium hover:bg-accent data-[state=open]:bg-accent'
                        }
                        aria-label={ariaLabel}
                    >
                        <span className="truncate">{flexRender(column.columnDef.header!, header.getContext())}</span>
                        {isSorted === 'asc' ? (
                            <span className="ml-1 text-xs" aria-hidden="true">↑</span>
                        ) : isSorted === 'desc' ? (
                            <span className="ml-1 text-xs" aria-hidden="true">↓</span>
                        ) : (
                            <span className="ml-1 text-xs text-muted-foreground/60" aria-hidden="true">↕</span>
                        )}
                    </Button>
                ) : (
                    <span className="truncate text-xs font-medium">{flexRender(column.columnDef.header!, header.getContext())}</span>
                )}
            </div>
        </TableHead>
    );
}
