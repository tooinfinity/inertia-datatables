'use client';

import { forwardRef, type ReactNode } from 'react';
import { flexRender } from '@tanstack/react-table';
import { type DataTableResponse } from './types';
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableRow,
  TableCell,
} from '@ui/table';
import { DataTableToolbar } from './data-table-toolbar';
import { DataTablePagination } from './data-table-pagination';
import { DataTableColumnHeader } from './data-table-column-header';
import { DataTableColumnVisibility } from './data-table-column-visibility';
import { DataTableEmpty } from './data-table-empty';
import { useDataTable } from './use-data-table';

interface DataTableProps<TData extends Record<string, unknown>> {
  data: DataTableResponse<TData>;
  children?: ReactNode;
  className?: string;
}

export const DataTable = forwardRef<HTMLTableElement, DataTableProps<Record<string, unknown>>>(
  ({ data, children, className, ...props }, ref) => {
    const {
      table,
      handlePageChange,
      handlePerPageChange,
      handleSearchChange,
      handleColumnSearchChange,
      handleFilterChange,
      state,
      perPageOptions,
    } = useDataTable({ data });

    return (
      <div className="space-y-4">
        <DataTableToolbar
          search={state.search}
          onSearchChange={handleSearchChange}
          perPage={state.perPage}
          onPerPageChange={handlePerPageChange}
          perPageOptions={perPageOptions}
        />
        <div className="rounded-md border">
          <Table ref={ref} className="w-full caption-bottom text-sm" {...props}>
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
                    />
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length === 0 ? (
                <DataTableEmpty columns={table.getAllLeafColumns().length} />
              ) : (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id} className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="p-4 align-middle">
                        {flexRender(cell.column.columnDef.cell!, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
            <TableFooter>
              <DataTablePagination
                currentPage={state.page}
                perPage={state.perPage}
                onPageChange={handlePageChange}
                totalPages={data.meta.last_page}
                totalItems={data.meta.total}
              />
            </TableFooter>
          </Table>
        </div>
        <DataTableColumnVisibility table={table} />
        {children}
      </div>
    );
  }
);

DataTable.displayName = 'DataTable';