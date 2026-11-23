import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render } from '@testing-library/react';
import { router } from '@inertiajs/react';
import { useDataTable } from './use-data-table';

// Only mock Inertia, not TanStack Table - we want the real table implementation
vi.mock('@inertiajs/react', () => ({
    router: { visit: vi.fn() },
    usePage: () => ({ props: {} }),
}));

function createIntegrationData(overrides: Record<string, unknown> = {}) {
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
        config: { debounce: 300, per_page_options: [10, 25, 50, 100] },
        ...overrides,
    };
}

describe('useDataTable row selection integration (real TanStack Table)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('does not leak stable-id selection across dataset changes on the same page', () => {
        const initialData = createIntegrationData({
            data: [{ id: 1, name: 'Alice', email: 'alice@example.com', status: 'active' }],
        });

        let capturedResult: any = null;
        const TestWrapper = ({ data }: { data: typeof initialData }) => {
            const result = useDataTable({ data, enableRowSelection: true });
            capturedResult = result;
            return null;
        };

        const { rerender } = render(<TestWrapper data={initialData} />);

        // Select Alice (id:1) using actual TanStack row
        act(() => capturedResult.setRowSelection({ 'id:1': true }));
        const aliceRow = capturedResult.table
            .getRowModel()
            .rows.find((r: { id: string }) => r.id === 'id:1');
        expect(aliceRow).toBeDefined();
        expect(aliceRow!.getIsSelected()).toBe(true);

        // Replace data with ID 99 on same page (simulates search/filter change)
        const updatedData = createIntegrationData({
            data: [{ id: 99, name: 'Zed', email: 'zed@example.com', status: 'active' }],
        });
        rerender(<TestWrapper data={updatedData} />);

        // ID 99 row must NOT be selected - no inheritance from id:1
        const zedRow = capturedResult.table
            .getRowModel()
            .rows.find((r: { id: string }) => r.id === 'id:99');
        expect(zedRow).toBeDefined();
        expect(zedRow!.getIsSelected()).toBe(false);

        // Restore ID 1 - should still be selected
        rerender(<TestWrapper data={initialData} />);
        const aliceRowAgain = capturedResult.table
            .getRowModel()
            .rows.find((r: { id: string }) => r.id === 'id:1');
        expect(aliceRowAgain).toBeDefined();
        expect(aliceRowAgain!.getIsSelected()).toBe(true);
    });

    it('does not leak fallback selection across dataset changes on the same page', () => {
        const initialData = createIntegrationData({
            data: [{ name: 'Alice', email: 'alice@example.com', status: 'active' }],
        });

        let capturedResult: any = null;
        const TestWrapper = ({ data }: { data: typeof initialData }) => {
            const result = useDataTable({ data, enableRowSelection: true });
            capturedResult = result;
            return null;
        };

        const { rerender } = render(<TestWrapper data={initialData} />);

        // Select row at page 1 index 0
        const aliceRow = capturedResult.table.getRowModel().rows[0];
        act(() => capturedResult.setRowSelection({ [aliceRow.id]: true }));
        expect(aliceRow.getIsSelected()).toBe(true);

        // Replace data with different row at page 1 index 0 (simulates search/filter change)
        const updatedData = createIntegrationData({
            data: [{ name: 'Charlie', email: 'charlie@example.com', status: 'active' }],
        });
        rerender(<TestWrapper data={updatedData} />);

        // New row at index 0 must NOT be selected (generation changed, fallback ids differ)
        const charlieRow = capturedResult.table.getRowModel().rows[0];
        expect(charlieRow.id).not.toBe(aliceRow.id);
        expect(charlieRow.getIsSelected()).toBe(false);
    });

    it('does not leak selection across server-side page changes (stable id)', () => {
        const page1Data = createIntegrationData({
            data: [{ id: 1, name: 'Alice', email: 'alice@example.com', status: 'active' }],
            meta: { current_page: 1, per_page: 25, from: 1, to: 1, total: 2, last_page: 2 },
            query: { page: 1, per_page: 25, search: '', sort: [], searches: [], filters: [] },
        });
        const page2Data = createIntegrationData({
            data: [{ id: 99, name: 'Zed', email: 'zed@example.com', status: 'active' }],
            meta: { current_page: 2, per_page: 25, from: 2, to: 2, total: 2, last_page: 2 },
            query: { page: 2, per_page: 25, search: '', sort: [], searches: [], filters: [] },
        });

        let capturedResult: any = null;
        const TestWrapper = ({ data }: { data: typeof page1Data }) => {
            const result = useDataTable({ data, enableRowSelection: true });
            capturedResult = result;
            return null;
        };

        const { rerender } = render(<TestWrapper data={page1Data} />);

        // Select Alice (id:1) on page 1
        act(() => capturedResult.setRowSelection({ 'id:1': true }));
        const aliceRow = capturedResult.table
            .getRowModel()
            .rows.find((r: { id: string }) => r.id === 'id:1');
        expect(aliceRow).toBeDefined();
        expect(aliceRow!.getIsSelected()).toBe(true);

        // Navigate to page 2: Zed (id:99) must NOT be selected
        rerender(<TestWrapper data={page2Data} />);
        const zedRow = capturedResult.table
            .getRowModel()
            .rows.find((r: { id: string }) => r.id === 'id:99');
        expect(zedRow).toBeDefined();
        expect(zedRow!.getIsSelected()).toBe(false);
        expect(capturedResult.rowSelection).not.toHaveProperty('id:99');

        // Return to page 1: ID 1 remains selected
        rerender(<TestWrapper data={page1Data} />);
        const aliceRowAgain = capturedResult.table
            .getRowModel()
            .rows.find((r: { id: string }) => r.id === 'id:1');
        expect(aliceRowAgain).toBeDefined();
        expect(aliceRowAgain!.getIsSelected()).toBe(true);
    });

    it('does not leak fallback selection across server-side page changes', () => {
        const page1Data = createIntegrationData({
            data: [{ name: 'Alice', email: 'alice@example.com', status: 'active' }],
            meta: { current_page: 1, per_page: 25, from: 1, to: 1, total: 2, last_page: 2 },
            query: { page: 1, per_page: 25, search: '', sort: [], searches: [], filters: [] },
        });
        const page2Data = createIntegrationData({
            data: [{ name: 'Zed', email: 'zed@example.com', status: 'active' }],
            meta: { current_page: 2, per_page: 25, from: 2, to: 2, total: 2, last_page: 2 },
            query: { page: 2, per_page: 25, search: '', sort: [], searches: [], filters: [] },
        });

        let capturedResult: any = null;
        const TestWrapper = ({ data }: { data: typeof page1Data }) => {
            const result = useDataTable({ data, enableRowSelection: true });
            capturedResult = result;
            return null;
        };

        const { rerender } = render(<TestWrapper data={page1Data} />);

        // Select Alice (no id, fallback id based on page 1 index 0)
        const aliceRow = capturedResult.table.getRowModel().rows[0];
        act(() => capturedResult.setRowSelection({ [aliceRow.id]: true }));
        expect(aliceRow.getIsSelected()).toBe(true);
        expect(aliceRow.id).toBe('fallback:0:1:0');

        // Navigate to page 2: Zed at index 0 gets a different fallback id, must NOT be selected
        rerender(<TestWrapper data={page2Data} />);
        const zedRow = capturedResult.table.getRowModel().rows[0];
        expect(zedRow).toBeDefined();
        expect(zedRow.id).not.toBe(aliceRow.id);
        expect(zedRow.getIsSelected()).toBe(false);

        // Return to page 1: data reference changed, generation bumped, so Alice
        // gets a new fallback id. Old selection does not carry over for
        // fallback ids (they are page- and generation-scoped).
        rerender(<TestWrapper data={page1Data} />);
        const aliceRowAgain = capturedResult.table.getRowModel().rows.find(
            (r: { id: string }) => r.id === aliceRow.id
        );
        expect(aliceRowAgain).toBeUndefined();
    });
});

