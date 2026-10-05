import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { useDataTable } from './use-data-table';

vi.mock('@inertiajs/react', () => ({
    router: {
        visit: vi.fn(),
    },
    usePage: () => ({ props: {} }),
}));

vi.mock('@tanstack/react-table', () => ({
    createColumnHelper: () => ({
        accessor: (key: string, options: Record<string, unknown>) => ({ ...options, id: key, accessorKey: key }),
    }),
    flexRender: (render: (props: unknown) => React.ReactNode, propsArg: unknown) => render?.(propsArg) ?? null,
    getCoreRowModel: () => () => ({ rows: [] }),
    useReactTable: (options: Record<string, unknown>) => ({
        ...options,
        getHeaderGroups: () => [],
        getRowModel: () => ({ rows: [] }),
        getAllLeafColumns: () => options.columns ?? [],
        getState: () => options.state ?? {},
        setState: vi.fn(),
    }),
    getColumnFromId: (columns: Record<string, unknown>[], id: string) => columns.find((c) => c.id === id),
}));

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

const { router } = await import('@inertiajs/react');

function createMockData(overrides: Record<string, unknown> = {}) {
    return {
        data: [],
        meta: {
            current_page: 1,
            per_page: 25,
            from: 1,
            to: 10,
            total: 10,
            last_page: 1,
        },
        query: {
            page: 1,
            per_page: 25,
            search: '',
            sort: [],
            searches: [],
            filters: [],
        },
        columns: [
            { name: 'name', label: 'Name', sortable: true, searchable: true, filterable: false, hidden: false },
            { name: 'email', label: 'Email', sortable: true, searchable: true, filterable: false, hidden: false },
            { name: 'status', label: 'Status', sortable: true, searchable: false, filterable: true, hidden: false },
        ],
        config: {
            debounce: 300,
            per_page_options: [10, 25, 50, 100],
        },
        ...overrides,
    };
}

