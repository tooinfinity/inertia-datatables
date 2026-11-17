'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    createColumnHelper,
    useTable,
    type ColumnDef,
    type ColumnFiltersState,
    type ColumnVisibilityState,
    type PaginationState,
    type RowData,
    type SortingState,
} from '@tanstack/react-table';
import { router, usePage } from '@inertiajs/react';
import type {
    DataTableState,
    DataTableOptions,
    DataTableColumn,
    DataTableColumnDef,
    DataTableErrors,
    DataTableHttpException,
} from './types';
import { dataTableFeatures, type DataTableFeatures } from './table-features';
import { defaultCellFormatter } from './cell-formatters';

type ColumnSearchesState = Record<string, string>;

/** Id of the client side column that renders the row actions. */
export const DATA_TABLE_ACTIONS_COLUMN_ID = '__actions';

/**
 * Reads the current Inertia page props without requiring an Inertia context.
 *
 * Returns `null` when the component is rendered outside of an Inertia page.
 */
function useInertiaPageProps(): Record<string, unknown> | null {
    try {
        const page = usePage();
        return (page?.props ?? null) as Record<string, unknown> | null;
    } catch {
        return null;
    }
}

/**
 * Detects whether the bundle runs in a development environment.
 *
 * Vite exposes `import.meta.env.DEV`, every other toolchain is detected
 * through `process.env.NODE_ENV`.
 */
