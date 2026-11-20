'use client';

import { type ReactTable, type Column, type RowData } from '@tanstack/react-table';
import type { DataTableFeatures } from './table-features';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
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
                <Button variant="outline" size="sm" className="h-8 gap-2 text-xs">
                    <svg className="h-4 w-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h18M3 10h18M3 16h18" />
                    </svg>
                    <span>Columns</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-48 p-1.5" sideOffset={6} align="end">
                <DropdownMenuLabel className="px-2 py-1 text-xs font-medium text-muted-foreground">
                    Toggle columns
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <div className="max-h-[260px] overflow-y-auto space-y-0.5">
                    {columns.map((column: Column<DataTableFeatures, TData, unknown>) => (
                        <DropdownMenuItem
                            key={column.id}
                            className="flex items-center gap-2 px-2 py-1 text-sm cursor-pointer rounded-sm hover:bg-accent"
                            onSelect={(e: Event) => e.preventDefault()}
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