describe('useDataTable', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        window.location.search = '';
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('initializes state from initial data', () => {
        const initialData = createMockData({
            query: {
                page: 2,
                per_page: 10,
                search: 'test',
                sort: [{ column: 'name', direction: 'desc' }],
                searches: [{ column: 'email', value: 'example' }],
                filters: [{ column: 'status', value: 'active' }],
            },
        });

        let capturedResult: ReturnType<typeof useDataTable> | null = null;
        const TestWrapper = () => {
            const result = useDataTable({ data: initialData });
            capturedResult = result;
            return null;
        };
        render(<TestWrapper />);

        expect(capturedResult).not.toBeNull();
        expect(capturedResult!.state.page).toBe(2);
        expect(capturedResult!.state.perPage).toBe(10);
        expect(capturedResult!.state.search).toBe('test');
        expect(capturedResult!.state.sort).toEqual([{ column: 'name', direction: 'desc' }]);
        expect(capturedResult!.state.searches).toEqual({ email: 'example' });
        expect(capturedResult!.state.filters).toEqual({ status: 'active' });
    });

    it('handles page change and triggers Inertia visit with correct URL', () => {
        const initialData = createMockData();

        let capturedResult: ReturnType<typeof useDataTable> | null = null;
        const TestWrapper = () => {
            const result = useDataTable({ data: initialData });
            capturedResult = result;
            return null;
        };
        render(<TestWrapper />);

        capturedResult!.handlePageChange(2);

        expect(router.visit).toHaveBeenCalledWith(
            '/?page=3',
            expect.objectContaining({ only: ['data'] })
        );
    });

    it('handles per page change and triggers Inertia visit with correct URL', () => {
        const initialData = createMockData();

        let capturedResult: ReturnType<typeof useDataTable> | null = null;
        const TestWrapper = () => {
            const result = useDataTable({ data: initialData });
            capturedResult = result;
            return null;
        };
        render(<TestWrapper />);

        capturedResult!.handlePerPageChange(50);

        expect(router.visit).toHaveBeenCalledWith(
            '/?per_page=50&page=1',
            expect.any(Object)
        );
    });

    it('handles sort change and triggers Inertia visit with correct URL', () => {
        const initialData = createMockData();

        let capturedResult: ReturnType<typeof useDataTable> | null = null;
        const TestWrapper = () => {
            const result = useDataTable({ data: initialData });
            capturedResult = result;
            return null;
        };
        render(<TestWrapper />);

        capturedResult!.handleSortChange([{ id: 'name', desc: true }]);

        expect(router.visit).toHaveBeenCalledWith(
            '/?sort=-name',
            expect.any(Object)
        );
    });

    it('handles search change with debounce', () => {
        const initialData = createMockData();

        let capturedResult: ReturnType<typeof useDataTable> | null = null;
        const TestWrapper = () => {
            const result = useDataTable({ data: initialData });
            capturedResult = result;
            return null;
        };
        render(<TestWrapper />);

        capturedResult!.handleSearchChange('john');

        // Should not immediately call router.visit due to debounce
        expect(router.visit).not.toHaveBeenCalled();

        vi.advanceTimersByTime(300);

        expect(router.visit).toHaveBeenCalledWith(
            '/?search=john&page=1',
            expect.any(Object)
        );
    });

    it('handles column search change with debounce', () => {
        const initialData = createMockData();

        let capturedResult: ReturnType<typeof useDataTable> | null = null;
        const TestWrapper = () => {
            const result = useDataTable({ data: initialData });
            capturedResult = result;
            return null;
        };
        render(<TestWrapper />);

        capturedResult!.handleColumnSearchChange('name', 'john');

        vi.advanceTimersByTime(300);

        expect(router.visit).toHaveBeenCalledWith(
            '/?searches%5Bname%5D=john&page=1',
            expect.any(Object)
        );
    });

    it('handles filter change without debounce', () => {
        const initialData = createMockData();

        let capturedResult: ReturnType<typeof useDataTable> | null = null;
        const TestWrapper = () => {
            const result = useDataTable({ data: initialData });
            capturedResult = result;
            return null;
        };
        render(<TestWrapper />);

        capturedResult!.handleFilterChange('status', 'active');

        expect(router.visit).toHaveBeenCalledWith(
            '/?filters%5Bstatus%5D=active&page=1',
            expect.any(Object)
        );
    });

    it('clears column search when value is empty', () => {
        const initialData = createMockData({
            query: {
                page: 1,
                per_page: 25,
                search: '',
                sort: [],
                searches: [{ column: 'name', value: 'john' }],
                filters: [],
            },
        });

        let capturedResult: ReturnType<typeof useDataTable> | null = null;
        const TestWrapper = () => {
            const result = useDataTable({ data: initialData });
            capturedResult = result;
            return null;
        };
        render(<TestWrapper />);

        capturedResult!.handleColumnSearchChange('name', '');

        vi.advanceTimersByTime(300);

        // When value is empty, the parameter is deleted from URL
        expect(router.visit).toHaveBeenCalledWith(
            '/?page=1',
            expect.any(Object)
        );
    });

    it('clears filter when value is empty', () => {
        const initialData = createMockData({
            query: {
                page: 1,
                per_page: 25,
                search: '',
                sort: [],
                searches: [],
                filters: [{ column: 'status', value: 'active' }],
            },
        });

        let capturedResult: ReturnType<typeof useDataTable> | null = null;
        const TestWrapper = () => {
            const result = useDataTable({ data: initialData });
            capturedResult = result;
            return null;
        };
        render(<TestWrapper />);

        capturedResult!.handleFilterChange('status', '');

        expect(router.visit).toHaveBeenCalledWith(
            '/?page=1',
            expect.any(Object)
        );
    });

    it('uses custom dataPropName for partial reload', () => {
        const initialData = createMockData();

        let capturedResult: ReturnType<typeof useDataTable> | null = null;
        const TestWrapper = () => {
            const result = useDataTable({ data: initialData, dataPropName: 'users' });
            capturedResult = result;
            return null;
        };
        render(<TestWrapper />);

        capturedResult!.handlePageChange(2);

        expect(router.visit).toHaveBeenCalledWith(
            '/?page=3',
            expect.objectContaining({ only: ['users'] })
        );
    });

    it('handles filter change with boolean value', () => {
        const initialData = createMockData();

        let capturedResult: ReturnType<typeof useDataTable> | null = null;
        const TestWrapper = () => {
            const result = useDataTable({ data: initialData });
            capturedResult = result;
            return null;
        };
        render(<TestWrapper />);

        capturedResult!.handleFilterChange('is_admin', true);

        expect(router.visit).toHaveBeenCalledWith(
            '/?filters%5Bis_admin%5D=true&page=1',
            expect.any(Object)
        );
    });

    it('handles filter change with false boolean value', () => {
        const initialData = createMockData();

        let capturedResult: ReturnType<typeof useDataTable> | null = null;
        const TestWrapper = () => {
            const result = useDataTable({ data: initialData });
            capturedResult = result;
            return null;
        };
        render(<TestWrapper />);

        capturedResult!.handleFilterChange('is_admin', false);

        expect(router.visit).toHaveBeenCalledWith(
            '/?filters%5Bis_admin%5D=false&page=1',
            expect.any(Object)
        );
    });

    it('handles multiple filters', () => {
        const initialData = createMockData({
            query: {
                page: 1,
                per_page: 25,
                search: '',
                sort: [],
                searches: [],
                filters: [{ column: 'status', value: 'active' }],
            },
        });

        // Set initial URL to match initial data
        window.location.search = '?filters%5Bstatus%5D=active';

        let capturedResult: ReturnType<typeof useDataTable> | null = null;
        const TestWrapper = () => {
            const result = useDataTable({ data: initialData });
            capturedResult = result;
            return null;
        };
        render(<TestWrapper />);

        capturedResult!.handleFilterChange('is_admin', true);

        expect(router.visit).toHaveBeenCalledWith(
            '/?filters%5Bstatus%5D=active&filters%5Bis_admin%5D=true&page=1',
            expect.any(Object)
        );
    });

    it('updates existing filter value', () => {
        const initialData = createMockData({
            query: {
                page: 1,
                per_page: 25,
                search: '',
                sort: [],
                searches: [],
                filters: [{ column: 'status', value: 'active' }],
            },
        });

        let capturedResult: ReturnType<typeof useDataTable> | null = null;
        const TestWrapper = () => {
            const result = useDataTable({ data: initialData });
            capturedResult = result;
            return null;
        };
        render(<TestWrapper />);

        capturedResult!.handleFilterChange('status', 'inactive');

        expect(router.visit).toHaveBeenCalledWith(
            '/?filters%5Bstatus%5D=inactive&page=1',
            expect.any(Object)
        );
    });

    it('clears filter when value is null', () => {
        const initialData = createMockData({
            query: {
                page: 1,
                per_page: 25,
                search: '',
                sort: [],
                searches: [],
                filters: [{ column: 'status', value: 'active' }],
            },
        });

        let capturedResult: ReturnType<typeof useDataTable> | null = null;
        const TestWrapper = () => {
            const result = useDataTable({ data: initialData });
            capturedResult = result;
            return null;
        };
        render(<TestWrapper />);

        capturedResult!.handleFilterChange('status', null);

        expect(router.visit).toHaveBeenCalledWith(
            '/?page=1',
            expect.any(Object)
        );
    });

    it('clears filter when value is undefined', () => {
        const initialData = createMockData({
            query: {
                page: 1,
                per_page: 25,
                search: '',
                sort: [],
                searches: [],
                filters: [{ column: 'status', value: 'active' }],
            },
        });

        let capturedResult: ReturnType<typeof useDataTable> | null = null;
        const TestWrapper = () => {
            const result = useDataTable({ data: initialData });
            capturedResult = result;
            return null;
        };
        render(<TestWrapper />);

        capturedResult!.handleFilterChange('status', undefined);

        expect(router.visit).toHaveBeenCalledWith(
            '/?page=1',
            expect.any(Object)
        );
    });

    it('resets page to 1 when filter changes', () => {
        const initialData = createMockData({
            query: {
                page: 3,
                per_page: 25,
                search: '',
                sort: [],
                searches: [],
                filters: [],
            },
        });

        let capturedResult: ReturnType<typeof useDataTable> | null = null;
        const TestWrapper = () => {
            const result = useDataTable({ data: initialData });
            capturedResult = result;
            return null;
        };
        render(<TestWrapper />);

        capturedResult!.handleFilterChange('status', 'active');

        expect(router.visit).toHaveBeenCalledWith(
            '/?filters%5Bstatus%5D=active&page=1',
            expect.any(Object)
        );
    });

    it('initializes state with multiple filters', () => {
        const initialData = createMockData({
            query: {
                page: 1,
                per_page: 25,
                search: '',
                sort: [],
                searches: [],
                filters: [
                    { column: 'status', value: 'active' },
                    { column: 'is_admin', value: true },
                    { column: 'role', value: 'admin' },
                ],
            },
        });

        let capturedResult: ReturnType<typeof useDataTable> | null = null;
        const TestWrapper = () => {
            const result = useDataTable({ data: initialData });
            capturedResult = result;
            return null;
        };
        render(<TestWrapper />);

        expect(capturedResult).not.toBeNull();
        expect(capturedResult!.state.filters).toEqual({
            status: 'active',
            is_admin: true,
            role: 'admin',
        });
    });

    it('handles filter with special characters in value', () => {
        const initialData = createMockData();

        let capturedResult: ReturnType<typeof useDataTable> | null = null;
        const TestWrapper = () => {
            const result = useDataTable({ data: initialData });
            capturedResult = result;
            return null;
        };
        render(<TestWrapper />);

        capturedResult!.handleFilterChange('name', 'john*doe');

        expect(router.visit).toHaveBeenCalledWith(
            '/?filters%5Bname%5D=john*doe&page=1',
            expect.any(Object)
        );
    });
});