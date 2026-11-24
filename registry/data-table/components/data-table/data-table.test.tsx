import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { router, usePage } from '@inertiajs/react';
import { userEvent } from '@testing-library/user-event';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataTable } from './data-table';
import { DataTableFilterChip } from './data-table-toolbar';
import type { DataTableResponse } from './types';

vi.unmock('@tanstack/react-table');

vi.mock('@inertiajs/react', () => ({
    router: {
        visit: vi.fn(),
    },
    usePage: vi.fn(() => ({ props: {} })),
}));

// Local test-only mock of the dropdown-menu shim. Mirrors real Radix
// DropdownMenu behaviour so the fixed trigger (no redundant onClick) can be
// exercised: the trigger toggles the controlled `open` state through
// `onOpenChange` on pointerDown (matching real Radix DropdownMenuTrigger,
// which toggles on pointerDown via composeEventHandlers), composing the
// child's handler first then the trigger's toggle. `openChangeCalls`
// records each state-update request so tests can assert exactly one request
// per click.
const openChangeCalls = vi.hoisted(() => [] as boolean[]);
const DropdownMenuContext = React.createContext<{
    open: boolean;
    onOpenChange: ((open: boolean) => void) | undefined;
}>({ open: false, onOpenChange: undefined });

// Shared radio-group value so Yes/No items stay mutually exclusive within one
// menu. Mirrors the local test-only stub in ui/dropdown-menu.tsx.
const DropdownMenuRadioGroupContext = React.createContext<{
    value: string | undefined;
    onValueChange: ((value: string) => void) | undefined;
}>({ value: undefined, onValueChange: undefined });

