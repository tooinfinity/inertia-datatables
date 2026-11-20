'use client';

import React, { type ReactNode } from 'react';
import { type ReactTable, type RowData } from '@tanstack/react-table';
import type { DataTableFeatures } from './table-features';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DataTableColumnVisibility } from './data-table-column-visibility';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface DataTableToolbarProps<TData extends RowData = Record<string, unknown>> {
    table?: ReactTable<DataTableFeatures, TData>;
    search: string;
    onSearchChange: (_value: string) => void;
    perPage?: number;
    onPerPageChange?: (_value: number) => void;
    perPageOptions?: number[];
    isFiltered?: boolean;
    onReset?: () => void;
    children?: ReactNode;
}

export function DataTableToolbar<TData extends RowData = Record<string, unknown>>({
    table,
    search,
    onSearchChange,
    perPage,
    onPerPageChange,
    perPageOptions,
    isFiltered,
    onReset,
    children,
}: DataTableToolbarProps<TData>) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-1 flex-wrap items-center gap-2">
                <Input
                    placeholder="Search..."
                    value={search}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => onSearchChange(e.target.value)}
                    className="h-8 w-full min-w-[150px] sm:w-[200px] lg:w-[250px]"
                    aria-label="Global search"
                />
                {isFiltered && onReset && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onReset}
                        className="h-8 px-2 text-xs gap-1 lg:px-3 text-muted-foreground hover:text-foreground"
                        aria-label="Reset filters"
                    >
                        Reset
                        <svg
                            className="h-3.5 w-3.5"
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                        >
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </Button>
                )}
                {children}
            </div>
            <div className="flex items-center gap-2">
                {table && <DataTableColumnVisibility table={table} />}
                {!table && perPage !== undefined && onPerPageChange && perPageOptions && perPageOptions.length > 0 && (
                    <div className="flex items-center gap-2">
                        <label htmlFor="per-page" className="text-sm text-muted-foreground whitespace-nowrap">
                            Show
                        </label>
                        <Select value={String(perPage)} onValueChange={(value: string) => onPerPageChange(Number(value))}>
                            <SelectTrigger id="per-page" className="h-8 w-[80px]">
                                <SelectValue placeholder="Per page" />
                            </SelectTrigger>
                            <SelectContent side="bottom">
                                {perPageOptions.map((option) => (
                                    <SelectItem key={String(option)} value={String(option)}>
                                        {option}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">per page</span>
                    </div>
                )}
            </div>
        </div>
    );
}
