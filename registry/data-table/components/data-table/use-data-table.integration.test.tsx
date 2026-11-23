import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render } from '@testing-library/react';
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
});
