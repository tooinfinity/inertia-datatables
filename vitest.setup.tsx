import '@testing-library/jest-dom';
import { vi } from 'vitest';

Object.defineProperty(window, 'location', {
  value: {
    pathname: '/',
    search: '',
    href: 'http://localhost/',
    origin: 'http://localhost',
    protocol: 'http:',
    host: 'localhost',
    hostname: 'localhost',
    port: '',
  },
  writable: true,
});

vi.mock('@inertiajs/react', () => ({
  router: {
    visit: vi.fn(),
  },
  usePage: () => ({
    props: {},
  }),
}));

vi.mock('@tanstack/react-table', () => ({
  createColumnHelper: () => ({
    accessor: (key: string, options: any) => ({ ...options, id: key, accessorKey: key }),
  }),
  flexRender: (render, props) => render?.(props) ?? null,
  getCoreRowModel: () => () => ({ rows: [] }),
  getSortedRowModel: () => () => ({ rows: [] }),
  getPaginationRowModel: () => () => ({ rows: [] }),
  getFilteredRowModel: () => () => ({ rows: [] }),
  useReactTable: (options: any) => ({
    ...options,
    getHeaderGroups: () => [],
    getRowModel: () => ({ rows: [] }),
    getAllLeafColumns: () => options.columns ?? [],
    getState: () => options.state ?? {},
    setState: vi.fn(),
  }),
  getColumnFromId: (columns: any[], id: string) => columns.find(c => c.id === id),
}));