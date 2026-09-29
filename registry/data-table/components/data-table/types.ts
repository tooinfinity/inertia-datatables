export interface DataTableColumn {
  name: string;
  label: string;
  sortable: boolean;
  searchable: boolean;
  filterable: boolean;
  hidden: boolean;
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

export interface DataTableResponse<TData = unknown> {
  data: TData[];
  meta: DataTableMeta;
  query: DataTableQuery;
  columns: DataTableColumn[];
}

export interface DataTableState {
  page: number;
  perPage: number;
  search: string;
  sort: Array<{ column: string; direction: 'asc' | 'desc' }>;
  searches: Record<string, string>;
  filters: Record<string, unknown>;
}

export interface DataTableOptions<TData = unknown> {
  data: DataTableResponse<TData>;
  onDataChange: (data: DataTableResponse<TData>) => void;
}