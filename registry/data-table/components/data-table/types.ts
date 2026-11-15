import type { ReactNode } from 'react';
import type {
    CellContext,
    ColumnDef,
    ColumnFiltersState,
    ColumnVisibilityState,
    PaginationState,
    RowData,
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
    filter_options?: Array<{ value: string; label: string }>;
    /** Custom cell formatter. Receives the cell context and returns a React node. */
    cell?: (info: CellContext<DataTableFeatures, TData, unknown>) => ReactNode;
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

export interface DataTableConfig {
    debounce: number;
    per_page_options: number[];
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
    dataPropName?: string;
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
