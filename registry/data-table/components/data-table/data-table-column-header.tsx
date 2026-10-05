'use client';

import React, { useState } from 'react';
import { type Column, type Header, type ColumnMeta, flexRender } from '@tanstack/react-table';
import { Input } from '@/components/ui/input';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
    DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';

interface DataTableColumnMeta extends ColumnMeta<unknown, unknown> {
    searchable?: boolean;
    filterable?: boolean;
    filter_type?: 'text' | 'select' | 'boolean' | null;
    filter_options?: Array<{ value: string; label: string }>;
}

interface DataTableColumnHeaderProps<TData extends Record<string, unknown>> {
    header: Header<TData, unknown>;
    column: Column<TData, unknown>;
    onColumnSearchChange: (_column: string, _value: string) => void;
    onFilterChange: (_column: string, _value: unknown) => void;
    columnSearchValue: string;
    currentFilterValue?: unknown;
}

export function DataTableColumnHeader<TData extends Record<string, unknown>>({
    header,
    column,
    onColumnSearchChange,
    onFilterChange,
    columnSearchValue,
    currentFilterValue,
}: DataTableColumnHeaderProps<TData>) {
    const canSort = column.columnDef.enableSorting;
    const meta = column.columnDef.meta as DataTableColumnMeta | undefined;
    const canSearch = meta?.searchable === true;
    const canFilter = meta?.filterable === true;
    const filterType = meta?.filter_type ?? 'text';
    const filterOptions = meta?.filter_options ?? [];
    const isFilterActive = currentFilterValue !== '' && currentFilterValue !== null && currentFilterValue !== undefined;

    const [filterInputValue, setFilterInputValue] = useState<string>('');

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
        onFilterChange(column.id, '');
    };

    return (
        <th className="relative px-4 py-3 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0">
            <div className="flex items-center gap-2">
                {canSort && (
                    <button
                        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
                        className="flex items-center gap-1 hover:text-foreground transition-colors"
                        aria-label={`Sort by ${column.columnDef.header}`}
                    >
                        {flexRender(column.columnDef.header!, header.getContext())}
                        {column.getIsSorted() === 'asc' ? (
                            <span>↑</span>
                        ) : column.getIsSorted() === 'desc' ? (
                            <span>↓</span>
                        ) : (
                            <span className="text-muted-foreground">↕</span>
                        )}
                    </button>
                )}
                {!canSort && <span>{flexRender(column.columnDef.header!, header.getContext())}</span>}
            </div>
            <div className="absolute right-0 top-full mt-1 w-56 p-2 rounded-md border bg-popover shadow-lg hidden group-focus-within:block group-hover:block z-10">
                {canSearch && (
                    <div className="space-y-2">
                        <label className="block text-xs font-medium text-muted-foreground">
                            Column search
                        </label>
                        <Input
                            placeholder={`Search ${column.columnDef.header}...`}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onColumnSearchChange(column.id, e.target.value)}
                            value={columnSearchValue}
                        />
                    </div>
                )}
                {canFilter && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button className={`flex w-full items-center justify-between px-2 py-1 text-sm rounded ${isFilterActive ? 'text-foreground bg-primary/10' : 'text-muted-foreground hover:text-foreground'}`}>
                                Filter
                                <svg className="ml-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                                </svg>
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-64 p-2">
                            <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
                                Filter {column.columnDef.header as string}
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {filterType === 'select' && filterOptions.length > 0 && (
                                <div className="space-y-1">
                                    {filterOptions.map((option) => (
                                        <DropdownMenuItem
                                            key={option.value}
                                            onSelect={(e) => {
                                                e.preventDefault();
                                                handleFilterSelect(option.value);
                                            }}
                                            className={`flex items-center gap-2 px-2 py-1.5 text-sm ${currentFilterValue === option.value ? 'bg-primary/10 text-primary' : ''}`}
                                        >
                                            <Checkbox
                                                checked={currentFilterValue === option.value}
                                                onCheckedChange={() => handleFilterSelect(option.value)}
                                                className="h-4 w-4"
                                            />
                                            <span className="truncate">{option.label}</span>
                                        </DropdownMenuItem>
                                    ))}
                                </div>
                            )}
                            {filterType === 'boolean' && (
                                <div className="space-y-1">
                                    <DropdownMenuItem
                                        onSelect={(e) => {
                                            e.preventDefault();
                                            handleFilterBooleanChange(true);
                                        }}
                                        className={`flex items-center gap-2 px-2 py-1.5 text-sm ${currentFilterValue === true ? 'bg-primary/10 text-primary' : ''}`}
                                    >
                                        <Checkbox
                                            checked={currentFilterValue === true}
                                            onCheckedChange={() => handleFilterBooleanChange(true)}
                                            className="h-4 w-4"
                                        />
                                        <span className="truncate">Yes</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        onSelect={(e) => {
                                            e.preventDefault();
                                            handleFilterBooleanChange(false);
                                        }}
                                        className={`flex items-center gap-2 px-2 py-1.5 text-sm ${currentFilterValue === false ? 'bg-primary/10 text-primary' : ''}`}
                                    >
                                        <Checkbox
                                            checked={currentFilterValue === false}
                                            onCheckedChange={() => handleFilterBooleanChange(false)}
                                            className="h-4 w-4"
                                        />
                                        <span className="truncate">No</span>
                                    </DropdownMenuItem>
                                </div>
                            )}
                            {filterType === 'text' && (
                                <div className="space-y-2">
                                    <Input
                                        placeholder={`Filter ${column.columnDef.header}...`}
                                        value={filterInputValue}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFilterTextChange(e.target.value)}
                                        className="w-full"
                                    />
                                </div>
                            )}
                            {isFilterActive && (
                                <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        onClick={handleClearFilter}
                                        className="text-sm text-destructive"
                                    >
                                        Clear filter
                                    </DropdownMenuItem>
                                </>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </div>
        </th>
    );
}