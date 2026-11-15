import { act, render } from '@testing-library/react';
import { router } from '@inertiajs/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataTable } from './data-table';
import type { DataTableResponse } from './types';
import { useDataTable } from './use-data-table';

vi.unmock('@tanstack/react-table');

interface TestRow {
    id: number;
    name: string;
}

function createData(filters: Array<{ column: string; value: unknown }> = []): DataTableResponse<TestRow> {
    return {
        data: [
            { id: 1, name: 'Ada' },
            { id: 2, name: 'Linus' },
        ],
        meta: {
            current_page: 1,
            per_page: 25,
            from: 1,
            to: 2,
            total: 2,
            last_page: 1,
        },
        query: {
            page: 1,
            per_page: 25,
            search: '',
            sort: [{ column: 'name', direction: 'asc' }],
            searches: [],
            filters,
        },
        columns: [
            { name: 'id', label: 'ID', sortable: false, searchable: false, filterable: false, hidden: false },
            { name: 'name', label: 'Name', sortable: true, searchable: true, filterable: true, hidden: false },
        ],
        config: {
            debounce: 300,
            per_page_options: [10, 25, 50, 100],
        },
    };
}

describe('useDataTable with TanStack Table v9', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        global.location.search = '';
    });

    it('accepts interface row types through the generic DataTable component', () => {
        const data = createData();
        const element = <DataTable data={data} dataPropName="users" />;

        expect(element).toBeTruthy();
    });

    it('uses the v9 table state API and renders server rows', () => {
        const data = createData();
        let capturedResult: ReturnType<typeof useDataTable<TestRow>> | null = null;
        const TestWrapper = () => {
            capturedResult = useDataTable<TestRow>({ data });
            return null;
        };

        render(<TestWrapper />);

        expect(capturedResult).not.toBeNull();
        expect(capturedResult!.table.state.sorting).toEqual([{ id: 'name', desc: false }]);
        expect(capturedResult!.table.state.pagination.pageSize).toBe(25);
        expect(capturedResult!.table.state.columnVisibility).toEqual({ id: true, name: true });
        expect(capturedResult!.table.getAllLeafColumns()).toHaveLength(2);
        expect(capturedResult!.table.getRowModel().rows).toHaveLength(2);
    });

    it('publishes active server filters through the v9 state API', () => {
        const data = createData([{ column: 'name', value: 'Ada' }]);
        let capturedResult: ReturnType<typeof useDataTable<TestRow>> | null = null;
        const TestWrapper = () => {
            capturedResult = useDataTable<TestRow>({ data });
            return null;
        };

        render(<TestWrapper />);

        expect(capturedResult!.table.state.columnFilters).toEqual([
            { id: 'name', value: 'Ada' },
        ]);
    });

    it('sends v9 sorting changes through Inertia', () => {
        const data = createData();
        let capturedResult: ReturnType<typeof useDataTable<TestRow>> | null = null;
        const TestWrapper = () => {
            capturedResult = useDataTable<TestRow>({ data });
            return null;
        };

        render(<TestWrapper />);

        act(() => {
            const nameColumn = capturedResult!.table
                .getAllLeafColumns()
                .find((column) => column.id === 'name');

            nameColumn?.toggleSorting(true);
        });

        expect(router.visit).toHaveBeenCalledWith(
            '/?sort=-name',
            expect.any(Object)
        );
    });
});
