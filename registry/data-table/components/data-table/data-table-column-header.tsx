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

    // Accessible label that communicates the column, its current sorting state,
    // and the action the next click will perform.
    const ariaLabel = canSort
        ? `Sort by ${headerTitle}, currently ${currentState}. ${nextActionText}`
        : headerTitle;

    return (
        <TableHead
            className="px-4 py-3 text-left align-middle font-medium text-muted-foreground"
            scope="col"
            aria-sort={
                // `aria-sort` identifies the primary sorted column only. With
                // multi-column sorting, secondary sorted columns get "none"
                // instead of "ascending"/"descending" to avoid ambiguous
                // multi-column sort announcements; their state is conveyed
                // through the accessible label instead.
                canSort
                    ? column.getSortIndex() === 0
                        ? isSorted === 'asc'
                            ? 'ascending'
                            : 'descending'
                        : 'none'
                    : undefined
            }
        >
            <div className="flex items-center gap-1 min-w-0">
                {canSort ? (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={(event) => toggleSorting?.(event)}
                        className="-ml-3 h-8 text-xs font-medium hover:bg-accent data-[state=open]:bg-accent"
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
