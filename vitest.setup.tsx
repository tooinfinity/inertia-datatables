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
        accessor: (key: string, options: Record<string, unknown>) => ({ ...options, id: key, accessorKey: key }),
    }),
    flexRender: (render: (props: unknown) => React.ReactNode, props: unknown) => render?.(props) ?? null,
    createCoreRowModel: () => () => ({ rows: [] }),
    useTable: (options: Record<string, unknown>) => ({
        ...options,
        getHeaderGroups: () => [],
        getRowModel: () => ({ rows: [] }),
        getAllLeafColumns: () => options.columns ?? [],
        getState: () => options.state ?? {},
        setState: vi.fn(),
    }),
    getColumnFromId: (columns: Record<string, unknown>[], id: string) => columns.find((c) => c.id === id),
}));
