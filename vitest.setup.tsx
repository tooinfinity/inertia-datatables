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
        accessor: (key: unknown, options: Record<string, unknown>) => ({
            ...options,
            id: options.id ?? 'column',
            accessorFn: typeof key === 'function' ? key : undefined,
        }),
    }),
    flexRender: (render: (props: unknown) => React.ReactNode, props: unknown) => render?.(props) ?? null,
    tableFeatures: (features: Record<string, unknown>) => features,
    columnFilteringFeature: {},
    columnVisibilityFeature: {},
    globalFilteringFeature: {},
    rowPaginationFeature: {},
    rowSortingFeature: {},
    metaHelper: () => ({}),
    useTable: (options: Record<string, unknown>) => ({
        ...options,
        getHeaderGroups: () => [],
        getRowModel: () => ({ rows: [] }),
        getAllLeafColumns: () => options.columns ?? [],
        state: options.state ?? {},
        setState: vi.fn(),
    }),
}));
