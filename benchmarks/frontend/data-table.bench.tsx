import { cleanup, render } from '@testing-library/react';
import { afterEach, bench, describe } from 'vitest';
import { DataTable } from '../../registry/data-table/components/data-table/data-table';
import { formatCellValue } from '../../registry/data-table/components/data-table/cell-formatters';
import type {
    DataTableColumn,
    DataTableResponse,
} from '../../registry/data-table/components/data-table/types';

type Row = Record<string, unknown>;

const columns: DataTableColumn[] = [
    { name: 'id', label: 'ID', sortable: true, searchable: false, filterable: false, hidden: false },
    { name: 'name', label: 'Name', sortable: true, searchable: true, filterable: false, hidden: false },
    { name: 'email', label: 'Email', sortable: true, searchable: true, filterable: false, hidden: false },
    {
        name: 'status',
        label: 'Status',
        sortable: true,
        searchable: false,
        filterable: true,
        hidden: false,
        filter_type: 'select',
        filter_options: [
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
        ],
    },
    {
        name: 'verified',
        label: 'Verified',
        sortable: false,
        searchable: false,
        filterable: true,
        hidden: false,
        filter_type: 'boolean',
    },
    { name: 'meta', label: 'Meta', sortable: false, searchable: false, filterable: false, hidden: false },
    { name: 'created_at', label: 'Created', sortable: true, searchable: false, filterable: false, hidden: false },
];

function makeRows(count: number): Row[] {
    return Array.from({ length: count }, (_, i) => ({
        id: i + 1,
        name: `User ${i + 1}`,
        email: `user${i + 1}@example.com`,
        status: i % 3 === 0 ? 'inactive' : 'active',
        verified: i % 2 === 0,
        meta: i % 4 === 0 ? null : { team: `team-${i % 7}`, roles: ['viewer', 'editor'] },
        created_at: `2026-01-${String((i % 28) + 1).padStart(2, '0')}T10:00:00Z`,
    }));
}

function makeResponse(perPage: number): DataTableResponse<Row> {
    return {
        data: makeRows(perPage),
        meta: {
            current_page: 2,
            per_page: perPage,
            from: perPage + 1,
            to: perPage * 2,
            total: perPage * 40,
            last_page: 40,
        },
        query: {
            page: 2,
            per_page: perPage,
            search: 'user',
            sort: [{ column: 'name', direction: 'asc' }],
            searches: [],
            filters: [{ column: 'status', value: 'active' }],
        },
        columns,
        config: { debounce: 300, per_page_options: [10, 25, 50, 100] },
    };
}

const response25 = makeResponse(25);
const response100 = makeResponse(100);

// CodSpeed runs each benchmark several times back to back, awaiting only
// microtasks. Under CPU simulation that can block the event loop for longer
// than Vitest's 60 s worker RPC timeout, so every suite yields to the event
// loop between runs. Hooks run outside the measured section.
const yieldToEventLoop = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('DataTable render', () => {
    afterEach(yieldToEventLoop);

    bench('25 rows', () => {
        render(<DataTable data={response25} />);
        cleanup();
    });

    bench('100 rows', () => {
        render(<DataTable data={response100} />);
        cleanup();
    });

    bench('100 rows with row selection and actions', () => {
        render(
            <DataTable
                data={response100}
                enableRowSelection
                rowKey={(row) => String(row.id)}
                actions={({ row }) => <button type="button">Edit {String(row.id)}</button>}
            />
        );
        cleanup();
    });
});

const cellValues: unknown[] = makeRows(100).flatMap((row) => Object.values(row));

describe('formatCellValue', () => {
    afterEach(yieldToEventLoop);

    bench('700 mixed cell values', () => {
        for (const value of cellValues) {
            formatCellValue(value);
        }
    });
});
