'use client';

import React, { useState, useEffect } from 'react';
import { type Column, type Header, type RowData, flexRender } from '@tanstack/react-table';
import type { DataTableFeatures, DataTableColumnMeta } from './table-features';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TableHead } from '@/components/ui/table';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
    DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';

interface DataTableColumnHeaderProps<TData extends RowData> {
    header: Header<DataTableFeatures, TData, unknown>;
    column: Column<DataTableFeatures, TData, unknown>;
    onColumnSearchChange: (_column: string, _value: string) => void;
    onFilterChange: (_column: string, _value: unknown) => void;
    onClearFilter?: (_column: string, _clearSearch: boolean) => void;
    columnSearchValue: string;
    currentFilterValue?: unknown;
}

export function DataTableColumnHeader<TData extends RowData>({
    header,
    column,
    onColumnSearchChange,
    onFilterChange,
    onClearFilter,
    columnSearchValue,
    currentFilterValue,
}: DataTableColumnHeaderProps<TData>) {
    // React Compiler (enabled by default in both official Laravel React starter kits)
    // memoizes this component against TanStack's stable `column` object, but
    // `column.getIsSorted()` changes during render. Opt out so the sort arrow
    // re-renders when the sort state changes.
    "use no memo";
    const canSort = column.columnDef.enableSorting === true;
    const meta = column.columnDef.meta as DataTableColumnMeta | undefined;
    const canSearch = meta?.searchable === true;
    const canFilter = meta?.filterable === true;
    const filterType = meta?.filter_type ?? 'text';
    const filterOptions = meta?.filter_options ?? [];
    const isFilterActive = currentFilterValue !== '' && currentFilterValue !== null && currentFilterValue !== undefined;
    const headerTitle = typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id;

    const [filterInputValue, setFilterInputValue] = useState<string>('');

    useEffect(() => {
        if (filterType === 'text' && typeof currentFilterValue === 'string') {
            setFilterInputValue(currentFilterValue);
        } else if (filterType === 'text') {
            setFilterInputValue('');
        }
    }, [currentFilterValue, filterType]);

    const handleFilterSelect = (value: string) => {
        onFilterChange(column.id, value);
    };

    const handleFilterTextChange = (value: string) => {
        setFilterInputValue(value);
        onFilterChange(column.id, value);
    };

    const handleFilterBooleanChange = (value: boolean) => {
        onFilterChange(column.id, value);
    };

    const handleClearFilter = () => {
        setFilterInputValue('');
        if (onClearFilter) {
            onClearFilter(column.id, Boolean(canSearch && columnSearchValue));
        } else {
            onFilterChange(column.id, '');
            if (canSearch && columnSearchValue) {
                onColumnSearchChange(column.id, '');
            }
        }
    };

    return (
        <TableHead className="px-4 py-3 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0">
            <div className="flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1 min-w-0">
                    {canSort ? (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
                            className="-ml-3 h-8 text-xs font-medium hover:bg-accent hover:text-foreground data-[state=open]:bg-accent"
                            aria-label={`Sort by ${headerTitle}`}
                        >
                            <span className="truncate">{flexRender(column.columnDef.header!, header.getContext())}</span>
                            {column.getIsSorted() === 'asc' ? (
                                <span className="ml-1 text-xs">↑</span>
                            ) : column.getIsSorted() === 'desc' ? (
                                <span className="ml-1 text-xs">↓</span>
                            ) : (
                                <span className="ml-1 text-xs text-muted-foreground/60">↕</span>
                            )}
                        </Button>
                    ) : (
                        <span className="truncate text-xs font-medium">{flexRender(column.columnDef.header!, header.getContext())}</span>
                    )}
                </div>

                {(canSearch || canFilter) && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                size="sm"
                                className={`h-6 w-6 p-0 rounded hover:bg-accent ${
                                    isFilterActive || columnSearchValue
                                        ? 'text-primary bg-primary/10 hover:bg-primary/20'
                                        : 'text-muted-foreground hover:text-foreground'
                                }`}
                                aria-label={`Filter ${headerTitle}`}
                            >
                                <svg
                                    className="h-3 w-3"
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    strokeWidth="2"
                                    stroke="currentColor"
                                    aria-hidden="true"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                                    />
                                </svg>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-60 p-2" align="end" sideOffset={6}>
                            <DropdownMenuLabel className="px-1 text-xs font-semibold text-muted-foreground">
                                Filter {headerTitle}
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />

                            {canSearch && (
                                <div className="p-1 space-y-1.5">
                                    <label className="block text-[11px] font-medium text-muted-foreground">
                                        Search {headerTitle}
                                    </label>
                                    <Input
                                        placeholder={`Search ${headerTitle}...`}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                            onColumnSearchChange(column.id, e.target.value)
                                        }
                                        value={columnSearchValue}
                                        className="h-7 text-xs"
                                    />
                                </div>
                            )}

                            {canFilter && filterType === 'select' && filterOptions.length > 0 && (
                                <div className="space-y-0.5 p-1 max-h-[200px] overflow-y-auto">
                                    {filterOptions.map((option) => (
                                        <DropdownMenuItem
                                            key={option.value}
                                            onSelect={(e) => {
                                                e.preventDefault();
                                                handleFilterSelect(option.value);
                                            }}
                                            className={`flex items-center gap-2 px-2 py-1 text-xs rounded cursor-pointer ${
                                                currentFilterValue === option.value
                                                    ? 'bg-primary/10 text-primary font-medium'
                                                    : 'hover:bg-accent'
                                            }`}
                                        >
                                            <Checkbox
                                                checked={currentFilterValue === option.value}
                                                onCheckedChange={() => handleFilterSelect(option.value)}
                                                className="h-3.5 w-3.5"
                                            />
                                            <span className="truncate">{option.label}</span>
                                        </DropdownMenuItem>
                                    ))}
                                </div>
                            )}

                            {canFilter && filterType === 'boolean' && (
                                <div className="space-y-0.5 p-1">
                                    <DropdownMenuItem
                                        onSelect={(e) => {
                                            e.preventDefault();
                                            handleFilterBooleanChange(true);
                                        }}
                                        className={`flex items-center gap-2 px-2 py-1 text-xs rounded cursor-pointer ${
                                            currentFilterValue === true
                                                ? 'bg-primary/10 text-primary font-medium'
                                                : 'hover:bg-accent'
                                        }`}
                                    >
                                        <Checkbox
                                            checked={currentFilterValue === true}
                                            onCheckedChange={() => handleFilterBooleanChange(true)}
                                            className="h-3.5 w-3.5"
                                        />
                                        <span className="truncate">Yes</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        onSelect={(e) => {
                                            e.preventDefault();
                                            handleFilterBooleanChange(false);
                                        }}
                                        className={`flex items-center gap-2 px-2 py-1 text-xs rounded cursor-pointer ${
                                            currentFilterValue === false
                                                ? 'bg-primary/10 text-primary font-medium'
                                                : 'hover:bg-accent'
                                        }`}
                                    >
                                        <Checkbox
                                            checked={currentFilterValue === false}
                                            onCheckedChange={() => handleFilterBooleanChange(false)}
                                            className="h-3.5 w-3.5"
                                        />
                                        <span className="truncate">No</span>
                                    </DropdownMenuItem>
                                </div>
                            )}

                            {canFilter && filterType === 'text' && (
                                <div className="p-1 space-y-1.5">
                                    <label className="block text-[11px] font-medium text-muted-foreground">
                                        Filter value
                                    </label>
                                    <Input
                                        placeholder={`Filter ${headerTitle}...`}
                                        value={filterInputValue}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                            handleFilterTextChange(e.target.value)
                                        }
                                        className="h-7 text-xs"
                                    />
                                </div>
                            )}

                            {(isFilterActive || columnSearchValue) && (
                                <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        onClick={handleClearFilter}
                                        className="text-xs text-destructive hover:bg-destructive/10 cursor-pointer font-medium px-2 py-1 rounded"
                                    >
                                        Clear filter
                                    </DropdownMenuItem>
                                </>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </div>
        </TableHead>
    );
}