function isDevelopmentEnvironment(): boolean {
    const viteDev = (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV;

    if (typeof viteDev === 'boolean') {
        return viteDev;
    }

    const nodeEnv = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env
        ?.NODE_ENV;

    return nodeEnv === 'development';
}

export function useDataTable<TData extends RowData = Record<string, unknown>>({
    data: initialData,
    dataPropName = 'data',
    columns: columnOverrides,
    cells,
    actions,
    visitOptions,
    rowKey,
}: DataTableOptions<TData>) {
    const mountedRef = useRef(false);
    const debounceTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
    const sortingRef = useRef<SortingState>([]);
    const warnedPropRef = useRef<string | null>(null);
    // Track the last value sent to the server for each debounced field
    const lastSentRef = useRef<{
        search: string;
        searches: Record<string, string>;
        filters: Record<string, unknown>;
    }>({
        search: initialData.query.search,
        searches: Object.fromEntries(initialData.query.searches.map((s) => [s.column, s.value])),
        filters: Object.fromEntries(initialData.query.filters.map((f) => [f.column, f.value])),
    });

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

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<DataTableErrors | null>(null);

    const debounceMs = initialData.config?.debounce ?? 300;
    const perPageOptions = initialData.config?.per_page_options ?? [10, 25, 50, 100];

    const initialColumnVisibility = useMemo<Record<string, boolean>>(() => {
        const visibility: Record<string, boolean> = {};
        initialData.columns.forEach((col) => {
            visibility[col.name] = !col.hidden;
        });
        return visibility;
    }, [initialData.columns]);

    const columnHelper = useMemo(() => createColumnHelper<DataTableFeatures, TData>(), []);

    const columns = useMemo<ColumnDef<DataTableFeatures, TData, unknown>[]>(() => {
        const overrides = new Map<string, DataTableColumnDef<TData>>();

        (columnOverrides ?? []).forEach((override) => {
            if (override.id) {
                overrides.set(override.id, override);
            }
        });

        const serverColumns = initialData.columns.map((col: DataTableColumn<TData>) => {
            const override = overrides.get(col.name);
            const renderer = cells?.[col.name] ?? col.cell ?? defaultCellFormatter;

            const base = columnHelper.accessor(
                (row: TData) => row[col.name as keyof TData] as unknown,
                {
                    header: col.label,
                    id: col.name,
                    cell: (info) => renderer(info),
                    enableSorting: col.sortable,
                    enableGlobalFilter: col.searchable,
                    enableColumnFilter: col.filterable,
                    meta: {
                        searchable: col.searchable,
                        filterable: col.filterable,
                        filter_type: col.filter_type,
                        filter_options: col.filter_options,
                    },
                }
            );

            if (!override) {
                return base;
            }

            // The server capabilities stay authoritative, an override may only
            // disable them. Enabling a capability the server does not support
            // would produce a rejected request.
            return {
                ...base,
                ...override,
                enableSorting: col.sortable && override.enableSorting !== false,
                enableGlobalFilter: col.searchable && override.enableGlobalFilter !== false,
                enableColumnFilter: col.filterable && override.enableColumnFilter !== false,
                meta: {
                    ...(base.meta ?? {}),
                    ...(override.meta ?? {}),
                },
            } as ColumnDef<DataTableFeatures, TData, unknown>;
        });

        const serverColumnNames = new Set(initialData.columns.map((col) => col.name));

        // Overrides that do not match a server column become client side columns.
        const clientColumns = Array.from(overrides.entries())
            .filter(([id]) => !serverColumnNames.has(id))
            .map(([id, override]) =>
                ({
                    ...override,
                    id,
                    enableSorting: false,
                    enableGlobalFilter: false,
                    enableColumnFilter: false,
                    meta: {
                        ...(override.meta ?? {}),
                        client_only: true,
                    },
                }) as ColumnDef<DataTableFeatures, TData, unknown>
            );

        if (!actions) {
            return [...serverColumns, ...clientColumns];
        }

        const actionsColumn: ColumnDef<DataTableFeatures, TData, unknown> = {
            id: DATA_TABLE_ACTIONS_COLUMN_ID,
            header: () => null,
            cell: (info) =>
                actions({
                    row: info.row.original,
                    rowIndex: info.row.index,
                }),
            enableSorting: false,
            enableGlobalFilter: false,
            enableColumnFilter: false,
            meta: {
                client_only: true,
            },
        };

        return [...serverColumns, ...clientColumns, actionsColumn];
    }, [initialData.columns, columnHelper, columnOverrides, cells, actions]);

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

    const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>(initialColumnVisibility);

    const pageProps = useInertiaPageProps();

    useEffect(() => {
        if (!isDevelopmentEnvironment() || !pageProps) {
            return;
        }

        if (Object.keys(pageProps).length === 0 || pageProps[dataPropName] !== undefined) {
            return;
        }

        if (warnedPropRef.current === dataPropName) {
            return;
        }

        warnedPropRef.current = dataPropName;

        console.warn(
            `[inertia-datatables] The Inertia page prop "${dataPropName}" was not found on the current page. ` +
                'Partial reloads will not refresh the table. Pass the correct "dataPropName" to <DataTable />.'
        );
    }, [pageProps, dataPropName]);

    useEffect(() => {
        sortingRef.current = sorting;
    }, [sorting]);

    const visitWithParams = useCallback(
        (params: Record<string, unknown>, overrides: { replace?: boolean } = {}) => {
            const currentParams = new URLSearchParams(window.location.search);
            Object.entries(params).forEach(([key, value]) => {
                // Remove any leftover scalar or array form of this key so
                // multi-value filters (`filters[col][]=a&filters[col][]=b`) are
                // written correctly and can be fully cleared.
                currentParams.delete(key);
                currentParams.delete(`${key}[]`);

                if (Array.isArray(value)) {
                    value.forEach((item) => currentParams.append(`${key}[]`, String(item)));
                } else if (value !== '' && value !== null && value !== undefined) {
                    currentParams.set(key, String(value));
                }
            });

            const {
                onStart,
                onFinish,
                onSuccess,
                onError,
                onHttpException,
                onNetworkError,
                replace,
                only,
                ...restVisitOptions
            } = visitOptions ?? {};

            router.visit(window.location.pathname + '?' + currentParams.toString(), {
                preserveScroll: true,
                preserveState: true,
                ...restVisitOptions,
                only: only ?? [dataPropName],
                replace: replace ?? overrides.replace ?? false,
                onStart: () => {
                    setIsLoading(true);
                    setError(null);
                    onStart?.();
                },
                onFinish: () => {
                    setIsLoading(false);
                    onFinish?.();
                },
                onSuccess: () => {
                    onSuccess?.();
                },
                onError: (errors: DataTableErrors) => {
                    setIsLoading(false);
                    setError(errors);
                    onError?.(errors);
                },
                onHttpException: (response: DataTableHttpException) => {
                    setIsLoading(false);
                    onHttpException?.(response);
                },
                onNetworkError: (networkError: Error) => {
                    setIsLoading(false);
                    onNetworkError?.(networkError);
                },
            });
        },
        [dataPropName, visitOptions]
    );

    const debouncedVisit = useCallback(
        (key: string, params: Record<string, unknown>) => {
            if (debounceTimersRef.current[key]) {
                clearTimeout(debounceTimersRef.current[key]);
            }
            debounceTimersRef.current[key] = setTimeout(() => {
                // Update last sent values when request is actually sent
                if (key === 'search' && 'search' in params) {
                    lastSentRef.current.search = String(params.search);
                } else if (key.startsWith('searches.') && 'search' in params) {
                    const column = key.replace('searches.', '');
                    const value = params[`searches[${column}]`];
                    lastSentRef.current.searches = {
                        ...lastSentRef.current.searches,
                        [column]: value === undefined ? '' : String(value),
                    };
                } else if (key.startsWith('filters.') && 'filters' in params) {
                    const column = key.replace('filters.', '');
                    const value = params[`filters[${column}]`];
                    lastSentRef.current.filters = {
                        ...lastSentRef.current.filters,
                        [column]: value,
                    };
                }
                visitWithParams(params, { replace: true });
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
            visitWithParams({ sort: sortString }, { replace: true });
        },
        [visitWithParams]
    );

    const handlePageChange = useCallback(
        (page: number) => {
            setState((prev) => ({ ...prev, page }));
            setPagination((prev) => ({ ...prev, pageIndex: page - 1 }));
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
            debouncedVisit(`filters.${column}`, { [`filters[${column}]`]: paramValue, page: 1 });
        },
        [debouncedVisit]
    );

    const handleColumnVisibilityChange = useCallback(
        (updater: ColumnVisibilityState | ((_old: ColumnVisibilityState) => ColumnVisibilityState)) => {
            const newVisibility = typeof updater === 'function' ? updater(columnVisibility) : updater;
            setColumnVisibility(newVisibility);
        },
        [columnVisibility]
    );

    useEffect(() => {
        const incomingSearch = initialData.query.search;
        const incomingSearches = Object.fromEntries(
            initialData.query.searches.map((s) => [s.column, s.value])
        );
        const incomingFilters = Object.fromEntries(
            initialData.query.filters.map((f) => [f.column, f.value])
        );

        // Check if there's a pending debounce timer for each field type
        // If a timer is pending, the user has typed something new since the last request was sent
        // so we should keep the local draft and not overwrite with the server response
        const searchTimerPending = 'search' in debounceTimersRef.current;
        const searchesTimersPending = Object.keys(debounceTimersRef.current).some((k) =>
            k.startsWith('searches.')
        );
        const filtersTimersPending = Object.keys(debounceTimersRef.current).some((k) =>
            k.startsWith('filters.')
        );

        // Only sync when no pending timer (user has stopped typing or server initiated change)
        const shouldSyncSearch = !searchTimerPending;
        const shouldSyncSearches = !searchesTimersPending;
        const shouldSyncFilters = !filtersTimersPending;

        setState((prev) => ({
            page: initialData.query.page,
            perPage: initialData.query.per_page,
            search: shouldSyncSearch ? incomingSearch : prev.search,
            sort: initialData.query.sort.map((s) => ({
                column: s.column,
                direction: s.direction as 'asc' | 'desc',
            })),
            searches: shouldSyncSearches ? incomingSearches : prev.searches,
            filters: shouldSyncFilters ? incomingFilters : prev.filters,
        }));

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

        if (shouldSyncSearch) {
            setGlobalFilter(incomingSearch);
        }
        if (shouldSyncFilters) {
            setColumnFilters(
                Object.entries(incomingFilters).map(([id, value]) => ({ id, value })) as ColumnFiltersState
            );
        }
        if (shouldSyncSearches) {
            setColumnSearches(incomingSearches);
        }
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

    const table = useTable<DataTableFeatures, TData>({
        features: dataTableFeatures,
        data: initialData.data,
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
        manualPagination: true,
        manualSorting: true,
        manualFiltering: true,
        pageCount: initialData.meta.last_page,
        ...(rowKey ? { getRowId: (row: TData, index: number) => rowKey(row, index) } : {}),
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
        isLoading,
        error,
    };
}
