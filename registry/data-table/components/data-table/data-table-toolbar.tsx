'use client';

import React, { type ReactNode, useState, useMemo } from 'react';
import { type ReactTable, type RowData } from '@tanstack/react-table';
import type { DataTableColumnMeta, DataTableFeatures } from './table-features';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DataTableColumnVisibility } from './data-table-column-visibility';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuCheckboxItem,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
    DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';

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
    /** Active per-column filters keyed by column id. */
    filters?: Record<string, unknown>;
    /** Active per-column searches keyed by column id. */
    columnSearches?: Record<string, string>;
    /** Fired when a per-column filter value changes. */
    onFilterChange?: (_column: string, _value: unknown) => void;
    /** Fired when a per-column search value changes. */
    onColumnSearchChange?: (_column: string, _value: string) => void;
    /** Fired when a per-column filter or search is cleared. */
    onClearFilter?: (_column: string, _clearSearch: boolean) => void;
}

interface ColumnFilterInfo {
    label: string;
    canSearch: boolean;
    canFilter: boolean;
    filterType: DataTableColumnMeta['filter_type'];
    filterOptions: Array<{ value: string | number; label: string }>;
}

interface DataTableFilterChipProps {
    columnId: string;
    label: string;
    filterValue: unknown;
    searchValue: string;
    filterType: DataTableColumnMeta['filter_type'];
    filterOptions: Array<{ value: string | number; label: string }>;
    canSearch: boolean;
    canFilter: boolean;
    onFilterChange: (_column: string, _value: unknown) => void;
    onColumnSearchChange: (_column: string, _value: string) => void;
    onClearFilter: (_column: string, _clearSearch: boolean) => void;
}

function isFilterActive(value: unknown): boolean {
    return value !== '' && value !== null && value !== undefined;
}

function filterValueCount(value: unknown): number {
    if (Array.isArray(value)) {
        return value.length;
    }
    return isFilterActive(value) ? 1 : 0;
}

