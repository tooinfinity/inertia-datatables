'use client';

import { type ReactNode, forwardRef, type ReactElement, type Ref, useMemo } from 'react';
import { flexRender, type RowData, type RowSelectionState } from '@tanstack/react-table';
import {
    type DataTableCellRenderers,
    type DataTableColumnDef,
    type DataTableErrors,
    type DataTableResponse,
    type DataTableRowActions,
    type DataTableVisitOptions,
} from './types';
import {
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableCell,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { DataTableToolbar } from './data-table-toolbar';
import { DataTablePagination } from './data-table-pagination';
import { DataTableColumnHeader } from './data-table-column-header';
import { DataTableEmpty } from './data-table-empty';
import { useDataTable, DATA_TABLE_ACTIONS_COLUMN_ID } from './use-data-table';

export interface DataTableProps<TData extends RowData> {
    data: DataTableResponse<TData>;
    children?: ReactNode;
    dataPropName?: string;
    /** Column definition overrides, matched against the server columns by id. */
    columns?: DataTableColumnDef<TData>[];
    /** Cell renderers keyed by column name. */
    cells?: DataTableCellRenderers<TData>;
    /** Renders a trailing actions cell for every row. */
    actions?: DataTableRowActions<TData>;
    /** Extra content rendered next to the search field. */
    toolbar?: ReactNode;
    /** Replaces the default empty state. */
    empty?: ReactNode;
    /** Derives a stable row id from the row data. */
    rowKey?: (_row: TData, _index: number) => string;
    /** Called when a row is clicked. */
    onRowClick?: (_row: TData, _index: number) => void;
    /** Whether row selection is enabled, or a predicate receiving the row. */
    enableRowSelection?: boolean | ((_row: TData) => boolean);
    /** Callback fired when row selection changes. */
    onRowSelectionChange?: (_selection: RowSelectionState) => void;
    /** Options forwarded to the Inertia `router.visit` call. */
    visitOptions?: DataTableVisitOptions;
    /** Called when the endpoint answered with validation errors. */
    onError?: (_errors: DataTableErrors) => void;
    /** Number of skeleton rows rendered while a visit is in flight. */
    skeletonRows?: number;
}

const DataTableComponent = forwardRef<HTMLTableElement, DataTableProps<Record<string, unknown>>>(
    (
        {
            data,
            children,
            dataPropName = 'data',
            columns,
            cells,
            actions,
            toolbar,
            empty,
            rowKey,
            onRowClick,
            visitOptions,
            onError,
            skeletonRows = 5,
            ...props
        },
        ref
    ) => {
        const mergedVisitOptions = useMemo<DataTableVisitOptions>(
            () => ({
                ...visitOptions,
                onError: (errors: DataTableErrors) => {
                    visitOptions?.onError?.(errors);
                    onError?.(errors);
                },
            }),
            [visitOptions, onError]
        );

        const {
            table,
            handlePageChange,
            handlePerPageChange,
            handleSearchChange,
            handleColumnSearchChange,
            handleFilterChange,
            handleResetFilters,
            isFiltered,
            state,
            perPageOptions,
            columnSearches,
            isLoading,
        } = useDataTable<Record<string, unknown>>({
            data,
            dataPropName,
            columns,
            cells,
            actions,
            visitOptions: mergedVisitOptions,
            rowKey,
        });

        const rows = table.getRowModel().rows;
        const visibleColumnCount = Math.max(
            1,
            table.getAllLeafColumns().filter((column) => column.getIsVisible()).length
        );

        return (
            <div className="space-y-4">
                <DataTableToolbar
                    table={table}
                    search={state.search}
                    onSearchChange={handleSearchChange}
                    isFiltered={isFiltered}
                    onReset={handleResetFilters}
                >
                    {toolbar}
                </DataTableToolbar>
                <div className="relative w-full overflow-x-auto rounded-md border">
                    <Table ref={ref} className="w-full caption-bottom text-sm" aria-busy={isLoading} {...props}>
                        <TableHeader>
                            {table.getHeaderGroups().map((headerGroup) => (
                                <TableRow key={headerGroup.id}>
                                    {headerGroup.headers.map((header) => (
                                        <DataTableColumnHeader
                                            key={header.id}
                                            header={header}
                                            column={header.column}
                                            onColumnSearchChange={handleColumnSearchChange}
                                            onFilterChange={handleFilterChange}
                                            columnSearchValue={columnSearches[header.column.id] ?? ''}
                                            currentFilterValue={state.filters[header.column.id]}
                                        />
                                    ))}
                                </TableRow>
                            ))}
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                Array.from({ length: skeletonRows }).map((_, rowIndex) => (
                                    <TableRow key={`skeleton-${rowIndex}`}>
                                        {Array.from({ length: visibleColumnCount }).map((__, cellIndex) => (
                                            <TableCell key={cellIndex} className="p-4 align-middle">
                                                <Skeleton className="h-4 w-full" />
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                ))
                            ) : rows.length === 0 ? (
                                <DataTableEmpty columns={visibleColumnCount}>
                                    {empty}
                                </DataTableEmpty>
                            ) : (
                                rows.map((row) => (
                                    <TableRow
                                        key={row.id}
                                        data-state={(row as { getIsSelected?: () => boolean }).getIsSelected?.() ? 'selected' : undefined}
                                        role={onRowClick ? 'button' : undefined}
                                        tabIndex={onRowClick ? 0 : undefined}
                                        onClick={
                                            onRowClick
                                                ? () => onRowClick(row.original, row.index)
                                                : undefined
                                        }
                                        onKeyDown={
                                            onRowClick
                                                ? (e) => {
                                                      if (e.key === 'Enter' || e.key === ' ') {
                                                          e.preventDefault();
                                                          onRowClick(row.original, row.index);
                                                      }
                                                  }
                                                : undefined
                                        }
                                        className={
                                            onRowClick
                                                ? 'cursor-pointer border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted focus-visible:outline-none focus-visible:bg-muted/50'
                                                : 'border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted'
                                        }
                                    >
                                        {row.getVisibleCells().map((cell) => (
                                            <TableCell
                                                key={cell.id}
                                                className="p-4 align-middle"
                                                onClick={
                                                    cell.column.id === DATA_TABLE_ACTIONS_COLUMN_ID
                                                        ? (e) => e.stopPropagation()
                                                        : undefined
                                                }
                                            >
                                                {flexRender(cell.column.columnDef.cell!, cell.getContext())}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
                <DataTablePagination
                    currentPage={state.page}
                    perPage={state.perPage}
                    onPageChange={handlePageChange}
                    onPerPageChange={handlePerPageChange}
                    perPageOptions={perPageOptions}
                    totalPages={data.meta.last_page}
                    totalItems={data.meta.total}
                    selectedCount={
                        (table as unknown as { getSelectedRowModel?: () => { rows: unknown[] } }).getSelectedRowModel?.()?.rows?.length ?? 0
                    }
                />
                {children}
            </div>
        );
    }
);

export const DataTable = Object.assign(
    DataTableComponent as <TData extends RowData>(
        props: DataTableProps<TData> & { ref?: Ref<HTMLTableElement> }
    ) => ReactElement | null,
    { displayName: 'DataTable' }
);
