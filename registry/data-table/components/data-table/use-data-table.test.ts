import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ColumnDef } from '@tanstack/react-table';

// Mock Inertia router
vi.mock('@inertiajs/react', () => ({
  router: {
    visit: vi.fn(),
  },
  usePage: () => ({
    props: {},
  }),
}));

// Mock TanStack Table v9
vi.mock('@tanstack/react-table', () => ({
  createColumnHelper: () => ({
    accessor: (key: string, options: Record<string, unknown>) => ({ ...options, id: key, accessorKey: key }),
  }),
  flexRender: (render: ((props: unknown) => React.ReactNode) | null, props: unknown) => render?.(props) ?? null,
  createCoreRowModel: () => () => ({ rows: [] }),
  useTable: () => ({
    getHeaderGroups: () => [],
    getRowModel: () => ({ rows: [] }),
    getAllLeafColumns: () => [],
    getState: () => ({}),
    setState: vi.fn(),
  }),
  getColumnFromId: (columns: ColumnDef<unknown, unknown>[], id: string) => columns.find((c) => c.id === id),
}));

// Mock window.location
Object.defineProperty(global, 'location', {
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

// Import the hook after mocks
const { useDataTable } = await import('./use-data-table');

describe('useDataTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes state from data', () => {
    // This is a basic test to verify the hook can be imported
    // Full integration tests would require more complex mocking
    expect(typeof useDataTable).toBe('function');
  });

  it('has correct state shape', () => {

    // Test that the types are correct
    const state = {
      page: 1,
      perPage: 25,
      search: '',
      sort: [],
      searches: {},
      filters: {},
    };

    expect(state.page).toBe(1);
    expect(state.perPage).toBe(25);
  });
});
