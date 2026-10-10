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
        global.location.search = '';
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
        global.location.search = '?filters%5Bstatus%5D=active';

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

    it('debounced search: rapid typing schedules only the latest value', () => {
        const initialData = createMockData();

        let capturedResult: ReturnType<typeof useDataTable> | null = null;
        const TestWrapper = () => {
            const result = useDataTable({ data: initialData });
            capturedResult = result;
            return null;
        };
        render(<TestWrapper />);

        capturedResult!.handleSearchChange('j');
        capturedResult!.handleSearchChange('jo');
        capturedResult!.handleSearchChange('joh');
        capturedResult!.handleSearchChange('john');

        vi.advanceTimersByTime(300);

        expect(router.visit).toHaveBeenCalledTimes(1);
        expect(router.visit).toHaveBeenCalledWith(
            '/?search=john&page=1',
            expect.any(Object)
        );
    });

    it('debounced column search: rapid typing schedules only the latest value', () => {
        const initialData = createMockData();

        let capturedResult: ReturnType<typeof useDataTable> | null = null;
        const TestWrapper = () => {
            const result = useDataTable({ data: initialData });
            capturedResult = result;
            return null;
        };
        render(<TestWrapper />);

        capturedResult!.handleColumnSearchChange('name', 'j');
        capturedResult!.handleColumnSearchChange('name', 'jo');
        capturedResult!.handleColumnSearchChange('name', 'joh');
        capturedResult!.handleColumnSearchChange('name', 'john');

        vi.advanceTimersByTime(300);

        expect(router.visit).toHaveBeenCalledTimes(1);
        expect(router.visit).toHaveBeenCalledWith(
            '/?searches%5Bname%5D=john&page=1',
            expect.any(Object)
        );
    });

    it('typing again before previous timeout does not cancel final request', () => {
        const initialData = createMockData();

        let capturedResult: ReturnType<typeof useDataTable> | null = null;
        const TestWrapper = () => {
            const result = useDataTable({ data: initialData });
            capturedResult = result;
            return null;
        };
        render(<TestWrapper />);

        capturedResult!.handleSearchChange('a');
        vi.advanceTimersByTime(100);

        capturedResult!.handleSearchChange('ab');
        vi.advanceTimersByTime(100);

        capturedResult!.handleSearchChange('abc');
        vi.advanceTimersByTime(100);

        capturedResult!.handleSearchChange('abcd');
        vi.advanceTimersByTime(300);

        expect(router.visit).toHaveBeenCalledTimes(1);
        expect(router.visit).toHaveBeenCalledWith(
            '/?search=abcd&page=1',
            expect.any(Object)
        );
    });

    it('global search and column searches maintain independent pending timers', () => {
        const initialData = createMockData();

        let capturedResult: ReturnType<typeof useDataTable> | null = null;
        const TestWrapper = () => {
            const result = useDataTable({ data: initialData });
            capturedResult = result;
            return null;
        };
        render(<TestWrapper />);

        capturedResult!.handleSearchChange('global');
        capturedResult!.handleColumnSearchChange('name', 'column1');
        capturedResult!.handleColumnSearchChange('email', 'column2');

        vi.advanceTimersByTime(300);

        expect(router.visit).toHaveBeenCalledTimes(3);
        const calls = (router.visit as ReturnType<typeof vi.fn>).mock.calls;
        expect(calls.map(c => c[0])).toEqual(
            expect.arrayContaining([
                '/?search=global&page=1',
                '/?searches%5Bname%5D=column1&page=1',
                '/?searches%5Bemail%5D=column2&page=1',
            ])
        );
    });

    it('unmounting the hook clears pending timers', () => {
        const initialData = createMockData();

        let capturedResult: ReturnType<typeof useDataTable> | null = null;
        const TestWrapper = () => {
            const result = useDataTable({ data: initialData });
            capturedResult = result;
            return null;
        };
        const { unmount } = render(<TestWrapper />);

        capturedResult!.handleSearchChange('test');

        unmount();

        vi.advanceTimersByTime(300);

        expect(router.visit).not.toHaveBeenCalled();
    });

    it('clearing a search removes its parameter from URL', () => {
        const initialData = createMockData({
            query: {
                page: 1,
                per_page: 25,
                search: 'existing',
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

        capturedResult!.handleSearchChange('');

        vi.advanceTimersByTime(300);

        expect(router.visit).toHaveBeenCalledWith(
            '/?page=1',
            expect.any(Object)
        );
    });

    it('search updates reset pagination to page 1', () => {
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

        capturedResult!.handleSearchChange('test');

        vi.advanceTimersByTime(300);

        expect(router.visit).toHaveBeenCalledWith(
            '/?search=test&page=1',
            expect.any(Object)
        );
    });

    it('existing filters, sorting, pagination-size parameters, and unrelated query parameters are preserved', () => {
        const initialData = createMockData({
            query: {
                page: 2,
                per_page: 50,
                search: '',
                sort: [{ column: 'name', direction: 'asc' }],
                searches: [],
                filters: [{ column: 'status', value: 'active' }],
            },
        });

        global.location.search = '?page=2&per_page=50&sort=name&filters%5Bstatus%5D=active&custom=preserve';

        let capturedResult: ReturnType<typeof useDataTable> | null = null;
        const TestWrapper = () => {
            const result = useDataTable({ data: initialData });
            capturedResult = result;
            return null;
        };
        render(<TestWrapper />);

        capturedResult!.handleSearchChange('test');

        vi.advanceTimersByTime(300);

        expect(router.visit).toHaveBeenCalledWith(
            expect.stringContaining('page=1'),
            expect.any(Object)
        );
        expect(router.visit).toHaveBeenCalledWith(
            expect.stringContaining('per_page=50'),
            expect.any(Object)
        );
        expect(router.visit).toHaveBeenCalledWith(
            expect.stringContaining('sort=name'),
            expect.any(Object)
        );
        expect(router.visit).toHaveBeenCalledWith(
            expect.stringContaining('filters%5Bstatus%5D=active'),
            expect.any(Object)
        );
        expect(router.visit).toHaveBeenCalledWith(
            expect.stringContaining('custom=preserve'),
            expect.any(Object)
        );
        expect(router.visit).toHaveBeenCalledWith(
            expect.stringContaining('search=test'),
            expect.any(Object)
        );
    });

    it('changing dataPropName continues to target the correct Inertia prop', () => {
        const initialData = createMockData();

        let capturedResult: ReturnType<typeof useDataTable> | null = null;
        const TestWrapper = () => {
            const result = useDataTable({ data: initialData, dataPropName: 'users' });
            capturedResult = result;
            return null;
        };
        render(<TestWrapper />);

        capturedResult!.handleSearchChange('test');

        vi.advanceTimersByTime(300);

        expect(router.visit).toHaveBeenCalledWith(
            '/?search=test&page=1',
            expect.objectContaining({ only: ['users'] })
        );
    });

    it('initializes text filter input with currentFilterValue from server', () => {
        const initialData = createMockData({
            columns: [
                { name: 'name', label: 'Name', sortable: true, searchable: true, filterable: true, filter_type: 'text', filter_options: [], hidden: false },
                { name: 'email', label: 'Email', sortable: true, searchable: true, filterable: false, hidden: false },
            ],
            query: {
                page: 1,
                per_page: 25,
                search: '',
                sort: [],
                searches: [],
                filters: [{ column: 'name', value: 'john' }],
            },
        });

        let capturedResult: ReturnType<typeof useDataTable> | null = null;
        const TestWrapper = () => {
            const result = useDataTable({ data: initialData });
            capturedResult = result;
            return null;
        };
        render(<TestWrapper />);

        expect(capturedResult!.state.filters).toEqual({ name: 'john' });
    });

    it('clears text filter input when filter is cleared via server response', () => {
        const initialData = createMockData({
            columns: [
                { name: 'name', label: 'Name', sortable: true, searchable: true, filterable: true, filter_type: 'text', filter_options: [], hidden: false },
            ],
            query: {
                page: 1,
                per_page: 25,
                search: '',
                sort: [],
                searches: [],
                filters: [{ column: 'name', value: 'john' }],
            },
        });

        let capturedResult: ReturnType<typeof useDataTable> | null = null;
        const TestWrapper = () => {
            const result = useDataTable({ data: initialData });
            capturedResult = result;
            return null;
        };
        render(<TestWrapper />);

        expect(capturedResult!.state.filters).toEqual({ name: 'john' });

        capturedResult!.handleFilterChange('name', '');

        expect(router.visit).toHaveBeenCalledWith(
            '/?page=1',
            expect.any(Object)
        );
    });

    it('updates text filter input when server provides new filter value', () => {
        const initialData = createMockData({
            columns: [
                { name: 'name', label: 'Name', sortable: true, searchable: true, filterable: true, filter_type: 'text', filter_options: [], hidden: false },
            ],
            query: {
                page: 1,
                per_page: 25,
                search: '',
                sort: [],
                searches: [],
                filters: [{ column: 'name', value: 'initial' }],
            },
        });

        let capturedResult: ReturnType<typeof useDataTable> | null = null;
        const TestWrapper = ({ data }: { data: typeof initialData }) => {
            const result = useDataTable({ data });
            capturedResult = result;
            return null;
        };
        const { rerender } = render(<TestWrapper data={initialData} />);

        expect(capturedResult!.state.filters).toEqual({ name: 'initial' });

        const updatedData = {
            ...initialData,
            query: {
                ...initialData.query,
                filters: [{ column: 'name', value: 'updated' }],
            },
        };
        rerender(<TestWrapper data={updatedData} />);

        expect(capturedResult!.state.filters).toEqual({ name: 'updated' });
    });

    it('clears text filter input when server removes filter', () => {
        const initialData = createMockData({
            columns: [
                { name: 'name', label: 'Name', sortable: true, searchable: true, filterable: true, filter_type: 'text', filter_options: [], hidden: false },
            ],
            query: {
                page: 1,
                per_page: 25,
                search: '',
                sort: [],
                searches: [],
                filters: [{ column: 'name', value: 'initial' }],
            },
        });

        let capturedResult: ReturnType<typeof useDataTable> | null = null;
        const TestWrapper = ({ data }: { data: typeof initialData }) => {
            const result = useDataTable({ data });
            capturedResult = result;
            return null;
        };
        const { rerender } = render(<TestWrapper data={initialData} />);

        expect(capturedResult!.state.filters).toEqual({ name: 'initial' });

        const updatedData = {
            ...initialData,
            query: {
                ...initialData.query,
                filters: [],
            },
        };
        rerender(<TestWrapper data={updatedData} />);

        expect(capturedResult!.state.filters).toEqual({});
    });

    it('select filter retains expected value', () => {
        const initialData = createMockData({
            columns: [
                { name: 'status', label: 'Status', sortable: true, searchable: false, filterable: true, filter_type: 'select', filter_options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }], hidden: false },
            ],
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

        expect(capturedResult!.state.filters).toEqual({ status: 'active' });
    });

    it('boolean filter retains expected value', () => {
        const initialData = createMockData({
            columns: [
                { name: 'is_admin', label: 'Is Admin', sortable: true, searchable: false, filterable: true, filter_type: 'boolean', filter_options: [], hidden: false },
            ],
            query: {
                page: 1,
                per_page: 25,
                search: '',
                sort: [],
                searches: [],
                filters: [{ column: 'is_admin', value: true }],
            },
        });

        let capturedResult: ReturnType<typeof useDataTable> | null = null;
        const TestWrapper = () => {
            const result = useDataTable({ data: initialData });
            capturedResult = result;
            return null;
        };
        render(<TestWrapper />);

        expect(capturedResult!.state.filters).toEqual({ is_admin: true });
    });

    it('unrelated render does not erase active filter', () => {
        const initialData = createMockData({
            columns: [
                { name: 'name', label: 'Name', sortable: true, searchable: true, filterable: true, filter_type: 'text', filter_options: [], hidden: false },
            ],
            query: {
                page: 1,
                per_page: 25,
                search: '',
                sort: [],
                searches: [],
                filters: [{ column: 'name', value: 'john' }],
            },
        });

        let capturedResult: ReturnType<typeof useDataTable> | null = null;
        const TestWrapper = ({ data }: { data: typeof initialData }) => {
            const result = useDataTable({ data });
            capturedResult = result;
            return null;
        };
        const { rerender } = render(<TestWrapper data={initialData} />);

        expect(capturedResult!.state.filters).toEqual({ name: 'john' });

        const updatedData = {
            ...initialData,
            data: [{ name: 'jane' }],
        };
        rerender(<TestWrapper data={updatedData} />);

        expect(capturedResult!.state.filters).toEqual({ name: 'john' });
    });
});