type MenuProps = {
    children?: React.ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'children'>;

vi.mock('@/components/ui/dropdown-menu', () => ({
    DropdownMenu: ({ children, open, onOpenChange, ...props }: MenuProps) => (
        <DropdownMenuContext.Provider value={{ open: open ?? false, onOpenChange }}>
            <div data-open={open} {...props}>{children}</div>
        </DropdownMenuContext.Provider>
    ),
    DropdownMenuTrigger: ({
        children,
        asChild,
        open: _open,
        onOpenChange: _onOpenChange,
        ...props
    }: MenuProps & { asChild?: boolean }) => {
        const ctx = React.useContext(DropdownMenuContext);

        // Real Radix DropdownMenuTrigger toggles on pointerDown (not click) and
        // composes handlers with composeEventHandlers: the child's handler runs
        // first, then the trigger's toggle, unless the event is defaultPrevented.
        const handlePointerDown = () => {
            if (ctx.onOpenChange && typeof ctx.open === 'boolean') {
                const next = !ctx.open;
                openChangeCalls.push(next);
                ctx.onOpenChange(next);
            }
        };

        if (asChild && React.isValidElement(children)) {
            const child = children as React.ReactElement;
            const childOnPointerDown = (child.props as { onPointerDown?: React.PointerEventHandler<HTMLButtonElement> }).onPointerDown;
            const childOnClick = (child.props as { onClick?: React.MouseEventHandler<HTMLButtonElement> }).onClick;
            return React.cloneElement(child, {
                ...props,
                onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
                    childOnPointerDown?.(event);
                    handlePointerDown();
                },
                onClick: childOnClick,
            } as any);
        }

        return <div {...props} onPointerDown={handlePointerDown}>{children}</div>;
    },
    DropdownMenuContent: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
        <div {...props}>{children}</div>
    ),
    DropdownMenuItem: ({
        children,
        onSelect,
        ...props
    }: { onSelect?: (event: Event) => void } & React.HTMLAttributes<HTMLDivElement>) => {
        const onClick = (event: React.MouseEvent<HTMLDivElement>) => {
            props.onClick?.(event);
            onSelect?.(new Event('select'));
        };
        return <div {...props} onClick={onClick}>{children}</div>;
    },
    DropdownMenuCheckboxItem: ({
        children,
        checked = false,
        onCheckedChange,
        ...props
    }: { checked?: boolean; onCheckedChange?: (checked: boolean) => void } & React.HTMLAttributes<HTMLDivElement>) => {
        const onClick = (event: React.MouseEvent<HTMLDivElement>) => {
            props.onClick?.(event);
            onCheckedChange?.(!checked);
        };

        return (
            <div {...props} role="menuitemcheckbox" aria-checked={checked} onClick={onClick}>
                {children}
            </div>
        );
    },
    DropdownMenuRadioGroup: ({
        children,
        value,
        onValueChange: externalOnValueChange,
        ...props
    }: { value?: string; onValueChange?: (value: string) => void } & React.HTMLAttributes<HTMLDivElement>) => {
        const onValueChange = (next: string) => {
            externalOnValueChange?.(next);
        };

        return (
            <DropdownMenuRadioGroupContext.Provider value={{ value, onValueChange }}>
                <div {...props} role="group" aria-orientation="vertical">{children}</div>
            </DropdownMenuRadioGroupContext.Provider>
        );
    },
    DropdownMenuRadioItem: ({
        children,
        value,
        onCheckedChange,
        ...props
    }: { value: string; onCheckedChange?: (checked: boolean) => void } & React.HTMLAttributes<HTMLDivElement>) => {
        const { value: groupValue, onValueChange } = React.useContext(DropdownMenuRadioGroupContext);
        const checked = groupValue === value;

        const onClick = (event: React.MouseEvent<HTMLDivElement>) => {
            props.onClick?.(event);
            onCheckedChange?.(!checked);
            onValueChange?.(value);
        };

        return (
            <div {...props} role="menuitemradio" aria-checked={checked} onClick={onClick}>
                {children}
            </div>
        );
    },
    DropdownMenuSeparator: ({ ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props} />,
    DropdownMenuLabel: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
        <div {...props}>{children}</div>
    ),
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

    it('renders the full table structure: headers, rows, and pagination', () => {
        render(<DataTable data={createData()} />);

        const table = screen.getByRole('table');

        // Column headers render inside the table
        expect(within(table).getByText('ID')).toBeInTheDocument();
        expect(within(table).getByText('Name')).toBeInTheDocument();
        expect(within(table).getByText('Status')).toBeInTheDocument();

        // Data rows render actual cell values
        expect(screen.getByText('Ada')).toBeInTheDocument();
        expect(screen.getByText('Linus')).toBeInTheDocument();
        expect(screen.getByText('active')).toBeInTheDocument();
        expect(screen.getByText('inactive')).toBeInTheDocument();

        // Pagination summary renders
        expect(screen.getByText(/Showing/).textContent).toBe('Showing 1 to 2 of 2 results');
    });

    it('wraps the table in a horizontally scrollable region so wide tables do not widen the page', () => {
        render(<DataTable data={createData()} />);

        const table = screen.getByRole('table');
        const wrapper = table.parentElement;

        expect(wrapper).not.toBeNull();
        expect(wrapper).toHaveClass('overflow-x-auto');
        expect(wrapper!.className).toContain('rounded-md');
        expect(wrapper!.className).toContain('border');
    });

    it('does not trigger onRowClick when clicking row actions', () => {
        const onRowClick = vi.fn();

        render(
            <DataTable
                data={createData()}
                onRowClick={onRowClick}
                actions={({ row }) => <button data-testid={`action-${row.id}`}>Delete</button>}
            />
        );

        fireEvent.click(screen.getByTestId('action-1'));

        expect(onRowClick).not.toHaveBeenCalled();
    });

    it('triggers onRowClick on keyboard Enter and Space', () => {
        const onRowClick = vi.fn();

        render(<DataTable data={createData()} onRowClick={onRowClick} />);

        const row = screen.getByText('Ada').closest('tr')!;
        fireEvent.keyDown(row, { key: 'Enter' });
        expect(onRowClick).toHaveBeenCalledTimes(1);

        fireEvent.keyDown(row, { key: ' ' });
        expect(onRowClick).toHaveBeenCalledTimes(2);
    });

    it('renders the reset button in toolbar when table has active filters', () => {
        render(
            <DataTable
                data={createData({
                    query: {
                        page: 1,
                        per_page: 25,
                        search: 'Ada',
                        sort: [],
                        searches: [],
                        filters: [],
                    },
                })}
            />
        );

        expect(screen.getByRole('button', { name: 'Reset filters' })).toBeInTheDocument();
    });

    it('moves filter controls to a toolbar chip beside the search field', async () => {
        const user = userEvent.setup();
        render(
            <DataTable
                data={createData({
                    columns: [
                        { name: 'name', label: 'Name', sortable: true, searchable: true, filterable: true, hidden: false, filter_type: 'text' },
                    ],
                    query: {
                        page: 1,
                        per_page: 25,
                        search: '',
                        sort: [],
                        searches: [],
                        filters: [{ column: 'name', value: 'Ada' }],
                    },
                })}
            />
        );

        // Filter chip lives in the toolbar beside the global search field
        expect(screen.getByRole('button', { name: 'Name • 1 selected' })).toBeInTheDocument();

        // Clicking the chip opens a dropdown with the column's filter controls
        await user.click(screen.getByRole('button', { name: 'Name • 1 selected' }));
        expect(screen.getByLabelText('Filter Name value')).toBeInTheDocument();

        // Column headers stay clean: only the sort indicator, no filter dropdown
        const table = screen.getByRole('table');
        expect(within(table).queryByRole('button', { name: /Name •/ })).not.toBeInTheDocument();
        expect(within(table).getByRole('button', { name: /Sort by Name/ })).toBeInTheDocument();
    });

    it('shows the selected count on a filter chip for multi-value filters', async () => {
        const user = userEvent.setup();
        render(
            <DataTable
                data={createData({
                    columns: [
                        {
                            name: 'status',
                            label: 'Status',
                            sortable: false,
                            searchable: false,
                            filterable: true,
                            hidden: false,
                            filter_type: 'select',
                            filter_options: [
                                { value: 'active', label: 'Active' },
                                { value: 'inactive', label: 'Inactive' },
                                { value: 'archived', label: 'Archived' },
                            ],
                        },
                    ],
                    query: {
                        page: 1,
                        per_page: 25,
                        search: '',
                        sort: [],
                        searches: [],
                        filters: [{ column: 'status', value: ['active', 'inactive'] }],
                    },
                })}
            />
        );

        expect(screen.getByRole('button', { name: 'Status • 2 selected' })).toBeInTheDocument();

        // Opening the chip should show the restored multi-value options as checked.
        await user.click(screen.getByRole('button', { name: 'Status • 2 selected' }));
        expect(screen.getByRole('menuitemcheckbox', { name: 'Active' })).toHaveAttribute('aria-checked', 'true');
        expect(screen.getByRole('menuitemcheckbox', { name: 'Inactive' })).toHaveAttribute('aria-checked', 'true');
        expect(screen.getByRole('menuitemcheckbox', { name: 'Archived' })).toHaveAttribute('aria-checked', 'false');
    });

    it('keeps a filter entrypoint for eligible columns when no filter is active', async () => {
        const user = userEvent.setup();
        render(
            <DataTable
                data={createData({
                    columns: [
                        { name: 'name', label: 'Name', sortable: true, searchable: true, filterable: true, hidden: false, filter_type: 'text' },
                    ],
                })}
            />
        );

        // No filters are active, but the column still offers an entrypoint to
        // start filtering or searching beside the global search field.
        expect(screen.getByRole('button', { name: 'Name' })).toBeInTheDocument();

        // Closed state: filter controls are hidden until the chip is opened.
        expect(screen.queryByLabelText('Search Name')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Filter Name value')).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Name' }));
        expect(screen.getByLabelText('Search Name')).toBeInTheDocument();
        expect(screen.getByLabelText('Filter Name value')).toBeInTheDocument();
    });

    it('toggles the filter dropdown open and closed, preserving aria-expanded', async () => {
        const user = userEvent.setup();
        render(
            <DataTable
                data={createData({
                    columns: [
                        {
                            name: 'status',
                            label: 'Status',
                            sortable: false,
                            searchable: false,
                            filterable: true,
                            hidden: false,
                            filter_type: 'select',
                            filter_options: [
                                { value: 'active', label: 'Active' },
                                { value: 'inactive', label: 'Inactive' },
                            ],
                        },
                    ],
                    query: {
                        page: 1,
                        per_page: 25,
                        search: '',
                        sort: [],
                        searches: [],
                        filters: [{ column: 'status', value: 'active' }],
                    },
                })}
            />
        );

        const chip = screen.getByRole('button', { name: 'Status • 1 selected' });
        expect(chip).toHaveAttribute('aria-haspopup', 'true');
        expect(chip).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByRole('menuitemcheckbox', { name: 'Active' })).not.toBeInTheDocument();

        await user.click(chip);
        expect(chip).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByRole('menuitemcheckbox', { name: 'Active' })).toBeChecked();

        await user.click(chip);
        expect(chip).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByRole('menuitemcheckbox', { name: 'Active' })).not.toBeInTheDocument();
    });

    it('renders 0 to 0 of 0 results when total is 0', () => {
        render(
            <DataTable
                data={createData({
                    data: [],
                    meta: {
                        current_page: 1,
                        per_page: 25,
                        from: null,
                        to: null,
                        total: 0,
                        last_page: 1,
                    },
                })}
            />
        );

        expect(screen.getByText(/Showing/).textContent).toBe('Showing 0 to 0 of 0 results');
    });

    it('renders the correct zero-results summary when a search returns no results', () => {
        render(
            <DataTable
                data={createData({
                    data: [],
                    meta: {
                        current_page: 1,
                        per_page: 25,
                        from: null,
                        to: null,
                        total: 0,
                        last_page: 1,
                    },
                    query: {
                        page: 1,
                        per_page: 25,
                        search: 'no-match',
                        sort: [],
                        searches: [],
                        filters: [],
                    },
                })}
            />
        );

        expect(screen.getByText(/Showing/).textContent).toBe('Showing 0 to 0 of 0 results');
        expect(screen.getByText('No results found')).toBeInTheDocument();
    });

    it('spans only visible columns in the empty row when a column is hidden', () => {
        render(
            <DataTable
                data={createData({
                    data: [],
                    meta: {
                        current_page: 1,
                        per_page: 25,
                        from: null,
                        to: null,
                        total: 0,
                        last_page: 1,
                    },
                })}
            />
        );

        expect(screen.getByText('No results found')).toBeInTheDocument();

        // open the column visibility menu and hide the "Status" column
        fireEvent.click(screen.getByRole('button', { name: /Columns/ }));
        const checkboxes = screen.getAllByRole('checkbox');
        fireEvent.click(checkboxes[2]); // Status column

        const emptyRow = screen.getByText('No results found').closest('tr')!;
        const cell = emptyRow.querySelector('td')!;
        expect(cell.getAttribute('colspan')).toBe('2');
    });

    it('does not trigger onRowClick when pressing Enter on a nested action button', () => {
        const onRowClick = vi.fn();

        render(
            <DataTable
                data={createData()}
                onRowClick={onRowClick}
                actions={({ row }) => <button data-testid={`action-${row.id}`}>Delete</button>}
            />
        );

        const actionButton = screen.getByTestId('action-1');
        fireEvent.keyDown(actionButton, { key: 'Enter' });

        expect(onRowClick).not.toHaveBeenCalled();
    });

    it('skips onRowClick when clicking an interactive link or button inside a cell', () => {
        const onRowClick = vi.fn();

        render(
            <DataTable
                data={createData()}
                onRowClick={onRowClick}
                cells={{
                    name: ({ getValue }) => <a href="#profile">{String(getValue())}</a>,
                }}
            />
        );

        fireEvent.click(screen.getByText('Ada'));
        expect(onRowClick).not.toHaveBeenCalled();

        fireEvent.click(screen.getByText('active'));
        expect(onRowClick).toHaveBeenCalledTimes(1);
    });

    it('cancels pending debounce timers when Reset is clicked and visits immediately', () => {
        vi.useFakeTimers();

        render(
            <DataTable
                data={createData({
                    query: {
                        page: 1,
                        per_page: 25,
                        search: '',
                        sort: [],
                        searches: [],
                        filters: [],
                    },
                })}
            />
        );

        const searchInput = screen.getByLabelText('Global search');
        fireEvent.change(searchInput, { target: { value: 'draft-query' } });

        const resetButton = screen.getByRole('button', { name: 'Reset filters' });
        fireEvent.click(resetButton);

        vi.runAllTimers();

        const calls = (router.visit as ReturnType<typeof vi.fn>).mock.calls;
        const lastUrl = calls[calls.length - 1]?.[0] as string;
        expect(lastUrl).not.toContain('draft-query');

        vi.useRealTimers();
    });

    it('updates row selection feedback when row selection is enabled', () => {
        render(
            <DataTable
                data={createData()}
                enableRowSelection={true}
                columns={[
                    {
                        id: 'select',
                        header: () => null,
                        cell: ({ row }) => (
                            <input
                                type="checkbox"
                                aria-label={`Select ${row.original.name}`}
                                checked={row.getIsSelected()}
                                onChange={row.getToggleSelectedHandler()}
                            />
                        ),
                    },
                ]}
            />
        );

        const checkbox = screen.getByLabelText('Select Ada');
        expect(checkbox).not.toBeChecked();

        fireEvent.click(checkbox);
        expect(checkbox).toBeChecked();

        const row = checkbox.closest('tr')!;
        expect(row).toHaveAttribute('data-state', 'selected');

        expect(screen.getByRole('status')).toHaveTextContent('1 of 2 row(s) selected.');

        fireEvent.click(checkbox);
        expect(screen.getByRole('status')).toHaveTextContent('Showing 1 to 2 of 2 results');
    });

    it('includes active perPage in options when missing from perPageOptions', () => {
        render(
            <DataTable
                data={createData({
                    meta: {
                        current_page: 1,
                        per_page: 15,
                        from: 1,
                        to: 2,
                        total: 2,
                        last_page: 1,
                    },
                    query: {
                        page: 1,
                        per_page: 15,
                        search: '',
                        sort: [],
                        searches: [],
                        filters: [],
                    },
                    config: {
                        debounce: 300,
                        per_page_options: [10, 25, 50],
                    },
                })}
            />
        );

        const options = screen.getAllByRole('option').map((o) => o.textContent);
        expect(options).toContain('15');
    });

    it('provides accessible name to the rows per page select', () => {
        render(<DataTable data={createData()} />);

        expect(screen.getByRole('combobox', { name: 'Rows per page' })).toBeInTheDocument();
    });
});

