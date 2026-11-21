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
    const canSort = column.columnDef.enableSorting === true;
    const headerTitle = typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id;

    return (
        <TableHead
            className="px-4 py-3 text-left align-middle font-medium text-muted-foreground"
            scope="col"
            aria-sort={
                canSort
                    ? column.getIsSorted() === 'asc'
                        ? 'ascending'
                        : column.getIsSorted() === 'desc'
                        ? 'descending'
                        : 'none'
                    : undefined
            }
        >
            <div className="flex items-center gap-1 min-w-0">
                {canSort ? (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
                        className="-ml-3 h-8 text-xs font-medium hover:bg-accent data-[state=open]:bg-accent"
                        aria-label={`Sort by ${headerTitle}`}
                    >
                        <span className="truncate">{flexRender(column.columnDef.header!, header.getContext())}</span>
                        {column.getIsSorted() === 'asc' ? (
                            <span className="ml-1 text-xs" aria-hidden="true">↑</span>
                        ) : column.getIsSorted() === 'desc' ? (
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
