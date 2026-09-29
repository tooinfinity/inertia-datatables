import { useCallback, useMemo, useRef, useState } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  getFilteredRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type PaginationState,
  type ColumnFiltersState,
  type GlobalFilterState,
} from '@tanstack/react-table';
import { useRouter } from '@inertiajs/react';
import type { DataTableColumn, DataTableResponse, DataTableState, DataTableOptions } from './types';

const columnHelper = createColumnHelper<Record<string, unknown>>();

export function useDataTable<TData extends Record<string, unknown>>({
  data: initialData,
  onDataChange,
}: DataTableOptions<TData>) {
  const router = useRouter();
  const mountedRef = useRef(false);

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

  const debounceTimersRef = useRef<Record<string, NodeJS.Timeout>>({});

  const columns = useMemo<ColumnDef<TData>[]>(() => {
    return initialData.columns
      .filter((col) => !col.hidden)
      .map((col) => {
        const column = columnHelper.accessor(col.name, {
          header: col.label,
          cell: (info) => flexRender(info.column.columnDef.cell!, info.getContext()),
        });

        if (col.sortable) {
          column.enableSorting = true;
        }

        if (col.filterable) {
          column.enableFiltering = true;
        }

        return column;
      });
  }, [initialData.columns]);

  const [sorting, setSorting] = useState<SortingState>(
    state.sort.map((s) => ({ id: s.column, desc: s.direction === 'desc' }))
  );

  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: state.page - 1,
    pageSize: state.perPage,
  });

  const [globalFilter, setGlobalFilter] = useState<GlobalFilterState>(state.search);

  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(
    Object.entries(state.searches).map(([key, value]) => ({ id: key, value })) as ColumnFiltersState
  );

  const table = useReactTable({
    data: initialData.data as TData[],
    columns,
    state: {
      sorting,
      pagination,
      globalFilter,
      columnFilters,
    },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    manualGlobalFilter: true,
    pageCount: initialData.meta.last_page,
  });

  const handlePageChange = useCallback(
    (pageIndex: number) => {
      const page = pageIndex + 1;
      setState((prev) => ({ ...prev, page }));
      visitWithParams({ page });
    },
    []
  );

  const handlePerPageChange = useCallback(
    (pageSize: number) => {
      setState((prev) => ({ ...prev, perPage: pageSize, page: 1 }));
      visitWithParams({ per_page: pageSize, page: 1 });
    },
    []
  );

  const handleSortChange = useCallback(
    (updater: SortingState | ((old: SortingState) => SortingState)) => {
      const newSorting = typeof updater === 'function' ? updater(sorting) : updater;
      setSorting(newSorting);
      const sortString = newSorting
        .map((s) => (s.desc ? `-${s.id}` : s.id))
        .join(',');
      setState((prev) => ({ ...prev, sort: newSorting.map((s) => ({ column: s.id, direction: s.desc ? 'desc' : 'asc' })) }));
      visitWithParams({ sort: sortString });
    },
    [sorting]
  );

  const handleSearchChange = useCallback(
    (value: string) => {
      setGlobalFilter(value);
      setState((prev) => ({ ...prev, search: value, page: 1 }));
      debouncedVisit('search', value, { search: value, page: 1 });
    },
    []
  );

  const handleColumnSearchChange = useCallback(
    (column: string, value: string) => {
      setColumnFilters((prev) => {
        const newFilters = new Map(prev.map((f) => [f.id, f.value]));
        if (value) {
          newFilters.set(column, value);
        } else {
          newFilters.delete(column);
        }
        return Array.from(newFilters.entries()).map(([id, value]) => ({ id, value })) as ColumnFiltersState;
      });
      setState((prev) => ({
        ...prev,
        searches: { ...prev.searches, [column]: value },
        page: 1,
      }));
      debouncedVisit(`searches.${column}`, value, {
        [`searches[${column}]`]: value,
        page: 1,
      });
    },
    []
  );

  const handleFilterChange = useCallback(
    (column: string, value: unknown) => {
      setState((prev) => ({
        ...prev,
        filters: { ...prev.filters, [column]: value },
        page: 1,
      }));
      visitWithParams({ [`filters[${column}]`]: value, page: 1 });
    },
    []
  );

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
        only: ['data'],
      });
    },
    [router]
  );

  const debouncedVisit = useCallback(
    (key: string, value: unknown, params: Record<string, unknown>) => {
      if (debounceTimersRef.current[key]) {
        clearTimeout(debounceTimersRef.current[key]);
      }
      debounceTimersRef.current[key] = setTimeout(() => {
        visitWithParams(params);
      }, 300);
    },
    [visitWithParams]
  );

  if (!mountedRef.current) {
    mountedRef.current = true;
  }

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
  };
}