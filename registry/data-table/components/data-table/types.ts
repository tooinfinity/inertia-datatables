import type { ReactNode } from 'react';
import type {
    CellContext,
    ColumnDef,
    ColumnFiltersState,
    ColumnVisibilityState,
    PaginationState,
    Row,
    RowData,
    RowSelectionState,
    SortingState,
} from '@tanstack/react-table';
import type { DataTableFeatures } from './table-features';

export interface DataTableColumn<TData extends RowData = Record<string, unknown>> {
    name: string;
    label: string;
    sortable: boolean;
    searchable: boolean;
    filterable: boolean;
    hidden: boolean;
    filter_type?: 'text' | 'select' | 'boolean' | null;
    filter_options?: Array<{ value: string | number; label: string }>;
    /** Custom cell formatter. Receives the cell context and returns a React node. */
    cell?: (info: CellContext<DataTableFeatures, TData, unknown>) => ReactNode;
}

/**
 * Renders the content of a single cell.
 *
 * The renderer receives the TanStack cell context, so the raw value is
 * available through `info.getValue()` and the row through `info.row.original`.
 */
export type DataTableCellRenderer<TData extends RowData = Record<string, unknown>> = (
    info: CellContext<DataTableFeatures, TData, unknown>
) => ReactNode;

/** Cell renderers keyed by the column name they belong to. */
export type DataTableCellRenderers<TData extends RowData = Record<string, unknown>> = Record<
    string,
    DataTableCellRenderer<TData>
>;

/** Context handed to the row actions renderer. */
export interface DataTableRowActionsContext<TData extends RowData = Record<string, unknown>> {
    /** The row the actions belong to. */
    row: TData;
    /** Zero based index of the row inside the current page. */
    rowIndex: number;
}

/** Renders the trailing actions cell of a row. */
export type DataTableRowActions<TData extends RowData = Record<string, unknown>> = (
    context: DataTableRowActionsContext<TData>
) => ReactNode;

/** Validation errors reported by the Inertia response. */
export type DataTableErrors = Record<string, string>;

/** The response of a failed request that answered with a 4xx or 5xx status. */
export interface DataTableHttpException {
    status: number;
    data: string | Record<string, unknown>;
    headers: Record<string, string>;
}

/**
 * Options forwarded to the underlying Inertia `router.visit` call.
 *
 * Only the options that make sense for a data table are exposed. Everything
 * else is intentionally left out to keep the public API small.
 */
export interface DataTableVisitOptions {
    /** Replace the current history entry instead of pushing a new one. */
    replace?: boolean;
    /** Keep the current scroll position. Defaults to `true`. */
    preserveScroll?: boolean;
    /** Keep the current component state. Defaults to `true`. */
    preserveState?: boolean;
    /** Props that should be requested on the partial reload. */
    only?: string[];
    /** Props that should be excluded from the partial reload. */
    except?: string[];
    /** Additional headers sent with the request. */
    headers?: Record<string, string>;
    /** Toggle the Inertia progress bar for these visits. */
    showProgress?: boolean;
    /** Called right before the request is sent. */
    onStart?: () => void;
    /** Called after the response was processed. */
    onFinish?: () => void;
    /** Called after a successful response. */
    onSuccess?: () => void;
    /** Called when the endpoint answered with validation errors. */
    onError?: (_errors: DataTableErrors) => void;
    /** Called when the endpoint answered with a 4xx or 5xx status. */
    onHttpException?: (_response: DataTableHttpException) => void;
    /** Called when the request could not be sent at all. */
    onNetworkError?: (_error: Error) => void;
}

export interface DataTableMeta {
    current_page: number;
    per_page: number;
    from: number | null;
    to: number | null;
    total: number;
    last_page: number;
}

export interface DataTableQuery {
    page: number;
    per_page: number;
    search: string;
    sort: Array<{ column: string; direction: string }>;
    searches: Array<{ column: string; value: string }>;
    filters: Array<{ column: string; value: unknown }>;
}

export interface DataTableQueryKeys {
    page: string;
    per_page: string;
    search: string;
    searches: string;
    sort: string;
    filters: string;
}

export interface DataTableConfig {
    debounce: number;
    per_page_options: number[];
    query_keys?: DataTableQueryKeys;
}

export interface DataTableResponse<TData extends RowData = Record<string, unknown>> {
    data: TData[];
    meta: DataTableMeta;
    query: DataTableQuery;
    columns: DataTableColumn<TData>[];
    config: DataTableConfig;
}

export interface DataTableState {
    page: number;
    perPage: number;
    search: string;
    sort: Array<{ column: string; direction: 'asc' | 'desc' }>;
    searches: Record<string, string>;
    filters: Record<string, unknown>;
}

export interface DataTableOptions<TData extends RowData = Record<string, unknown>> {
    data: DataTableResponse<TData>;
    onDataChange?: (_data: DataTableResponse<TData>) => void;
    /**
     * Optional explicit endpoint URL for the DataTable visits.
     *
     * When provided, the hook visits this URL instead of the current page's
     * pathname. Query parameters already present on the URL are preserved and
     * merged predictably with the DataTable query state (page, per-page,
     * search, column searches, filters and sorting). Consumers can pass a
     * Laravel Wayfinder generated URL, e.g. `index.url()`.
     *
     * The URL is resolved against the current origin (same-origin semantics):
     * only its pathname and query are used for the Inertia visit. Pass a path
     * such as `/users` or a same-origin absolute URL. When omitted, the current
     * page pathname is used, keeping the existing behaviour unchanged.
     */
    url?: string;
    dataPropName?: string;
    /**
     * Optional column definition overrides.
     *
     * Overrides are matched against the server provided columns by their `id`.
     * The server capabilities (`sortable`, `searchable`, `filterable`) stay
     * authoritative, an override may only disable them.
     */
    columns?: DataTableColumnDef<TData>[];
    /** Cell renderers keyed by column name. */
    cells?: DataTableCellRenderers<TData>;
    /** Renders a trailing actions cell for every row. */
    actions?: DataTableRowActions<TData>;
    /** Options forwarded to the Inertia `router.visit` call. */
    visitOptions?: DataTableVisitOptions;
    /**
     * Derives a stable row id from the row data.
     *
     * Used as the TanStack Table row id, so it must be unique and stable across
     * server-side pages and dataset updates. When omitted, a row's `id` field is
     * used when present (namespaced with `id:`). Otherwise a generation-scoped
     * fallback id (`fallback:<generation>:<page>:<index>`) is used; the
     * generation changes whenever the dataset is replaced, so selection does not
     * silently transfer to a different row at the same page/index after a
     * search, filter, sort, or per-page change. Row selection persists across
     * pages for stable ids; rows without a stable id should supply a `rowKey`
     * for reliable selection across pages and dataset updates.
     */
    rowKey?: (_row: TData, _index: number) => string;
    /** Whether row selection is enabled, or a predicate receiving the row. */
    enableRowSelection?: boolean | ((row: Row<DataTableFeatures, TData>) => boolean);
    /** Callback fired when row selection changes. */
    onRowSelectionChange?: (_selection: RowSelectionState) => void;
}

export type DataTableColumnDef<TData extends RowData = Record<string, unknown>> = ColumnDef<
    DataTableFeatures,
    TData,
    unknown
>;

export type DataTableSortingState = SortingState;
export type DataTablePaginationState = PaginationState;
export type DataTableColumnFiltersState = ColumnFiltersState;
export type DataTableVisibilityState = ColumnVisibilityState;
export type DataTableSelectionState = RowSelectionState;
