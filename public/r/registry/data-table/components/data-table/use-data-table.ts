'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    createColumnHelper,
    flexRender,
    createCoreRowModel,
    useTable,
    type SortingState,
    type PaginationState,
    type ColumnFiltersState,
    type ColumnDef,
    type FilterFnOption,
    type VisibilityState,
} from '@tanstack/react-table';
import { router } from '@inertiajs/react';
import type {
    DataTableState,
    DataTableOptions,
    DataTableColumn,
} from './types';

type ColumnSearchesState = Record<string, string>;

export function useDataTable<TData extends Record<string, unknown>>({
    data: initialData,
    dataPropName = 'data',
}: DataTableOptions<TData>) {
    const mountedRef = useRef(false);
    const debounceTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
    const sortingRef = useRef<SortingState>([]);

    const [state, setState] = useState<DataTableState>({
        page: initialData.query.page,
        perPage: initialData.query.per_page,
        search: initialData.query.search,
        sort: initialData.query.sort.map((s) => ({
            column: s.column,
            direction: s.direction as 'asc' | 'desc',
        })),
        searches: Object.fromEntries(
            initialData.query.searches.map((s) => [s.column, s.value])
        ),
        filters: Object.fromEntries(
            initialData.query.filters.map((f) => [f.column, f.value])
        ),
    });

    const debounceMs = initialData.config?.debounce ?? 300;
    const perPageOptions = initialData.config?.per_page_options ?? [10, 25, 50, 100];

    const initialColumnVisibility = useMemo<Record<string, boolean>>(() => {
        const visibility: Record<string, boolean> = {};
        initialData.columns.forEach((col) => {
            visibility[col.name] = !col.hidden;
        });
        return visibility;
    }, [initialData.columns]);

    const columnHelper = useMemo(() => createColumnHelper<TData>(), []);

    const columns = useMemo<ColumnDef<TData, unknown>[]>(() => {
        return initialData.columns.map((col: DataTableColumn) => {
            const column = columnHelper.accessor(
                (row: TData) => row[col.name as keyof TData] as unknown,
                {
                    header: col.label,
                    id: col.name,
                    cell: (info) => flexRender(info.column.columnDef.cell!, info),
                }
            );

            if (col.sortable) {
                column.enableSorting = true;
            }

            if (col.searchable) {
                column.meta = {
                    ...column.meta,
                    searchable: true,
                };
            }

            if (col.filterable) {
                column.meta = {
                    ...column.meta,
                    filterable: true,
                    filter_type: col.filter_type,
                    filter_options: col.filter_options,
                };
                column.filterFn = 'includes' as FilterFnOption<TData>;
            }

            return column;
        });
    }, [initialData.columns, columnHelper]);

    const [sorting, setSorting] = useState<SortingState>(
        state.sort.map((s) => ({ id: s.column, desc: s.direction === 'desc' }))
    );

    const [pagination, setPagination] = useState<PaginationState>({
        pageIndex: state.page - 1,
        pageSize: state.perPage,
    });

    const [globalFilter, setGlobalFilter] = useState<string>(state.search);

    const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(
        Object.entries(state.filters).map(([key, value]) => ({ id: key, value })) as ColumnFiltersState
    );

    const [columnSearches, setColumnSearches] = useState<ColumnSearchesState>(state.searches);

    const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(initialColumnVisibility);

    useEffect(() => {
        sortingRef.current = sorting;
    }, [sorting]);

    const visitWithParams = useCallback(
        (params: Record<string, unknown>) => {
            const currentParams = new URLSearchParams(window.location.search);
            Object.entries(params).forEach(([key, value]) => {
                if (value === '' || value === null || value === undefined) {
                    currentParams.delete(key);
                } else {
                    currentParams.set(key, String(value));
                }
            });
            router.visit(window.location.pathname + '?' + currentParams.toString(), {
                preserveScroll: true,
                preserveState: true,
                only: [dataPropName],
            });
        },
        [dataPropName]
    );

    const debouncedVisit = useCallback(
        (key: string, params: Record<string, unknown>) => {
            if (debounceTimersRef.current[key]) {
                clearTimeout(debounceTimersRef.current[key]);
            }
            debounceTimersRef.current[key] = setTimeout(() => {
                visitWithParams(params);
                delete debounceTimersRef.current[key];
            }, debounceMs);
        },
        [visitWithParams, debounceMs]
    );

    const handleSortChange = useCallback(
        (updater: SortingState | ((_old: SortingState) => SortingState)) => {
            const newSorting = typeof updater === 'function' ? updater(sortingRef.current) : updater;
            setSorting(newSorting);
            const sortString = newSorting
                .map((s) => (s.desc ? `-${s.id}` : s.id))
                .join(',');
            setState((prev) => ({
                ...prev,
                sort: newSorting.map((s) => ({ column: s.id, direction: s.desc ? 'desc' : 'asc' })),
            }));
            visitWithParams({ sort: sortString });
        },
        [visitWithParams]
    );

    const handlePageChange = useCallback(
        (pageIndex: number) => {
            const page = pageIndex + 1;
            setState((prev) => ({ ...prev, page }));
            setPagination((prev) => ({ ...prev, pageIndex }));
            visitWithParams({ page });
        },
        [visitWithParams]
    );

    const handlePerPageChange = useCallback(
        (pageSize: number) => {
            setState((prev) => ({ ...prev, perPage: pageSize, page: 1 }));
            setPagination((prev) => ({ ...prev, pageSize, pageIndex: 0 }));
            visitWithParams({ per_page: pageSize, page: 1 });
        },
        [visitWithParams]
    );

    const handleSearchChange = useCallback(
        (value: string) => {
            setGlobalFilter(value);
            setState((prev) => ({ ...prev, search: value, page: 1 }));
            setPagination((prev) => ({ ...prev, pageIndex: 0 }));
            debouncedVisit('search', { search: value, page: 1 });
        },
        [debouncedVisit]
    );

    const handleColumnSearchChange = useCallback(
        (column: string, value: string) => {
            setColumnSearches((prev) => {
                const next = { ...prev };
                if (value) {
                    next[column] = value;
                } else {
                    delete next[column];
                }
                return next;
            });
            setState((prev) => ({
                ...prev,
                searches: { ...prev.searches, [column]: value },
                page: 1,
            }));
            setPagination((prev) => ({ ...prev, pageIndex: 0 }));
            debouncedVisit(`searches.${column}`, { [`searches[${column}]`]: value || undefined, page: 1 });
        },
        [debouncedVisit]
    );

    const handleFilterChange = useCallback(
        (column: string, value: unknown) => {
            setColumnFilters((prev) => {
                const newFilters = new Map(prev.map((f) => [f.id, f.value]));
                if (value === '' || value === null || value === undefined) {
                    newFilters.delete(column);
                } else {
                    newFilters.set(column, value);
                }
                return Array.from(newFilters.entries()).map(([id, value]) => ({ id, value })) as ColumnFiltersState;
            });
            setState((prev) => ({
                ...prev,
                filters: { ...prev.filters, [column]: value },
                page: 1,
            }));
            setPagination((prev) => ({ ...prev, pageIndex: 0 }));
            const paramValue = value === '' || value === null || value === undefined ? undefined : value;
            visitWithParams({ [`filters[${column}]`]: paramValue, page: 1 });
        },
        [visitWithParams]
    );

    const handleColumnVisibilityChange = useCallback(
        (updater: VisibilityState | ((_old: VisibilityState) => VisibilityState)) => {
            const newVisibility = typeof updater === 'function' ? updater(columnVisibility) : updater;
            setColumnVisibility(newVisibility);
        },
        [columnVisibility]
    );

    useEffect(() => {
        setState({
            page: initialData.query.page,
            perPage: initialData.query.per_page,
            search: initialData.query.search,
            sort: initialData.query.sort.map((s) => ({
                column: s.column,
                direction: s.direction as 'asc' | 'desc',
            })),
            searches: Object.fromEntries(
                initialData.query.searches.map((s) => [s.column, s.value])
            ),
            filters: Object.fromEntries(
                initialData.query.filters.map((f) => [f.column, f.value])
            ),
        });
        setSorting(
            initialData.query.sort.map((s) => ({
                id: s.column,
                desc: s.direction === 'desc',
            }))
        );
        setPagination({
            pageIndex: initialData.query.page - 1,
            pageSize: initialData.query.per_page,
        });
        setGlobalFilter(initialData.query.search);
        setColumnFilters(
            Object.entries(
                Object.fromEntries(initialData.query.filters.map((f) => [f.column, f.value]))
            ).map(([id, value]) => ({ id, value })) as ColumnFiltersState
        );
        setColumnSearches(
            Object.fromEntries(initialData.query.searches.map((s) => [s.column, s.value]))
        );
    }, [initialData.query]);

    useEffect(() => {
        return () => {
            Object.values(debounceTimersRef.current).forEach((timer) => clearTimeout(timer));
            debounceTimersRef.current = {};
        };
    }, []);

    if (!mountedRef.current) {
        mountedRef.current = true;
    }

    const table = useTable({
        data: initialData.data as TData[],
        columns,
        state: {
            sorting,
            pagination,
            globalFilter,
            columnFilters,
            columnVisibility,
        },
        onSortingChange: handleSortChange,
        onPaginationChange: setPagination,
        onGlobalFilterChange: setGlobalFilter,
        onColumnFiltersChange: setColumnFilters,
        onColumnVisibilityChange: handleColumnVisibilityChange,
        getCoreRowModel: createCoreRowModel(),
        manualPagination: true,
        manualSorting: true,
        manualFiltering: true,
        pageCount: initialData.meta.last_page,
    });

    return {
        table,
        state,
        setState,
        handlePageChange,
        handlePerPageChange,
        handleSortChange,
        handleSearchChange,
        handleColumnSearchChange,
        handleFilterChange,
        perPageOptions,
        columnSearches,
    };
}
