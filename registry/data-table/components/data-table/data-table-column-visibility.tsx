'use client';

import React from 'react';
import { type ReactTable, type Column, type RowData } from '@tanstack/react-table';
import type { DataTableFeatures } from './table-features';
import { Checkbox } from '@/components/ui/checkbox';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface DataTableColumnVisibilityProps<TData extends RowData> {
    table: ReactTable<DataTableFeatures, TData>;
}

export function DataTableColumnVisibility<TData extends RowData>({
    table,
}: DataTableColumnVisibilityProps<TData>) {
    // React Compiler (enabled by default in both official Laravel React starter kits)
    // memoizes this component against TanStack's stable `column` object, but
    // `column.getIsVisible()` changes during render. Opt out so the visibility
    // checkbox re-renders when column visibility changes.
    "use no memo";
    const columns = table
        .getAllLeafColumns()
        .filter((column: Column<DataTableFeatures, TData, unknown>) => column.columnDef.meta?.client_only !== true);

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm hover:bg-accent">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                    <span>Columns</span>
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 p-2" sideOffset={8} align="end">
                <div className="space-y-1">
                    {columns.map((column: Column<DataTableFeatures, TData, unknown>) => (
                        <DropdownMenuItem
                            key={column.id}
                            className="flex items-center gap-2 px-2 py-1.5 text-sm"
                            onSelect={(e: React.MouseEvent<HTMLDivElement>) => e.preventDefault()}
                        >
                            <Checkbox
                                checked={column.getIsVisible()}
                                onCheckedChange={(checked: boolean) => column.toggleVisibility(checked)}
                                className="h-4 w-4"
                            />
                            <span className="truncate">{column.columnDef.header as string}</span>
                        </DropdownMenuItem>
                    ))}
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