describe('useDataTable sorting (real TanStack Table)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    function renderSortableTable() {
        const initialData = createIntegrationData({
            data: [
                { id: 1, name: 'Ada', email: 'ada@example.com', status: 'active' },
                { id: 2, name: 'Linus', email: 'linus@example.com', status: 'inactive' },
            ],
        });
        let capturedResult: any = null;
        const TestWrapper = () => {
            const result = useDataTable({ data: initialData });
            capturedResult = result;
            return null;
        };
        render(<TestWrapper />);
        // Expose a live reader: `capturedResult` is reassigned on every render, so
        // a getter always reflects the latest TanStack Table instance (and its
        // controlled sorting state).
        return {
            get table() {
                return capturedResult.table;
            },
        };
    }

    function columnById(result: any, id: string) {
        return result.table.getAllLeafColumns().find((column: { id: string }) => column.id === id)!;
    }

    it('configures multi-sort, sorting removal, and the max column count', () => {
        const result = renderSortableTable();

        expect(result.table.options.enableMultiSort).toBe(true);
        expect(result.table.options.enableSortingRemoval).toBe(true);
        // Matches the backend `max_sorts` default; the backend remains
        // authoritative and caps sorts per request via SortCollection::limit().
        expect(result.table.options.maxMultiSortColCount).toBe(10);
    });

    it('cycles a column through unsorted → ascending → descending → unsorted', () => {
        const result = renderSortableTable();
        const name = () => columnById(result, 'name');

        expect(result.table.state.sorting).toEqual([]);
        expect(name().getIsSorted()).toBe(false);

        act(() => name().getToggleSortingHandler()({ shiftKey: false } as unknown as MouseEvent));
        expect(result.table.state.sorting).toEqual([{ id: 'name', desc: false }]);
        expect(name().getIsSorted()).toBe('asc');

        act(() => name().getToggleSortingHandler()({ shiftKey: false } as unknown as MouseEvent));
        expect(result.table.state.sorting).toEqual([{ id: 'name', desc: true }]);
        expect(name().getIsSorted()).toBe('desc');

        act(() => name().getToggleSortingHandler()({ shiftKey: false } as unknown as MouseEvent));
        expect(result.table.state.sorting).toEqual([]);
        expect(name().getIsSorted()).toBe(false);
    });

    it('normal click replaces the existing sort instead of appending', () => {
        const result = renderSortableTable();
        const name = () => columnById(result, 'name');
        const email = () => columnById(result, 'email');

        act(() => name().getToggleSortingHandler()({ shiftKey: false } as unknown as MouseEvent));
        expect(result.table.state.sorting).toEqual([{ id: 'name', desc: false }]);

        act(() => email().getToggleSortingHandler()({ shiftKey: false } as unknown as MouseEvent));
        expect(result.table.state.sorting).toEqual([{ id: 'email', desc: false }]);
    });

    it('shift-click adds a second and third sorting column', () => {
        const result = renderSortableTable();
        const name = () => columnById(result, 'name');
        const email = () => columnById(result, 'email');
        const status = () => columnById(result, 'status');

        act(() => name().getToggleSortingHandler()({ shiftKey: false } as unknown as MouseEvent));
        act(() => email().getToggleSortingHandler()({ shiftKey: true } as unknown as MouseEvent));
        expect(result.table.state.sorting).toEqual([
            { id: 'name', desc: false },
            { id: 'email', desc: false },
        ]);

        act(() => status().getToggleSortingHandler()({ shiftKey: true } as unknown as MouseEvent));
        expect(result.table.state.sorting).toEqual([
            { id: 'name', desc: false },
            { id: 'email', desc: false },
            { id: 'status', desc: false },
        ]);
    });

    it('serializes multi-sorting to the Inertia visit as comma-separated columns', () => {
        const result = renderSortableTable();
        const name = () => columnById(result, 'name');
        const email = () => columnById(result, 'email');

        act(() => name().getToggleSortingHandler()({ shiftKey: false } as unknown as MouseEvent));
        act(() => email().getToggleSortingHandler()({ shiftKey: true } as unknown as MouseEvent));

        const lastCall = (router.visit as ReturnType<typeof vi.fn>).mock.calls.at(-1)!;
        // URLSearchParams percent-encodes the comma; the server decodes query
        // strings, so decode to assert the intended serialization.
        expect(decodeURIComponent(lastCall[0])).toBe('/?sort=name,email');
        expect(lastCall[1]).toMatchObject({ replace: true });
    });

    it('shift-click changes the direction of an already sorted column without losing others', () => {
        const result = renderSortableTable();
        const name = () => columnById(result, 'name');
        const email = () => columnById(result, 'email');

        act(() => name().getToggleSortingHandler()({ shiftKey: false } as unknown as MouseEvent));
        act(() => email().getToggleSortingHandler()({ shiftKey: true } as unknown as MouseEvent));
        expect(result.table.state.sorting).toEqual([
            { id: 'name', desc: false },
            { id: 'email', desc: false },
        ]);

        act(() => name().getToggleSortingHandler()({ shiftKey: true } as unknown as MouseEvent));
        expect(result.table.state.sorting).toEqual([
            { id: 'name', desc: true },
            { id: 'email', desc: false },
        ]);
    });

    it('clearing one sorting column preserves the others', () => {
        const result = renderSortableTable();
        const name = () => columnById(result, 'name');
        const email = () => columnById(result, 'email');

        act(() => name().getToggleSortingHandler()({ shiftKey: false } as unknown as MouseEvent)); // [name asc]
        act(() => email().getToggleSortingHandler()({ shiftKey: true } as unknown as MouseEvent)); // [name asc, email asc]
        act(() => name().getToggleSortingHandler()({ shiftKey: true } as unknown as MouseEvent)); // [name desc, email asc]
        expect(result.table.state.sorting).toEqual([
            { id: 'name', desc: true },
            { id: 'email', desc: false },
        ]);

        // Shift-click name again → removed, email preserved.
        act(() => name().getToggleSortingHandler()({ shiftKey: true } as unknown as MouseEvent)); // [email asc]
        expect(result.table.state.sorting).toEqual([{ id: 'email', desc: false }]);
    });
});
