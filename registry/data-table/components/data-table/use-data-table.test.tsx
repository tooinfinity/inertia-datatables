import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render } from '@testing-library/react';
import { useDataTable } from './use-data-table';

vi.mock('@inertiajs/react', () => ({
    router: {
        visit: vi.fn(),
    },
    usePage: () => ({ props: {} }),
}));

vi.mock('@tanstack/react-table', () => ({
    createColumnHelper: () => ({
        accessor: (key: unknown, options: Record<string, unknown>) => ({
            ...options,
            id: options.id ?? 'column',
            accessorFn: typeof key === 'function' ? key : undefined,
        }),
    }),
    flexRender: (render: (props: unknown) => React.ReactNode, propsArg: unknown) => render?.(propsArg) ?? null,
    tableFeatures: (features: Record<string, unknown>) => features,
    columnFilteringFeature: {},
    columnVisibilityFeature: {},
    globalFilteringFeature: {},
    rowPaginationFeature: {},
    rowSelectionFeature: {},
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

/** Reads the column definitions that were handed to the table. */
function capturedColumns(result: ReturnType<typeof useDataTable>) {
    return (result.table as unknown as { columns: Array<Record<string, unknown>> }).columns;
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
        expect(capturedResult!.table.state.sorting).toEqual([{ id: 'name', desc: true }]);
        expect(capturedResult!.table.state.pagination.pageSize).toBe(10);
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

        act(() => capturedResult!.handlePageChange(2));

        expect(router.visit).toHaveBeenCalledWith(
            '/?page=2',
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

        act(() => capturedResult!.handlePerPageChange(50));

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

        act(() => capturedResult!.handleSortChange([{ id: 'name', desc: true }]));

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

        act(() => capturedResult!.handleSearchChange('john'));

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

        act(() => capturedResult!.handleColumnSearchChange('name', 'john'));

        vi.advanceTimersByTime(300);

        expect(router.visit).toHaveBeenCalledWith(
            '/?searches%5Bname%5D=john&page=1',
            expect.any(Object)
        );
    });

    it('handles filter change with debounce', () => {
        const initialData = createMockData();

        let capturedResult: ReturnType<typeof useDataTable> | null = null;
        const TestWrapper = () => {
            const result = useDataTable({ data: initialData });
            capturedResult = result;
            return null;
        };
        render(<TestWrapper />);

        act(() => capturedResult!.handleFilterChange('status', 'active'));

        expect(router.visit).not.toHaveBeenCalled();

        act(() => vi.advanceTimersByTime(300));

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

        act(() => capturedResult!.handleColumnSearchChange('name', ''));

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

        act(() => capturedResult!.handleFilterChange('status', ''));

        act(() => vi.advanceTimersByTime(300));

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

        act(() => capturedResult!.handlePageChange(2));

        expect(router.visit).toHaveBeenCalledWith(
            '/?page=2',
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

        act(() => capturedResult!.handleFilterChange('is_admin', true));

        act(() => vi.advanceTimersByTime(300));

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

        act(() => capturedResult!.handleFilterChange('is_admin', false));

        act(() => vi.advanceTimersByTime(300));

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

        act(() => capturedResult!.handleFilterChange('is_admin', true));

        act(() => vi.advanceTimersByTime(300));

        expect(router.visit).toHaveBeenCalledWith(
            '/?filters%5Bstatus%5D=active&filters%5Bis_admin%5D=true&page=1',
            expect.any(Object)
        );
    });

    it('sends array filter values as repeated filters[col][] params', () => {
        const initialData = createMockData();

        let capturedResult: ReturnType<typeof useDataTable> | null = null;
        const TestWrapper = () => {
            const result = useDataTable({ data: initialData });
            capturedResult = result;
            return null;
        };
        render(<TestWrapper />);

        act(() => capturedResult!.handleFilterChange('status', ['active', 'inactive']));

        act(() => vi.advanceTimersByTime(300));

        expect(router.visit).toHaveBeenCalledWith(
            '/?filters%5Bstatus%5D%5B%5D=active&filters%5Bstatus%5D%5B%5D=inactive&page=1',
            expect.any(Object)
        );
    });

    it('clears an array filter that arrived as repeated filters[col][] params', () => {
        const initialData = createMockData({
            query: {
                page: 2,
                per_page: 25,
                search: '',
                sort: [],
                searches: [],
                filters: [{ column: 'status', value: ['active', 'inactive'] }],
            },
        });

        global.location.search = '?filters%5Bstatus%5D%5B%5D=active&filters%5Bstatus%5D%5B%5D=inactive&page=2';

        let capturedResult: ReturnType<typeof useDataTable> | null = null;
        const TestWrapper = () => {
            const result = useDataTable({ data: initialData });
            capturedResult = result;
            return null;
        };
        render(<TestWrapper />);

        act(() => capturedResult!.handleFilterChange('status', ''));

        act(() => vi.advanceTimersByTime(300));

        expect(router.visit).toHaveBeenCalledWith(
            '/?page=1',
            expect.any(Object)
        );
    });

    it('replaces a scalar filter with an array filter, removing the scalar form', () => {
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

        global.location.search = '?filters%5Bstatus%5D=active';

        let capturedResult: ReturnType<typeof useDataTable> | null = null;
        const TestWrapper = () => {
            const result = useDataTable({ data: initialData });
            capturedResult = result;
            return null;
        };
        render(<TestWrapper />);

        act(() => capturedResult!.handleFilterChange('status', ['active', 'inactive']));

        act(() => vi.advanceTimersByTime(300));

        expect(router.visit).toHaveBeenCalledWith(
            '/?filters%5Bstatus%5D%5B%5D=active&filters%5Bstatus%5D%5B%5D=inactive&page=1',
            expect.any(Object)
        );
    });

    it('replaces an array filter with a scalar filter, removing the array form', () => {
        const initialData = createMockData({
            query: {
                page: 1,
                per_page: 25,
                search: '',
                sort: [],
                searches: [],
                filters: [{ column: 'status', value: ['active', 'inactive'] }],
            },
        });

        global.location.search = '?filters%5Bstatus%5D%5B%5D=active&filters%5Bstatus%5D%5B%5D=inactive&page=1';

        let capturedResult: ReturnType<typeof useDataTable> | null = null;
        const TestWrapper = () => {
            const result = useDataTable({ data: initialData });
            capturedResult = result;
            return null;
        };
        render(<TestWrapper />);

        act(() => capturedResult!.handleFilterChange('status', 'active'));

        act(() => vi.advanceTimersByTime(300));

        expect(router.visit).toHaveBeenCalledWith(
            '/?filters%5Bstatus%5D=active&page=1',
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

        act(() => capturedResult!.handleFilterChange('status', 'inactive'));

        act(() => vi.advanceTimersByTime(300));

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

        act(() => capturedResult!.handleFilterChange('status', null));

        act(() => vi.advanceTimersByTime(300));

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

        act(() => capturedResult!.handleFilterChange('status', undefined));

        act(() => vi.advanceTimersByTime(300));

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

        act(() => capturedResult!.handleFilterChange('status', 'active'));

        expect(router.visit).not.toHaveBeenCalled();

        act(() => vi.advanceTimersByTime(300));

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

        act(() => capturedResult!.handleFilterChange('name', 'john*doe'));

        act(() => vi.advanceTimersByTime(300));

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

        act(() => {
            capturedResult!.handleSearchChange('j');
            capturedResult!.handleSearchChange('jo');
            capturedResult!.handleSearchChange('joh');
            capturedResult!.handleSearchChange('john');
        });

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

        act(() => {
            capturedResult!.handleColumnSearchChange('name', 'j');
            capturedResult!.handleColumnSearchChange('name', 'jo');
            capturedResult!.handleColumnSearchChange('name', 'joh');
            capturedResult!.handleColumnSearchChange('name', 'john');
        });

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

        act(() => capturedResult!.handleSearchChange('a'));
        vi.advanceTimersByTime(100);

        act(() => capturedResult!.handleSearchChange('ab'));
        vi.advanceTimersByTime(100);

        act(() => capturedResult!.handleSearchChange('abc'));
        vi.advanceTimersByTime(100);

        act(() => capturedResult!.handleSearchChange('abcd'));
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

        act(() => {
            capturedResult!.handleSearchChange('global');
            capturedResult!.handleColumnSearchChange('name', 'column1');
            capturedResult!.handleColumnSearchChange('email', 'column2');
        });

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

        act(() => capturedResult!.handleSearchChange('test'));

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

        act(() => capturedResult!.handleSearchChange(''));

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

        act(() => capturedResult!.handleSearchChange('test'));

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

        act(() => capturedResult!.handleSearchChange('test'));

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

        act(() => capturedResult!.handleSearchChange('test'));

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

        act(() => capturedResult!.handleFilterChange('name', ''));

        act(() => vi.advanceTimersByTime(300));

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

    it('does not overwrite search input when response for earlier query arrives during typing', () => {
        vi.useFakeTimers();
        const makeData = (search: string) =>
            createMockData({
                query: {
                    page: 1,
                    per_page: 25,
                    search,
                    sort: [],
                    searches: [],
                    filters: [],
                },
            });

        let capturedResult: ReturnType<typeof useDataTable> | null = null;
        const TestWrapper = ({ data }: { data: ReturnType<typeof createMockData> }) => {
            const result = useDataTable({ data });
            capturedResult = result;
            return null;
        };

        const { rerender } = render(<TestWrapper data={makeData('')} />);

        // User types 'ab'
        act(() => capturedResult!.handleSearchChange('ab'));
        // Debounced request for 'ab' is sent
        act(() => vi.advanceTimersByTime(300));

        // User keeps typing 'c' (new debounce pending)
        act(() => capturedResult!.handleSearchChange('abc'));

        // Response for 'ab' arrives (server echoes back 'ab')
        rerender(<TestWrapper data={makeData('ab')} />);

        // The search input should still be 'abc' (user's current input), not reverted to 'ab'
        expect(capturedResult!.state.search).toBe('abc');
    });

    it('does not overwrite column search input when response for earlier query arrives during typing', () => {
        vi.useFakeTimers();
        const makeData = (searches: Record<string, string>) =>
            createMockData({
                query: {
                    page: 1,
                    per_page: 25,
                    search: '',
                    sort: [],
                    searches: Object.entries(searches).map(([column, value]) => ({ column, value })),
                    filters: [],
                },
            });

        let capturedResult: ReturnType<typeof useDataTable> | null = null;
        const TestWrapper = ({ data }: { data: ReturnType<typeof createMockData> }) => {
            const result = useDataTable({ data });
            capturedResult = result;
            return null;
        };

        const { rerender } = render(<TestWrapper data={makeData({})} />);

        // User types 'ab' in column search
        act(() => capturedResult!.handleColumnSearchChange('name', 'ab'));
        // Debounced request for 'ab' is sent
        act(() => vi.advanceTimersByTime(300));

        // User keeps typing 'c'
        act(() => capturedResult!.handleColumnSearchChange('name', 'abc'));

        // Response for 'ab' arrives
        rerender(<TestWrapper data={makeData({ name: 'ab' })} />);

        // The column search should still be 'abc'
        expect(capturedResult!.state.searches.name).toBe('abc');
    });

    it('does not overwrite filter input when response for earlier query arrives during typing', () => {
        vi.useFakeTimers();
        const makeData = (filters: Record<string, unknown>) =>
            createMockData({
                query: {
                    page: 1,
                    per_page: 25,
                    search: '',
                    sort: [],
                    searches: [],
                    filters: Object.entries(filters).map(([column, value]) => ({ column, value })),
                },
            });

        let capturedResult: ReturnType<typeof useDataTable> | null = null;
        const TestWrapper = ({ data }: { data: ReturnType<typeof createMockData> }) => {
            const result = useDataTable({ data });
            capturedResult = result;
            return null;
        };

        const { rerender } = render(<TestWrapper data={makeData({})} />);

        // User sets filter to 'active'
        act(() => capturedResult!.handleFilterChange('status', 'active'));
        // Debounced request is sent
        act(() => vi.advanceTimersByTime(300));

        // User changes filter to 'inactive'
        act(() => capturedResult!.handleFilterChange('status', 'inactive'));

        // Response for 'active' arrives
        rerender(<TestWrapper data={makeData({ status: 'active' })} />);

        // The filter should still be 'inactive'
        expect(capturedResult!.state.filters.status).toBe('inactive');
    });

    it('still syncs search input when server clears search (no pending debounce)', () => {
        vi.useFakeTimers();
        const makeData = (search: string) =>
            createMockData({
                query: {
                    page: 1,
                    per_page: 25,
                    search,
                    sort: [],
                    searches: [],
                    filters: [],
                },
            });

        let capturedResult: ReturnType<typeof useDataTable> | null = null;
        const TestWrapper = ({ data }: { data: ReturnType<typeof createMockData> }) => {
            const result = useDataTable({ data });
            capturedResult = result;
            return null;
        };

        const { rerender } = render(<TestWrapper data={makeData('test')} />);

        expect(capturedResult!.state.search).toBe('test');

        // Server clears search (no user typing, no pending debounce)
        rerender(<TestWrapper data={makeData('')} />);

        expect(capturedResult!.state.search).toBe('');
    });

    it('still syncs column search when server clears it (no pending debounce)', () => {
        vi.useFakeTimers();
        const makeData = (searches: Record<string, string>) =>
            createMockData({
                query: {
                    page: 1,
                    per_page: 25,
                    search: '',
                    sort: [],
                    searches: Object.entries(searches).map(([column, value]) => ({ column, value })),
                    filters: [],
                },
            });

        let capturedResult: ReturnType<typeof useDataTable> | null = null;
        const TestWrapper = ({ data }: { data: ReturnType<typeof createMockData> }) => {
            const result = useDataTable({ data });
            capturedResult = result;
            return null;
        };

        const { rerender } = render(<TestWrapper data={makeData({ name: 'test' })} />);

        expect(capturedResult!.state.searches.name).toBe('test');

        // Server clears column search
        rerender(<TestWrapper data={makeData({})} />);

        expect(capturedResult!.state.searches.name).toBeUndefined();
    });

    it('still syncs filter when server clears it (no pending debounce)', () => {
        vi.useFakeTimers();
        const makeData = (filters: Record<string, unknown>) =>
            createMockData({
                query: {
                    page: 1,
                    per_page: 25,
                    search: '',
                    sort: [],
                    searches: [],
                    filters: Object.entries(filters).map(([column, value]) => ({ column, value })),
                },
            });

        let capturedResult: ReturnType<typeof useDataTable> | null = null;
        const TestWrapper = ({ data }: { data: ReturnType<typeof createMockData> }) => {
            const result = useDataTable({ data });
            capturedResult = result;
            return null;
        };

        const { rerender } = render(<TestWrapper data={makeData({ status: 'active' })} />);

        expect(capturedResult!.state.filters.status).toBe('active');

        // Server clears filter
        rerender(<TestWrapper data={makeData({})} />);

        expect(capturedResult!.state.filters.status).toBeUndefined();
    });

    it('back/forward navigation still updates inputs', () => {
        vi.useFakeTimers();
        const makeData = (search: string) =>
            createMockData({
                query: {
                    page: 1,
                    per_page: 25,
                    search,
                    sort: [],
                    searches: [],
                    filters: [],
                },
            });

        let capturedResult: ReturnType<typeof useDataTable> | null = null;
        const TestWrapper = ({ data }: { data: ReturnType<typeof createMockData> }) => {
            const result = useDataTable({ data });
            capturedResult = result;
            return null;
        };

        const { rerender } = render(<TestWrapper data={makeData('initial')} />);

        expect(capturedResult!.state.search).toBe('initial');

        // Simulate back/forward navigation - no pending debounce
        rerender(<TestWrapper data={makeData('from-history')} />);

        expect(capturedResult!.state.search).toBe('from-history');
    });

    it('exposes the loading state while a visit is in flight', () => {
        const initialData = createMockData();

        let capturedResult: ReturnType<typeof useDataTable> | null = null;
        const TestWrapper = () => {
            const result = useDataTable({ data: initialData });
            capturedResult = result;
            return null;
        };
        render(<TestWrapper />);

        expect(capturedResult!.isLoading).toBe(false);

        act(() => capturedResult!.handlePageChange(2));

        const options = (router.visit as ReturnType<typeof vi.fn>).mock.calls[0][1];

        act(() => options.onStart());

        expect(capturedResult!.isLoading).toBe(true);

        act(() => options.onFinish());

        expect(capturedResult!.isLoading).toBe(false);
    });

    it('reports visit errors and clears the loading state', () => {
        const initialData = createMockData();
        const onError = vi.fn();

        let capturedResult: ReturnType<typeof useDataTable> | null = null;
        const TestWrapper = () => {
            const result = useDataTable({
                data: initialData,
                visitOptions: { onError },
            });
            capturedResult = result;
            return null;
        };
        render(<TestWrapper />);

        act(() => capturedResult!.handlePageChange(2));

        const options = (router.visit as ReturnType<typeof vi.fn>).mock.calls[0][1];

        act(() => options.onStart());
        act(() => options.onError({ email: 'is invalid' }));

        expect(capturedResult!.error).toEqual({ email: 'is invalid' });
        expect(capturedResult!.isLoading).toBe(false);
        expect(onError).toHaveBeenCalledWith({ email: 'is invalid' });
    });

    it('replaces the history entry for search, filter and sort visits', () => {
        const initialData = createMockData();

        let capturedResult: ReturnType<typeof useDataTable> | null = null;
        const TestWrapper = () => {
            const result = useDataTable({ data: initialData });
            capturedResult = result;
            return null;
        };
        render(<TestWrapper />);

        act(() => capturedResult!.handleSearchChange('john'));
        act(() => vi.advanceTimersByTime(300));

        expect(router.visit).toHaveBeenLastCalledWith(
            '/?search=john&page=1',
            expect.objectContaining({ replace: true })
        );

        act(() => capturedResult!.handleSortChange([{ id: 'name', desc: true }]));

        expect(router.visit).toHaveBeenLastCalledWith(
            '/?sort=-name',
            expect.objectContaining({ replace: true })
        );

        act(() => capturedResult!.handleFilterChange('status', 'active'));
        act(() => vi.advanceTimersByTime(300));

        expect(router.visit).toHaveBeenLastCalledWith(
            '/?filters%5Bstatus%5D=active&page=1',
            expect.objectContaining({ replace: true })
        );
    });

    it('pushes a new history entry for pagination visits', () => {
        const initialData = createMockData();

        let capturedResult: ReturnType<typeof useDataTable> | null = null;
        const TestWrapper = () => {
            const result = useDataTable({ data: initialData });
            capturedResult = result;
            return null;
        };
        render(<TestWrapper />);

        act(() => capturedResult!.handlePageChange(2));

        expect(router.visit).toHaveBeenLastCalledWith(
            '/?page=2',
            expect.objectContaining({ replace: false })
        );
    });

    it('lets the visit options override the default replace behaviour', () => {
        const initialData = createMockData();

        let capturedResult: ReturnType<typeof useDataTable> | null = null;
        const TestWrapper = () => {
            const result = useDataTable({
                data: initialData,
                visitOptions: { replace: false },
            });
            capturedResult = result;
            return null;
        };
        render(<TestWrapper />);

        act(() => capturedResult!.handleSearchChange('john'));
        act(() => vi.advanceTimersByTime(300));

        expect(router.visit).toHaveBeenLastCalledWith(
            '/?search=john&page=1',
            expect.objectContaining({ replace: false })
        );
    });

    it('forwards additional visit options to Inertia', () => {
        const initialData = createMockData();

        let capturedResult: ReturnType<typeof useDataTable> | null = null;
        const TestWrapper = () => {
            const result = useDataTable({
                data: initialData,
                visitOptions: {
                    headers: { 'X-Requested-With': 'XMLHttpRequest' },
                    preserveScroll: false,
                    showProgress: false,
                },
            });
            capturedResult = result;
            return null;
        };
        render(<TestWrapper />);

        act(() => capturedResult!.handlePageChange(2));

        expect(router.visit).toHaveBeenLastCalledWith(
            '/?page=2',
            expect.objectContaining({
                headers: { 'X-Requested-With': 'XMLHttpRequest' },
                preserveScroll: false,
                showProgress: false,
                only: ['data'],
            })
        );
    });

    it('reports http exceptions and clears the loading state', () => {
        const initialData = createMockData();
        const onHttpException = vi.fn();

        let capturedResult: ReturnType<typeof useDataTable> | null = null;
        const TestWrapper = () => {
            const result = useDataTable({
                data: initialData,
                visitOptions: { onHttpException },
            });
            capturedResult = result;
            return null;
        };
        render(<TestWrapper />);

        act(() => capturedResult!.handlePageChange(2));

        const options = (router.visit as ReturnType<typeof vi.fn>).mock.calls[0][1];

        act(() => options.onStart());
        act(() =>
            options.onHttpException({
                status: 500,
                data: 'Server error',
                headers: {},
            })
        );

        expect(capturedResult!.isLoading).toBe(false);
        expect(onHttpException).toHaveBeenCalledWith({
            status: 500,
            data: 'Server error',
            headers: {},
        });
    });

    it('merges column overrides with the server column meta', () => {
        const initialData = createMockData({
            columns: [
                { name: 'name', label: 'Name', sortable: true, searchable: true, filterable: false, hidden: false },
            ],
        });

        let capturedResult: ReturnType<typeof useDataTable> | null = null;
        const TestWrapper = () => {
            const result = useDataTable({
                data: initialData,
                columns: [{ id: 'name', meta: { filterable: true } }],
            });
            capturedResult = result;
            return null;
        };
        render(<TestWrapper />);

        const columns = capturedColumns(capturedResult!);

        expect(columns).toHaveLength(1);
        expect(columns[0].meta).toEqual({ searchable: true, filterable: true });
    });

    it('keeps the server capabilities authoritative for column overrides', () => {
        const initialData = createMockData({
            columns: [
                { name: 'name', label: 'Name', sortable: false, searchable: false, filterable: false, hidden: false },
            ],
        });

        let capturedResult: ReturnType<typeof useDataTable> | null = null;
        const TestWrapper = () => {
            const result = useDataTable({
                data: initialData,
                columns: [
                    {
                        id: 'name',
                        enableSorting: true,
                        enableGlobalFilter: true,
                        enableColumnFilter: true,
                    },
                ],
            });
            capturedResult = result;
            return null;
        };
        render(<TestWrapper />);

        const columns = capturedColumns(capturedResult!);

        expect(columns[0].enableSorting).toBe(false);
        expect(columns[0].enableGlobalFilter).toBe(false);
        expect(columns[0].enableColumnFilter).toBe(false);
    });

    it('allows an override to disable a server capability', () => {
        const initialData = createMockData({
            columns: [
                { name: 'name', label: 'Name', sortable: true, searchable: true, filterable: true, hidden: false },
            ],
        });

        let capturedResult: ReturnType<typeof useDataTable> | null = null;
        const TestWrapper = () => {
            const result = useDataTable({
                data: initialData,
                columns: [{ id: 'name', enableSorting: false }],
            });
            capturedResult = result;
            return null;
        };
        render(<TestWrapper />);

        const columns = capturedColumns(capturedResult!);

        expect(columns[0].enableSorting).toBe(false);
        expect(columns[0].enableGlobalFilter).toBe(true);
    });

    it('appends the row actions column', () => {
        const initialData = createMockData();

        let capturedResult: ReturnType<typeof useDataTable> | null = null;
        const TestWrapper = () => {
            const result = useDataTable({
                data: initialData,
                actions: ({ row }) => row.name,
            });
            capturedResult = result;
            return null;
        };
        render(<TestWrapper />);

        const columns = capturedColumns(capturedResult!);

        expect(columns).toHaveLength(4);
        expect(columns[3].id).toBe('__actions');
        expect(columns[3].enableSorting).toBe(false);
    });

    it('appends column overrides that do not match a server column as client side columns', () => {
        const initialData = createMockData();

        let capturedResult: ReturnType<typeof useDataTable> | null = null;
        const TestWrapper = () => {
            const result = useDataTable({
                data: initialData,
                columns: [{ id: 'extra', header: 'Extra', cell: () => 'extra' }],
            });
            capturedResult = result;
            return null;
        };
        render(<TestWrapper />);

        const columns = capturedColumns(capturedResult!);

        expect(columns).toHaveLength(4);
        expect(columns[3].id).toBe('extra');
        expect(columns[3].enableSorting).toBe(false);
    });
});
