import type { DataTableColumnAlign } from './types';
import {
    columnFilteringFeature,
    columnVisibilityFeature,
    globalFilteringFeature,
    metaHelper,
    rowPaginationFeature,
    rowSelectionFeature,
    rowSortingFeature,
    tableFeatures,
} from '@tanstack/react-table';

export interface DataTableColumnMeta {
    searchable?: boolean;
    filterable?: boolean;
    filter_type?: 'text' | 'select' | 'boolean' | null;
    filter_options?: Array<{ value: string | number; label: string }>;
    /**
     * Cell and header alignment. Defaults to `left` when not set.
     */
    align?: DataTableColumnAlign;
    /**
     * Marks a column that only exists on the client (row actions, extra
     * client side columns). Those columns are never offered in the column
     * visibility menu because the server does not know about them.
     */
    client_only?: boolean;
}

export const dataTableFeatures = tableFeatures({
    columnFilteringFeature,
    columnVisibilityFeature,
    globalFilteringFeature,
    rowPaginationFeature,
    rowSelectionFeature,
    rowSortingFeature,
    columnMeta: metaHelper<DataTableColumnMeta>(),
});

export type DataTableFeatures = typeof dataTableFeatures;
