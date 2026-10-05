'use client';

import React from 'react';
import { type Table, type Column } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface DataTableColumnVisibilityProps<TData extends Record<string, unknown>> {
    table: Table<TData>;
}

export function DataTableColumnVisibility<TData extends Record<string, unknown>>({
    table,
}: DataTableColumnVisibilityProps<TData>) {
    const columns = table.getAllLeafColumns();

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
                    {columns.map((column: Column<TData, unknown>) => (
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