describe('DataTable filter chip dropdown regression (#98)', () => {
    const selectOptions = [
        { value: 'active', label: 'Active' },
        { value: 'inactive', label: 'Inactive' },
    ];

    function renderFilterChip(filters: Record<string, unknown> = { status: 'active' }) {
        render(
            <DataTableFilterChip
                columnId="status"
                label="Status"
                filterValue={filters.status}
                searchValue=""
                filterType="select"
                filterOptions={selectOptions}
                canSearch={false}
                canFilter={true}
                onFilterChange={vi.fn()}
                onColumnSearchChange={vi.fn()}
                onClearFilter={vi.fn()}
            />
        );
    }

    beforeEach(() => {
        openChangeCalls.length = 0;
    });

    it('opens a closed filter chip with exactly one state-update request', async () => {
        const user = userEvent.setup();
        renderFilterChip();

        const chip = screen.getByRole('button', { name: 'Status • 1 selected' });
        expect(chip).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByRole('menuitemcheckbox', { name: 'Active' })).not.toBeInTheDocument();

        await user.click(chip);

        // Exactly one state-update request: open → true (the original defect
        // requested open then close, producing two requests for one click).
        expect(openChangeCalls).toHaveLength(1);
        expect(openChangeCalls[0]).toBe(true);

        // Dropdown stays open immediately after opening.
        expect(chip).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByRole('menuitemcheckbox', { name: 'Active' })).toBeChecked();
        expect(chip).toHaveAttribute('aria-expanded', 'true');
    });

    it('closes an open filter chip with exactly one state-update request', async () => {
        const user = userEvent.setup();
        renderFilterChip();
        const chip = screen.getByRole('button', { name: 'Status • 1 selected' });

        await user.click(chip);
        expect(openChangeCalls).toEqual([true]);
        expect(chip).toHaveAttribute('aria-expanded', 'true');

        await user.click(chip);
        expect(openChangeCalls).toEqual([true, false]);
        expect(chip).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByRole('menuitemcheckbox', { name: 'Active' })).not.toBeInTheDocument();
    });

    it('keeps displaying the active filter count while interacting', async () => {
        const user = userEvent.setup();
        renderFilterChip();

        const chip = screen.getByRole('button', { name: 'Status • 1 selected' });
        expect(chip).toHaveTextContent('Status • 1 selected');

        await user.click(chip);
        expect(chip).toHaveTextContent('Status • 1 selected');

        await user.click(chip);
        expect(chip).toHaveTextContent('Status • 1 selected');
    });

    it('keeps filter selection functional when the chip is opened and closed', async () => {
        const user = userEvent.setup();
        const onFilterChange = vi.fn();
        render(
            <DataTableFilterChip
                columnId="status"
                label="Status"
                filterValue="active"
                searchValue=""
                filterType="select"
                filterOptions={selectOptions}
                canSearch={false}
                canFilter={true}
                onFilterChange={onFilterChange}
                onColumnSearchChange={vi.fn()}
                onClearFilter={vi.fn()}
            />
        );

        const chip = screen.getByRole('button', { name: 'Status • 1 selected' });
        await user.click(chip);
        expect(chip).toHaveAttribute('aria-expanded', 'true');

        fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Inactive' }));
        expect(onFilterChange).toHaveBeenCalledWith('status', 'inactive');

        // Selecting a filter value closes the chip dropdown.
        expect(chip).toHaveAttribute('aria-expanded', 'false');
    });
});