export function DataTableFilterChip({
    columnId,
    label,
    filterValue,
    searchValue,
    filterType,
    filterOptions,
    canSearch,
    canFilter,
    onFilterChange,
    onColumnSearchChange,
    onClearFilter,
}: DataTableFilterChipProps) {
    const [menuOpen, setMenuOpen] = useState<boolean>(false);

    const activeCount = filterValueCount(filterValue) + (searchValue ? 1 : 0);

    // Toggles a checkbox menu option using the next checked state supplied by
    // `DropdownMenuCheckboxItem`. Selecting adds the option; deselecting removes
    // it from an array value or clears a scalar value, preserving any other
    // selected array members.
    const handleFilterCheckboxChange = (value: string | number, checked: boolean) => {
        if (checked) {
            if (Array.isArray(filterValue)) {
                // Preserve existing array members and append the new selection
                // only when it is not already present.
                const alreadySelected = filterValue.some((member) => filterValueMatches(member, value));
                if (!alreadySelected) {
                    onFilterChange(columnId, [...filterValue, value]);
                }
            } else {
                onFilterChange(columnId, value);
            }
        } else if (Array.isArray(filterValue)) {
            onFilterChange(
                columnId,
                filterValue.filter((member) => !filterValueMatches(member, value))
            );
        } else {
            onFilterChange(columnId, undefined);
        }
        setMenuOpen(false);
    };

    const handleFilterBooleanChange = (value: boolean) => {
        onFilterChange(columnId, value);
        setMenuOpen(false);
    };

    const handleFilterTextChange = (value: string) => {
        onFilterChange(columnId, value);
    };

    const handleColumnSearchChange = (value: string) => {
        onColumnSearchChange(columnId, value);
    };

    const handleClearFilter = () => {
        onClearFilter(columnId, Boolean(canSearch && searchValue));
        setMenuOpen(false);
    };

    // Compares a restored filter value (often a string from the query string)
    // against an option value (which may be a number for integer-backed enums).
    // Array values (multi-value filters) match when any member equals the option.
    const filterValueMatches = (current: unknown, optionValue: string | number): boolean => {
        const matches = (value: unknown): boolean => {
            if (value === optionValue) {
                return true;
            }
            if (typeof value === 'string' && typeof optionValue === 'number') {
                return value === String(optionValue);
            }
            if (typeof value === 'number' && typeof optionValue === 'string') {
                return String(value) === optionValue;
            }
            return false;
        };
        if (Array.isArray(current)) {
            return current.some((member) => matches(member));
        }
        return matches(current);
    };

    return (
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-2.5 text-xs gap-1.5 text-foreground hover:bg-accent"
                    aria-haspopup="true"
                    aria-expanded={menuOpen}
                >
                    {activeCount > 0 ? `${label} • ${activeCount} selected` : label}
                </Button>
            </DropdownMenuTrigger>
            {menuOpen && (
                <DropdownMenuContent className="w-60 p-2" align="end" sideOffset={6}>
                <DropdownMenuLabel className="px-1 text-xs font-semibold text-muted-foreground">
                    Filter {label}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />

                {canSearch && (
                    <div className="p-1 space-y-1.5">
                        <label
                            className="block text-[11px] font-medium text-muted-foreground"
                            htmlFor={`toolbar-column-search-${columnId}`}
                        >
                            Search {label}
                        </label>
                        <Input
                            id={`toolbar-column-search-${columnId}`}
                            placeholder={`Search ${label}...`}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                handleColumnSearchChange(e.target.value)
                            }
                            value={searchValue}
                            className="h-7 text-xs"
                        />
                    </div>
                )}

                {canFilter && filterType === 'select' && filterOptions.length > 0 && (
                    <div className="space-y-0.5 p-1 max-h-[200px] overflow-y-auto">
                        {filterOptions.map((option) => (
                            <DropdownMenuCheckboxItem
                                key={option.value}
                                checked={filterValueMatches(filterValue, option.value)}
                                onCheckedChange={(checked) => {
                                    handleFilterCheckboxChange(option.value, checked);
                                }}
                                className={`flex items-center gap-2 px-2 py-1 text-xs rounded cursor-pointer ${
                                    filterValueMatches(filterValue, option.value)
                                        ? 'bg-primary/10 text-primary font-medium'
                                        : 'hover:bg-accent'
                                }`}
                            >
                                <span className="truncate">{option.label}</span>
                            </DropdownMenuCheckboxItem>
                        ))}
                    </div>
                )}

                {canFilter && filterType === 'boolean' && (
                    <DropdownMenuRadioGroup
                        value={filterValue === true ? 'true' : filterValue === false ? 'false' : undefined}
                        onValueChange={(value) => {
                            handleFilterBooleanChange(value === 'true');
                        }}
                        className="space-y-0.5 p-1"
                    >
                        <DropdownMenuRadioItem
                            value="true"
                            className={`flex items-center gap-2 px-2 py-1 text-xs rounded cursor-pointer ${
                                filterValue === true ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-accent'
                            }`}
                        >
                            <span className="truncate">Yes</span>
                        </DropdownMenuRadioItem>
                        <DropdownMenuRadioItem
                            value="false"
                            className={`flex items-center gap-2 px-2 py-1 text-xs rounded cursor-pointer ${
                                filterValue === false ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-accent'
                            }`}
                        >
                            <span className="truncate">No</span>
                        </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                )}

                {canFilter && filterType === 'text' && (
                    <div className="p-1 space-y-1.5">
                        <label
                            className="block text-[11px] font-medium text-muted-foreground"
                            htmlFor={`toolbar-filter-value-${columnId}`}
                        >
                            Filter value
                        </label>
                        <Input
                            id={`toolbar-filter-value-${columnId}`}
                            aria-label={`Filter ${label} value`}
                            placeholder={`Filter ${label}...`}
                            value={typeof filterValue === 'string' ? filterValue : ''}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                handleFilterTextChange(e.target.value)
                            }
                            className="h-7 text-xs"
                        />
                    </div>
                )}

                <DropdownMenuSeparator />
                <DropdownMenuItem
                    onClick={handleClearFilter}
                    className="text-xs text-destructive hover:bg-destructive/10 cursor-pointer font-medium px-2 py-1 rounded"
                >
                    Clear filter
                </DropdownMenuItem>
            </DropdownMenuContent>
            )}
        </DropdownMenu>
    );
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
    filters = {},
    columnSearches = {},
    onFilterChange = () => {},
    onColumnSearchChange = () => {},
    onClearFilter = () => {},
}: DataTableToolbarProps<TData>) {
    // Column metadata (label, filter type, options) derived from the table so
    // each filter chip can render the matching dropdown controls.
    const columnMeta = useMemo<Map<string, ColumnFilterInfo>>(() => {
        const map = new Map<string, ColumnFilterInfo>();
        table?.getAllLeafColumns().forEach((column) => {
            const meta = column.columnDef.meta as DataTableColumnMeta | undefined;
            const header = column.columnDef.header;
            const label = typeof header === 'string' ? header : column.id;
            map.set(column.id, {
                label,
                canSearch: meta?.searchable === true,
                canFilter: meta?.filterable === true,
                filterType: meta?.filter_type ?? 'text',
                filterOptions: meta?.filter_options ?? [],
            });
        });
        return map;
    }, [table]);

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
                {/* Render a filter chip for every eligible column (searchable or
                   filterable), active or not. Active columns show their selected
                   count; inactive columns stay as an "add filter" entrypoint so
                   users can always start a new column filter or search. */}
                {Array.from(columnMeta.entries()).map(([columnId, info]) => {
                    if (!info.canSearch && !info.canFilter) {
                        return null;
                    }
                    return (
                        <DataTableFilterChip
                            key={columnId}
                            columnId={columnId}
                            label={info.label}
                            filterValue={filters[columnId]}
                            searchValue={columnSearches[columnId] ?? ''}
                            filterType={info.filterType}
                            filterOptions={info.filterOptions}
                            canSearch={info.canSearch}
                            canFilter={info.canFilter}
                            onFilterChange={onFilterChange}
                            onColumnSearchChange={onColumnSearchChange}
                            onClearFilter={onClearFilter}
                        />
                    );
                })}
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
