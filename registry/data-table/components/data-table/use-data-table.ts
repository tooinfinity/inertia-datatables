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
    type RowSelectionState,
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
    DataTableQuery,
} from './types';
import { dataTableFeatures, type DataTableFeatures } from './table-features';
import { defaultCellFormatter } from './cell-formatters';

type ColumnSearchesState = Record<string, string>;

type StateUpdater<T> = T | ((_old: T) => T);

/**
 * Effective query-string key names. Defaults match the PHP defaults when the
 * backend does not send `config.query_keys` (older versions).
 */
interface QueryKeys {
    page: string;
    per_page: string;
    search: string;
    searches: string;
    sort: string;
    filters: string;
}

const DEFAULT_QUERY_KEYS: QueryKeys = {
    page: 'page',
    per_page: 'per_page',
    search: 'search',
    searches: 'searches',
    sort: 'sort',
    filters: 'filters',
};

/**
 * Seeds DataTable-owned query parameters from the initial server state into the
 * endpoint query, preserving any parameters already configured on the endpoint
 * URL itself. Empty values are skipped so they do not pollute the URL.
 */
function seedEndpointQuery(
    params: URLSearchParams,
    query: DataTableQuery,
    keys: QueryKeys
): URLSearchParams {
    const setIfMissing = (key: string, value: string | undefined) => {
        if (value !== '' && value !== null && value !== undefined && !params.has(key)) {
            params.set(key, value);
        }
    };

    setIfMissing(keys.page, String(query.page));
    setIfMissing(keys.per_page, String(query.per_page));
    setIfMissing(keys.search, query.search);

    const sortString = query.sort
        .map((s) => (s.direction === 'desc' ? `-${s.column}` : s.column))
        .join(',');
    setIfMissing(keys.sort, sortString || undefined);

    query.searches.forEach((s) => {
        setIfMissing(`${keys.searches}[${s.column}]`, s.value);
    });

    query.filters.forEach((f) => {
        const key = `${keys.filters}[${f.column}]`;
        if (Array.isArray(f.value)) {
            // Preserve an existing endpoint filter entirely; otherwise append
            // every selected value so an initial/recovery visit does not
            // silently drop array members already present on the URL.
            if (!params.has(`${key}[]`)) {
                f.value.forEach((v) => params.append(`${key}[]`, String(v)));
            }
        } else if (f.value !== '' && f.value !== null && f.value !== undefined) {
            setIfMissing(key, String(f.value as string));
        }
    });

    return params;
}

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
    url,
    rowKey,
    enableRowSelection,
    onRowSelectionChange,
}: DataTableOptions<TData>) {
    const mountedRef = useRef(false);
    const debounceTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
    const sortingRef = useRef<SortingState>([]);
    const warnedPropRef = useRef<string | null>(null);
    // Effective query params for an explicit endpoint URL, retained across
    // sequential visits so search→pagination and clear→pagination keep their
    // related parameters instead of rebuilding from the configured URL each
    // time. When `url` is omitted the browser location is the source of truth,
    // so we only track state for explicit endpoints.
    const endpointQueryRef = useRef<URLSearchParams | null>(null);
    const endpointUrlRef = useRef<string | null>(null);
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
    // Tracks the recovery context (page + endpoint) for which an
    // out-of-range recovery visit was already initiated, so repeated renders
    // (incl. StrictMode double-invoke) do not issue duplicate recovery visits.
    // Cleared once a valid response arrives or the page becomes valid again.
    const recoveredPageRef = useRef<{ page: number; url: string | null } | null>(null);

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
    const KEYS: QueryKeys = useMemo<QueryKeys>(
        () => ({
            ...DEFAULT_QUERY_KEYS,
            ...(initialData.config?.query_keys),
        }),
        [initialData.config?.query_keys]
    );

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
                    ...(base.meta),
                    ...(override.meta),
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
                        ...(override.meta),
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

    const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

    const handleRowSelectionChange = useCallback(
        (updater: StateUpdater<RowSelectionState>) => {
            setRowSelection((prev) => {
                const next = typeof updater === 'function' ? updater(prev) : updater;
                onRowSelectionChange?.(next);
                return next;
            });
        },
        [onRowSelectionChange]
    );

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
        (params: Record<string, unknown>, overrides: { replace?: boolean; forceReplace?: boolean } = {}) => {
            // Target the explicit endpoint URL when one is configured
            // (e.g. a Laravel Wayfinder generated URL), otherwise the current
            // page pathname. The URL is treated as same-origin: only its
            // pathname and query are used for the visit.
            const endpoint = url ?? window.location.pathname;
            const endpointUrl = new URL(endpoint, window.location.href);

            // Determine the effective query. For an explicit endpoint we retain
            // state across visits so search→pagination and clear→pagination
            // keep their related parameters. When `url` is omitted, the browser
            // location is the source of truth.
            let currentParams: URLSearchParams;
            if (url) {
                if (endpointUrlRef.current !== url) {
                    // New endpoint: start from its own query parameters, then
                    // seed any DataTable-owned parameters from the initial
                    // server state that are not already configured on the
                    // endpoint URL itself.
                    endpointQueryRef.current = seedEndpointQuery(
                        new URLSearchParams(endpointUrl.search),
                        initialData.query,
                        KEYS
                    );
                    endpointUrlRef.current = url;
                }
                currentParams = new URLSearchParams(endpointQueryRef.current!.toString());
            } else {
                currentParams = new URLSearchParams(window.location.search);
            }
            Object.entries(params).forEach(([key, value]) => {
                // Remove any leftover scalar or array form of this key so
                // multi-value filters (`filters[col][]=a&filters[col][]=b`) are
                // written correctly and can be fully cleared.
                currentParams.delete(key);
                currentParams.delete(`${key}[]`);

                if (Array.isArray(value)) {
                    value.forEach((item) => currentParams.append(`${key}[]`, String(item as string)));
                } else if (value !== '' && value !== null && value !== undefined) {
                    currentParams.set(key, String(value as string));
                }
            });

            // Persist the effective query for explicit endpoints so cleared
            // parameters stay cleared and unrelated state survives pagination.
            if (url) {
                endpointQueryRef.current = currentParams;
            }

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

            router.visit(endpointUrl.pathname + '?' + currentParams.toString(), {
                preserveScroll: true,
                preserveState: true,
                ...restVisitOptions,
                only: only ?? [dataPropName],
                replace: overrides.forceReplace ? true : replace ?? overrides.replace ?? false,
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
        [dataPropName, visitOptions, url, KEYS, initialData.query]
    );

    const debouncedVisit = useCallback(
        (key: string, params: Record<string, unknown>) => {
            if (debounceTimersRef.current[key]) {
                clearTimeout(debounceTimersRef.current[key]);
            }
            debounceTimersRef.current[key] = setTimeout(() => {
                // Update last sent values when request is actually sent
                if (key === 'search' && KEYS.search in params) {
                    lastSentRef.current.search = String(params[KEYS.search] as string);
                } else if (key.startsWith('searches.') && KEYS.searches in params) {
                    const column = key.replace('searches.', '');
                    const value = params[`${KEYS.searches}[${column}]`];
                    lastSentRef.current.searches = {
                        ...lastSentRef.current.searches,
                        [column]: value === undefined ? '' : String(value as string),
                    };
                } else if (key.startsWith('filters.') && KEYS.filters in params) {
                    const column = key.replace('filters.', '');
                    const value = params[`${KEYS.filters}[${column}]`];
                    lastSentRef.current.filters = {
                        ...lastSentRef.current.filters,
                        [column]: value,
                    };
                }
                visitWithParams(params, { replace: true });
                delete debounceTimersRef.current[key];
            }, debounceMs);
        },
        [visitWithParams, debounceMs, KEYS.search, KEYS.searches, KEYS.filters]
    );

    const handleSortChange = useCallback(
        (updater: StateUpdater<SortingState>) => {
            const newSorting = typeof updater === 'function' ? updater(sortingRef.current) : updater;
            setSorting(newSorting);
            const sortString = newSorting
                .map((s) => (s.desc ? `-${s.id}` : s.id))
                .join(',');
            setState((prev) => ({
                ...prev,
                sort: newSorting.map((s) => ({ column: s.id, direction: s.desc ? 'desc' : 'asc' })),
            }));
            visitWithParams({ [KEYS.sort]: sortString }, { replace: true });
        },
        [visitWithParams, KEYS.sort]
    );

    const handlePageChange = useCallback(
        (page: number) => {
            setState((prev) => ({ ...prev, page }));
            setPagination((prev) => ({ ...prev, pageIndex: page - 1 }));
            visitWithParams({ [KEYS.page]: page });
        },
        [visitWithParams, KEYS.page]
    );

    const handlePerPageChange = useCallback(
        (pageSize: number) => {
            setState((prev) => ({ ...prev, perPage: pageSize, page: 1 }));
            setPagination((prev) => ({ ...prev, pageSize, pageIndex: 0 }));
            visitWithParams({ [KEYS.per_page]: pageSize, [KEYS.page]: 1 });
        },
        [visitWithParams, KEYS.per_page, KEYS.page]
    );

    const handleSearchChange = useCallback(
        (value: string) => {
            setGlobalFilter(value);
            setState((prev) => ({ ...prev, search: value, page: 1 }));
            setPagination((prev) => ({ ...prev, pageIndex: 0 }));
            debouncedVisit('search', { [KEYS.search]: value, [KEYS.page]: 1 });
        },
        [debouncedVisit, KEYS.search, KEYS.page]
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
            debouncedVisit(`searches.${column}`, {
                [`${KEYS.searches}[${column}]`]: value || undefined,
                [KEYS.page]: 1,
            });
        },
        [debouncedVisit, KEYS.searches, KEYS.page]
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
            debouncedVisit(`filters.${column}`, {
                [`${KEYS.filters}[${column}]`]: paramValue,
                [KEYS.page]: 1,
            });
        },
        [debouncedVisit, KEYS.filters, KEYS.page]
    );

    const handleClearColumnFilter = useCallback(
        (column: string, clearSearch: boolean = false) => {
            if (debounceTimersRef.current[`filters.${column}`]) {
                clearTimeout(debounceTimersRef.current[`filters.${column}`]);
                delete debounceTimersRef.current[`filters.${column}`];
            }
            if (clearSearch && debounceTimersRef.current[`searches.${column}`]) {
                clearTimeout(debounceTimersRef.current[`searches.${column}`]);
                delete debounceTimersRef.current[`searches.${column}`];
            }

            setColumnFilters((prev) => prev.filter((f) => f.id !== column));
            if (clearSearch) {
                setColumnSearches((prev) => {
                    const next = { ...prev };
                    delete next[column];
                    return next;
                });
            }

            setState((prev) => {
                const nextFilters = { ...prev.filters };
                delete nextFilters[column];
                const nextSearches = { ...prev.searches };
                if (clearSearch) {
                    delete nextSearches[column];
                }
                return {
                    ...prev,
                    filters: nextFilters,
                    searches: nextSearches,
                    page: 1,
                };
            });
            setPagination((prev) => ({ ...prev, pageIndex: 0 }));

            delete lastSentRef.current.filters[column];
            if (clearSearch) {
                delete lastSentRef.current.searches[column];
            }

            const params: Record<string, undefined | number> = {
                [`${KEYS.filters}[${column}]`]: undefined,
                [KEYS.page]: 1,
            };
            if (clearSearch) {
                params[`${KEYS.searches}[${column}]`] = undefined;
            }

            debouncedVisit(`column.${column}.clear`, params);
        },
        [debouncedVisit, KEYS.filters, KEYS.searches, KEYS.page]
    );

    const handleColumnVisibilityChange = useCallback(
        (updater: StateUpdater<ColumnVisibilityState>) => {
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

        // Reconcile the retained endpoint query with the authoritative server
        // state so pagination and other visits use the current values rather
        // than a stale cached value. Pending debounced drafts are preserved so
        // in-flight typing is not reverted by a server response.
        if (url && endpointQueryRef.current) {
            const nextQuery = new URLSearchParams(endpointQueryRef.current.toString());

            // Page and page size are always authoritative.
            nextQuery.set(KEYS.page, String(initialData.query.page));
            nextQuery.set(KEYS.per_page, String(initialData.query.per_page));

            // Sorting is always authoritative.
            const sortString = initialData.query.sort
                .map((s) => (s.direction === 'desc' ? `-${s.column}` : s.column))
                .join(',');
            if (sortString) {
                nextQuery.set(KEYS.sort, sortString);
            } else {
                nextQuery.delete(KEYS.sort);
            }

            if (shouldSyncSearch) {
                if (incomingSearch) {
                    nextQuery.set(KEYS.search, incomingSearch);
                } else {
                    nextQuery.delete(KEYS.search);
                }
            }

            if (shouldSyncSearches) {
                Array.from(nextQuery.keys())
                    .filter((key) => key.startsWith(`${KEYS.searches}[`))
                    .forEach((key) => nextQuery.delete(key));
                Object.entries(incomingSearches).forEach(([column, value]) => {
                    nextQuery.set(`${KEYS.searches}[${column}]`, value);
                });
            }

            if (shouldSyncFilters) {
                Array.from(nextQuery.keys())
                    .filter((key) => key.startsWith(`${KEYS.filters}[`))
                    .forEach((key) => nextQuery.delete(key));
                initialData.query.filters.forEach((f) => {
                    const key = `${KEYS.filters}[${f.column}]`;
                    if (Array.isArray(f.value)) {
                        f.value.forEach((v) => nextQuery.append(`${key}[]`, String(v)));
                    } else if (f.value !== '' && f.value !== null && f.value !== undefined) {
                        nextQuery.set(key, String(f.value as string));
                    }
                });
            }

            endpointQueryRef.current = nextQuery;
        }
    }, [initialData.query, KEYS, url]);

    // Automatically recover from an out-of-range page. When records are deleted
    // or modified, the server may report a current_page greater than last_page
    // while returning an empty result for that page. Navigate to the last
    // available page so the table does not stay stuck on an invalid page.
    useEffect(() => {
        const { current_page, last_page } = initialData.meta;
        const endpoint = url ?? window.location.pathname;

        // Nothing to recover: no pages at all, or the current page is valid.
        if (last_page < 1 || current_page <= last_page) {
            recoveredPageRef.current = null;
            return;
        }

        // Avoid issuing duplicate recovery visits for the same recovery context
        // (page + endpoint). A different endpoint or page still recovers.
        if (
            recoveredPageRef.current?.page === current_page &&
            recoveredPageRef.current?.url === endpoint
        ) {
            return;
        }

        recoveredPageRef.current = { page: current_page, url: endpoint };
        visitWithParams({ [KEYS.page]: last_page }, { forceReplace: true });
    }, [initialData.meta, visitWithParams, KEYS.page, url]);

    useEffect(() => {
        return () => {
            Object.values(debounceTimersRef.current).forEach((timer) => clearTimeout(timer));
            debounceTimersRef.current = {};
        };
    }, [url]);

    if (!mountedRef.current) {
        mountedRef.current = true;
    }

    const handleResetFilters = useCallback(() => {
        Object.values(debounceTimersRef.current).forEach((timer) => clearTimeout(timer));
        debounceTimersRef.current = {};

        setGlobalFilter('');
        setColumnSearches({});
        setColumnFilters([]);
        setState((prev) => ({
            ...prev,
            search: '',
            searches: {},
            filters: {},
            page: 1,
        }));
        setPagination((prev) => ({ ...prev, pageIndex: 0 }));

        lastSentRef.current = {
            search: '',
            searches: {},
            filters: {},
        };

        const resetParams: Record<string, undefined | number> = {
            [KEYS.search]: undefined,
            [KEYS.page]: 1,
        };

        Object.keys(columnSearches).forEach((col) => {
            resetParams[`${KEYS.searches}[${col}]`] = undefined;
        });

        Object.keys(state.filters).forEach((col) => {
            resetParams[`${KEYS.filters}[${col}]`] = undefined;
        });

        visitWithParams(resetParams, { replace: true });
    }, [visitWithParams, KEYS.search, KEYS.searches, KEYS.filters, KEYS.page, columnSearches, state.filters]);

    const isFiltered = useMemo(() => {
        return (
            Boolean(state.search) ||
            Object.values(columnSearches).some((v) => Boolean(v)) ||
            Object.values(state.filters).some(
                (v) => v !== '' && v !== null && v !== undefined
            )
        );
    }, [state.search, columnSearches, state.filters]);

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
            rowSelection,
        },
        onSortingChange: handleSortChange,
        onPaginationChange: setPagination,
        onGlobalFilterChange: setGlobalFilter,
        onColumnFiltersChange: setColumnFilters,
        onColumnVisibilityChange: handleColumnVisibilityChange,
        onRowSelectionChange: handleRowSelectionChange,
        enableRowSelection,
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
        handleClearColumnFilter,
        handleResetFilters,
        isFiltered,
        rowSelection,
        setRowSelection,
        perPageOptions,
        columnSearches,
        isLoading,
        error,
    };
}