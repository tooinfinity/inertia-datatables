import { act, fireEvent, render, screen } from '@testing-library/react';
import { router, usePage } from '@inertiajs/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataTable } from './data-table';
import type { DataTableResponse } from './types';

vi.unmock('@tanstack/react-table');

vi.mock('@inertiajs/react', () => ({
    router: {
        visit: vi.fn(),
    },
    usePage: vi.fn(() => ({ props: {} })),
}));

interface TestRow {
    id: number;
    name: string;
    status: string;
}

function createData(overrides: Partial<DataTableResponse<TestRow>> = {}): DataTableResponse<TestRow> {
    return {
        data: [
            { id: 1, name: 'Ada', status: 'active' },
            { id: 2, name: 'Linus', status: 'inactive' },
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
            sort: [],
            searches: [],
            filters: [],
        },
        columns: [
            { name: 'id', label: 'ID', sortable: false, searchable: false, filterable: false, hidden: false },
            { name: 'name', label: 'Name', sortable: true, searchable: true, filterable: false, hidden: false },
            { name: 'status', label: 'Status', sortable: false, searchable: false, filterable: false, hidden: false },
        ],
        config: {
            debounce: 300,
            per_page_options: [10, 25, 50, 100],
        },
        ...overrides,
    };
}

function lastVisitOptions() {
    const calls = (router.visit as ReturnType<typeof vi.fn>).mock.calls;
    return calls[calls.length - 1]?.[1] as {
        onStart: () => void;
        onFinish: () => void;
        onError: (_errors: Record<string, string>) => void;
    };
}

describe('DataTable customization', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(usePage).mockReturnValue({ props: {} } as never);
        global.location.search = '';
    });

    it('renders a custom cell renderer for the given column', () => {
        render(
            <DataTable
                data={createData()}
                cells={{
                    status: ({ getValue }) => (
                        <span data-testid="status-badge">{String(getValue())}</span>
                    ),
                }}
            />
        );

        expect(screen.getAllByTestId('status-badge').map((node) => node.textContent)).toEqual([
            'active',
            'inactive',
        ]);
    });

    it('falls back to the default formatter for columns without a renderer', () => {
        render(
            <DataTable
                data={createData()}
                cells={{
                    status: ({ getValue }) => <span>{String(getValue())}</span>,
                }}
            />
        );

        expect(screen.getByText('Ada')).toBeInTheDocument();
    });

    it('prefers a column definition override over the cell renderer', () => {
        render(
            <DataTable
                data={createData()}
                cells={{ status: () => <span>from-cells</span> }}
                columns={[{ id: 'status', cell: () => <span>from-columns</span> }]}
            />
        );

        expect(screen.queryByText('from-cells')).not.toBeInTheDocument();
        expect(screen.getAllByText('from-columns')).toHaveLength(2);
    });

    it('renders the row actions for every row', () => {
        render(
            <DataTable
                data={createData()}
                actions={({ row }) => <button>Edit {row.name}</button>}
            />
        );

        expect(screen.getByRole('button', { name: 'Edit Ada' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Edit Linus' })).toBeInTheDocument();
    });

    it('keeps client side columns out of the column visibility menu', () => {
        render(
            <DataTable
                data={createData()}
                actions={({ row }) => <button>Edit {row.name}</button>}
            />
        );

        expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    });

    it('calls onRowClick with the clicked row', () => {
        const onRowClick = vi.fn();

        render(<DataTable data={createData()} onRowClick={onRowClick} />);

        fireEvent.click(screen.getByText('Linus'));

        expect(onRowClick).toHaveBeenCalledTimes(1);
        expect(onRowClick).toHaveBeenCalledWith(
            expect.objectContaining({ id: 2, name: 'Linus' }),
            1
        );
    });

    it('renders the toolbar slot', () => {
        render(<DataTable data={createData()} toolbar={<span>Toolbar actions</span>} />);

        expect(screen.getByText('Toolbar actions')).toBeInTheDocument();
    });

    it('renders the empty slot when there are no rows', () => {
        render(
            <DataTable
                data={createData({ data: [] })}
                empty={<span>Nothing to show</span>}
            />
        );

        expect(screen.getByText('Nothing to show')).toBeInTheDocument();
        expect(screen.queryByText('No results found')).not.toBeInTheDocument();
    });

    it('marks the table as busy and renders skeleton rows while a visit is in flight', () => {
        render(<DataTable data={createData()} />);

        expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'false');

        fireEvent.change(screen.getByRole('combobox'), { target: { value: '50' } });

        const options = lastVisitOptions();

        act(() => options.onStart());

        expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true');
        expect(screen.queryByText('Ada')).not.toBeInTheDocument();

        act(() => options.onFinish());

        expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'false');
        expect(screen.getByText('Ada')).toBeInTheDocument();
    });

    it('forwards visit errors to the onError callback', () => {
        const onError = vi.fn();

        render(<DataTable data={createData()} onError={onError} />);

        fireEvent.change(screen.getByRole('combobox'), { target: { value: '50' } });

        const options = lastVisitOptions();

        act(() => options.onError({ email: 'is invalid' }));

        expect(onError).toHaveBeenCalledWith({ email: 'is invalid' });
    });

    it('warns in development when the Inertia page prop is missing', () => {
        vi.mocked(usePage).mockReturnValue({ props: { somethingElse: true } } as never);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        render(<DataTable data={createData()} dataPropName="users" />);

        expect(warn).toHaveBeenCalledWith(expect.stringContaining('"users"'));

        warn.mockRestore();
    });

    it('does not warn when the Inertia page prop is present', () => {
        vi.mocked(usePage).mockReturnValue({ props: { users: createData() } } as never);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        render(<DataTable data={createData()} dataPropName="users" />);

        expect(warn).not.toHaveBeenCalled();

        warn.mockRestore();
    });
});
