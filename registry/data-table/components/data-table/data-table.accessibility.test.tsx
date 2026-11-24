'use client';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { router, usePage } from '@inertiajs/react';
import { axe } from 'vitest-axe';
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
// DropdownMenu behaviour: the trigger toggles the controlled `open` state
// through `onOpenChange` on pointerDown (matching real Radix
// DropdownMenuTrigger, which toggles on pointerDown via composeEventHandlers),
// composing the child's handler first then the trigger's toggle. Required here
// because the fix removes the redundant Button onClick, so clicking the chip
// only opens the dropdown when the trigger itself manages open state.
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
    role: string;
}

function createData(overrides: Partial<DataTableResponse<TestRow>> = {}): DataTableResponse<TestRow> {
    return {
        data: [
            { id: 1, name: 'Ada', status: 'active', role: 'admin' },
            { id: 2, name: 'Linus', status: 'inactive', role: 'user' },
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
            { name: 'name', label: 'Name', sortable: true, searchable: true, filterable: true, filter_type: 'text', hidden: false },
            { name: 'status', label: 'Status', sortable: false, searchable: false, filterable: true, filter_type: 'select', filter_options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }], hidden: false },
            { name: 'role', label: 'Role', sortable: true, searchable: false, filterable: false, hidden: false },
        ],
        config: {
            debounce: 300,
            per_page_options: [10, 25, 50, 100],
        },
        ...overrides,
    };
}

describe('DataTable accessibility (issue #36)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(usePage).mockReturnValue({ props: {} } as never);
        global.location.search = '';
    });

    it('reports no axe violations on the rendered table (header, toolbar, pagination)', async () => {
        const { container } = render(<DataTable data={createData()} />);

        const results = await axe(container);

        expect(results.violations).toHaveLength(0);
    });

    it('exposes aria-sort only on the sorted sortable column header', () => {
        render(<DataTable data={createData()} />);

        const columnHeaders = screen.getAllByRole('columnheader');

        // Nothing is sorted initially: no header carries aria-sort.
        expect(columnHeaders.every((h) => !h.hasAttribute('aria-sort'))).toBe(true);

        // Sortable columns are still exposed as sort buttons with accessible names.
        expect(screen.getByRole('button', { name: /Sort by Name/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Sort by Role/ })).toBeInTheDocument();
    });

    it('updates aria-sort when the sort state changes', () => {
        render(<DataTable data={createData()} />);

        const nameButton = screen.getByRole('button', { name: /Sort by Name/ });
        const nameHeader = nameButton.closest('th')!;

        expect(nameHeader).not.toHaveAttribute('aria-sort');
        expect(nameButton).toHaveAccessibleName(
            'Sort by Name, currently unsorted. Click to sort ascending.'
        );

        act(() => {
            fireEvent.click(nameButton);
        });
        expect(nameHeader).toHaveAttribute('aria-sort', 'ascending');
        expect(nameButton).toHaveAccessibleName(
            'Sort by Name, currently sorted ascending. Click to sort descending.'
        );

        act(() => {
            fireEvent.click(nameButton);
        });
        expect(nameHeader).toHaveAttribute('aria-sort', 'descending');
        expect(nameButton).toHaveAccessibleName(
            'Sort by Name, currently sorted descending. Click to clear sorting.'
        );

        // Third click clears sorting and returns to unsorted. No header
        // should carry aria-sort when sorting is cleared.
        act(() => {
            fireEvent.click(nameButton);
        });
        expect(nameHeader).not.toHaveAttribute('aria-sort');
        expect(nameButton).toHaveAccessibleName(
            'Sort by Name, currently unsorted. Click to sort ascending.'
        );
    });

    it('applies aria-sort to the primary sorted column only during multi-sort', () => {
        render(
            <DataTable
                data={createData({
                    query: {
                        page: 1,
                        per_page: 25,
                        search: '',
                        sort: [
                            { column: 'name', direction: 'asc' },
                            { column: 'role', direction: 'desc' },
                        ],
                        searches: [],
                        filters: [],
                    },
                })}
            />
        );

        const nameButton = screen.getByRole('button', { name: /Sort by Name/ });
        const roleButton = screen.getByRole('button', { name: /Sort by Role/ });
        const nameHeader = nameButton.closest('th')!;
        const roleHeader = roleButton.closest('th')!;

        // Primary sort column keeps aria-sort; no other header does.
        expect(nameHeader).toHaveAttribute('aria-sort', 'ascending');
        expect(roleHeader).not.toHaveAttribute('aria-sort');
        // At most one header carries aria-sort while multi-sort is active.
        const sortedHeaders = screen.getAllByRole('columnheader').filter((h) =>
            h.hasAttribute('aria-sort')
        );
        expect(sortedHeaders).toHaveLength(1);

        expect(nameButton).toHaveAccessibleName(
            'Sort by Name, currently sorted ascending. Click to sort descending.'
        );
        expect(roleButton).toHaveAccessibleName(
            'Sort by Role, Secondary sort, priority 2. currently sorted descending. Click to clear sorting.'
        );
    });

    it('associates the column search label with its input via htmlFor/id', async () => {
        const user = userEvent.setup();
        render(
            <DataTable
                data={createData({
                    query: {
                        page: 1,
                        per_page: 25,
                        search: '',
                        sort: [],
                        searches: [{ column: 'name', value: 'Ada' }],
                        filters: [],
                    },
                })}
            />
        );

        const chip = screen.getByRole('button', { name: 'Name • 1 selected' });
        await user.click(chip);

        // getByLabelText returns the associated form control (the input);
        // the <label> element is found by its visible text.
        const label = screen.getByText('Search Name');
        const input = screen.getByLabelText('Search Name');
        expect(label).toBeInTheDocument();
        expect(input).toBeInTheDocument();
        expect(label).toHaveAttribute('for', input.getAttribute('id'));
        expect(label.tagName).toBe('LABEL');
    });

    it('gives the filter value input an accessible name', async () => {
        const user = userEvent.setup();
        render(
            <DataTable
                data={createData({
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

        // The "Name" column uses filter_type: 'text', so it renders a text filter input.
        const chip = screen.getByRole('button', { name: 'Name • 1 selected' });
        await user.click(chip);

        expect(screen.getByLabelText('Filter Name value')).toBeInTheDocument();
    });

    it('exposes aria-expanded on the filter trigger and hides the dropdown when closed', () => {
        render(
            <DataTable
                data={createData({
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

        const chip = screen.getByRole('button', { name: 'Name • 1 selected' });
        expect(chip).toHaveAttribute('aria-haspopup', 'true');
        expect(chip).toHaveAttribute('aria-expanded', 'false');

        // Toggle behavior (open/close on click) is covered by the DataTable
        // filter chip dropdown regression tests in data-table.test.tsx.
        expect(screen.queryByRole('menuitemcheckbox', { name: 'Active' })).not.toBeInTheDocument();
    });

    it('marks decorative sort arrow glyphs as hidden', () => {
        render(<DataTable data={createData()} />);

        const nameHeader = screen.getByRole('button', { name: /Sort by Name/ });
        const arrows = nameHeader.querySelectorAll('[aria-hidden="true"]');
        expect(arrows.length).toBeGreaterThan(0);
    });
});

describe('DataTable pagination accessibility (issue #107)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(usePage).mockReturnValue({ props: {} } as never);
        global.location.search = '';
    });

    it('exposes the pagination controls as a navigation landmark labelled "Pagination"', () => {
        render(<DataTable data={createData()} />);

        expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeInTheDocument();
    });

    it('exposes the result summary as a polite status region containing the current range', () => {
        render(<DataTable data={createData()} />);

        const status = screen.getByRole('status');
        expect(status).toHaveAttribute('aria-live', 'polite');
        expect(status).toHaveTextContent('Showing 1 to 2 of 2 results');
    });

    it('keeps announcing the accepted range during and after a failed page visit', () => {
        const base = createData();
        const initial = {
            ...base,
            query: { ...base.query, per_page: 2 },
            meta: { ...base.meta, per_page: 2, last_page: 2, total: 4 },
        };
        const onNetworkError = vi.fn();
        render(<DataTable data={initial} visitOptions={{ onNetworkError }} />);

        const status = screen.getByRole('status');
        expect(status).toHaveTextContent('Showing 1 to 2 of 4 results');

        fireEvent.click(screen.getByRole('button', { name: 'Next page' }));

        const [url, visit] = vi.mocked(router.visit).mock.lastCall!;
        expect(url).toContain('page=2');
        act(() => visit?.onStart?.(undefined as never));
        expect(status).toHaveTextContent('Showing 1 to 2 of 4 results');

        const error = new Error('Network unavailable');
        act(() => visit?.onNetworkError?.(error));
        expect(onNetworkError).toHaveBeenCalledWith(error);
        expect(status).toHaveTextContent('Showing 1 to 2 of 4 results');
    });

    it('announces the range from the accepted page response', () => {
        const base = createData();
        const initial = {
            ...base,
            query: { ...base.query, per_page: 2 },
            meta: { ...base.meta, per_page: 2, last_page: 2, total: 4 },
        };
        const accepted = {
            ...initial,
            data: base.data.map((row) => ({ ...row, id: row.id + 3 })),
            query: { ...initial.query, page: 2, per_page: 3 },
            meta: { ...initial.meta, current_page: 2, per_page: 3, from: 4, to: 5, total: 5 },
        };
        const { rerender } = render(<DataTable data={initial} />);

        fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
        expect(screen.getByRole('status')).toHaveTextContent('Showing 1 to 2 of 4 results');

        rerender(<DataTable data={accepted} />);
        expect(screen.getByRole('status')).toHaveTextContent('Showing 4 to 5 of 5 results');
    });

    it('updates the status region when totalItems changes', () => {
        const base = createData();
        const initial = {
            ...base,
            query: { ...base.query, page: 1, per_page: 25 },
            meta: { ...base.meta, current_page: 1, last_page: 2, total: 50, from: 1, to: 25 },
        };
        const updated = {
            ...base,
            query: { ...base.query, page: 1, per_page: 25 },
            meta: { ...base.meta, current_page: 1, last_page: 4, total: 100, from: 1, to: 25 },
        };

        const { rerender: rerenderTable } = render(<DataTable data={initial} />);

        expect(screen.getByRole('status')).toHaveTextContent('Showing 1 to 25 of 50 results');

        act(() => {
            rerenderTable(<DataTable data={updated} />);
        });

        expect(screen.getByRole('status')).toHaveTextContent('Showing 1 to 25 of 100 results');
    });
});

describe('DataTable filter chip menu accessibility (issue #108)', () => {
    const selectOptions = [
        { value: 'active', label: 'Active' },
        { value: 'inactive', label: 'Inactive' },
        { value: 'archived', label: 'Archived' },
    ];

    function renderSelectChip(filterValue: unknown) {
        return render(
            <DataTableFilterChip
                columnId="status"
                label="Status"
                filterValue={filterValue}
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

    function renderBooleanChip(filterValue: boolean | undefined) {
        return render(
            <DataTableFilterChip
                columnId="published"
                label="Published"
                filterValue={filterValue}
                searchValue=""
                filterType="boolean"
                filterOptions={[]}
                canSearch={false}
                canFilter={true}
                onFilterChange={vi.fn()}
                onColumnSearchChange={vi.fn()}
                onClearFilter={vi.fn()}
            />
        );
    }

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('select / multi-select filter options', () => {
        it('exposes each option as a menuitemcheckbox with aria-checked reflecting selection', async () => {
            const user = userEvent.setup();
            renderSelectChip('active');

            const chip = screen.getByRole('button', { name: 'Status • 1 selected' });
            await user.click(chip);

            expect(screen.getByRole('menuitemcheckbox', { name: 'Active' })).toHaveAttribute(
                'aria-checked',
                'true'
            );
            expect(screen.getByRole('menuitemcheckbox', { name: 'Inactive' })).toHaveAttribute(
                'aria-checked',
                'false'
            );
            expect(screen.getByRole('menuitemcheckbox', { name: 'Archived' })).toHaveAttribute(
                'aria-checked',
                'false'
            );
        });

        it('does not render a nested interactive checkbox inside a menu item', async () => {
            const user = userEvent.setup();
            renderSelectChip('active');

            await user.click(screen.getByRole('button', { name: 'Status • 1 selected' }));

            expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
            // Only the menuitemcheckbox itself carries the checked state.
            expect(screen.getAllByRole('menuitemcheckbox')).toHaveLength(3);
        });

        it('updates aria-checked when selecting and deselecting an option', async () => {
            const user = userEvent.setup();
            const onFilterChange = vi.fn();
            const { rerender } = render(
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

            // Selecting an option closes the dropdown (existing behavior), so each
            // selection is followed by a re-render that applies the new filter value
            // before the menu is reopened to verify the resulting checked state.

            await user.click(screen.getByRole('button', { name: 'Status • 1 selected' }));
            expect(screen.getByRole('menuitemcheckbox', { name: 'Active' })).toHaveAttribute('aria-checked', 'true');
            expect(screen.getByRole('menuitemcheckbox', { name: 'Inactive' })).toHaveAttribute('aria-checked', 'false');

            await user.click(screen.getByRole('menuitemcheckbox', { name: 'Inactive' }));
            expect(onFilterChange).toHaveBeenCalledWith('status', 'inactive');

            rerender(
                <DataTableFilterChip
                    columnId="status"
                    label="Status"
                    filterValue="inactive"
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

            await user.click(screen.getByRole('button', { name: 'Status • 1 selected' }));
            expect(screen.getByRole('menuitemcheckbox', { name: 'Inactive' })).toHaveAttribute('aria-checked', 'true');
            expect(screen.getByRole('menuitemcheckbox', { name: 'Active' })).toHaveAttribute('aria-checked', 'false');

            await user.click(screen.getByRole('menuitemcheckbox', { name: 'Active' }));
            expect(onFilterChange).toHaveBeenCalledWith('status', 'active');
        });

        it('deselects an already-checked option when activated again', async () => {
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

            await user.click(screen.getByRole('button', { name: 'Status • 1 selected' }));
            expect(screen.getByRole('menuitemcheckbox', { name: 'Active' })).toHaveAttribute(
                'aria-checked',
                'true'
            );

            // Activating an already-checked checkbox option deselects it.
            await user.click(screen.getByRole('menuitemcheckbox', { name: 'Active' }));
            expect(onFilterChange).toHaveBeenCalledWith('status', undefined);
            expect(screen.getByRole('button', { name: 'Status • 1 selected' })).toHaveAttribute(
                'aria-expanded',
                'false'
            );
        });

        it('matches restored string values against numeric options', async () => {
            const user = userEvent.setup();
            render(
                <DataTableFilterChip
                    columnId="status"
                    label="Status"
                    filterValue="1"
                    searchValue=""
                    filterType="select"
                    filterOptions={[
                        { value: 1, label: 'Active' },
                        { value: 2, label: 'Inactive' },
                    ]}
                    canSearch={false}
                    canFilter={true}
                    onFilterChange={vi.fn()}
                    onColumnSearchChange={vi.fn()}
                    onClearFilter={vi.fn()}
                />
            );

            await user.click(screen.getByRole('button', { name: 'Status • 1 selected' }));

            expect(screen.getByRole('menuitemcheckbox', { name: 'Active' })).toHaveAttribute(
                'aria-checked',
                'true'
            );
            expect(screen.getByRole('menuitemcheckbox', { name: 'Inactive' })).toHaveAttribute(
                'aria-checked',
                'false'
            );
        });

        it('matches array values when any member corresponds to the option', async () => {
            const user = userEvent.setup();
            renderSelectChip(['active', 'inactive']);

            await user.click(screen.getByRole('button', { name: 'Status • 2 selected' }));

            expect(screen.getByRole('menuitemcheckbox', { name: 'Active' })).toHaveAttribute(
                'aria-checked',
                'true'
            );
            expect(screen.getByRole('menuitemcheckbox', { name: 'Inactive' })).toHaveAttribute(
                'aria-checked',
                'true'
            );
            expect(screen.getByRole('menuitemcheckbox', { name: 'Archived' })).toHaveAttribute(
                'aria-checked',
                'false'
            );
        });

        it('preserves existing array members when selecting an additional option', async () => {
            const user = userEvent.setup();
            const onFilterChange = vi.fn();
            const { rerender } = render(
                <DataTableFilterChip
                    columnId="status"
                    label="Status"
                    filterValue={['active', 'inactive']}
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

            // Selecting an option closes the dropdown (existing behavior), so each
            // selection is followed by a re-render that applies the new filter value
            // before the menu is reopened to verify the resulting checked state.

            await user.click(screen.getByRole('button', { name: 'Status • 2 selected' }));

            // Select Archived while Active and Inactive remain selected.
            await user.click(screen.getByRole('menuitemcheckbox', { name: 'Archived' }));
            expect(onFilterChange).toHaveBeenCalledWith('status', [
                'active',
                'inactive',
                'archived',
            ]);

            rerender(
                <DataTableFilterChip
                    columnId="status"
                    label="Status"
                    filterValue={['active', 'inactive', 'archived']}
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

            await user.click(screen.getByRole('button', { name: 'Status • 3 selected' }));
            expect(screen.getByRole('menuitemcheckbox', { name: 'Active' })).toHaveAttribute(
                'aria-checked',
                'true'
            );
            expect(screen.getByRole('menuitemcheckbox', { name: 'Inactive' })).toHaveAttribute(
                'aria-checked',
                'true'
            );
            expect(screen.getByRole('menuitemcheckbox', { name: 'Archived' })).toHaveAttribute(
                'aria-checked',
                'true'
            );
        });
    });

    describe('boolean Yes/No filter options', () => {
        it('exposes Yes and No as mutually exclusive menuitemradio items', async () => {
            const user = userEvent.setup();
            renderBooleanChip(true);

            await user.click(screen.getByRole('button', { name: 'Published • 1 selected' }));

            expect(screen.getByRole('menuitemradio', { name: 'Yes' })).toHaveAttribute(
                'aria-checked',
                'true'
            );
            expect(screen.getByRole('menuitemradio', { name: 'No' })).toHaveAttribute(
                'aria-checked',
                'false'
            );
        });

        it('selecting one boolean option deselects the other', async () => {
            const user = userEvent.setup();
            const onFilterChange = vi.fn();
            const { rerender } = render(
                <DataTableFilterChip
                    columnId="published"
                    label="Published"
                    filterValue={undefined}
                    searchValue=""
                    filterType="boolean"
                    filterOptions={[]}
                    canSearch={false}
                    canFilter={true}
                    onFilterChange={onFilterChange}
                    onColumnSearchChange={vi.fn()}
                    onClearFilter={vi.fn()}
                />
            );

            // Selecting an option closes the dropdown (existing behavior), so each
            // selection is followed by a re-render that applies the new filter value
            // before the menu is reopened to verify the resulting checked state.

            await user.click(screen.getByRole('button', { name: 'Published' }));
            expect(screen.getByRole('menuitemradio', { name: 'Yes' })).toHaveAttribute('aria-checked', 'false');
            expect(screen.getByRole('menuitemradio', { name: 'No' })).toHaveAttribute('aria-checked', 'false');

            await user.click(screen.getByRole('menuitemradio', { name: 'Yes' }));
            expect(onFilterChange).toHaveBeenCalledWith('published', true);

            rerender(
                <DataTableFilterChip
                    columnId="published"
                    label="Published"
                    filterValue={true}
                    searchValue=""
                    filterType="boolean"
                    filterOptions={[]}
                    canSearch={false}
                    canFilter={true}
                    onFilterChange={onFilterChange}
                    onColumnSearchChange={vi.fn()}
                    onClearFilter={vi.fn()}
                />
            );

            await user.click(screen.getByRole('button', { name: 'Published • 1 selected' }));
            expect(screen.getByRole('menuitemradio', { name: 'Yes' })).toHaveAttribute('aria-checked', 'true');
            expect(screen.getByRole('menuitemradio', { name: 'No' })).toHaveAttribute('aria-checked', 'false');

            await user.click(screen.getByRole('menuitemradio', { name: 'No' }));
            expect(onFilterChange).toHaveBeenCalledWith('published', false);

            rerender(
                <DataTableFilterChip
                    columnId="published"
                    label="Published"
                    filterValue={false}
                    searchValue=""
                    filterType="boolean"
                    filterOptions={[]}
                    canSearch={false}
                    canFilter={true}
                    onFilterChange={onFilterChange}
                    onColumnSearchChange={vi.fn()}
                    onClearFilter={vi.fn()}
                />
            );

            await user.click(screen.getByRole('button', { name: 'Published • 1 selected' }));
            expect(screen.getByRole('menuitemradio', { name: 'No' })).toHaveAttribute('aria-checked', 'true');
            expect(screen.getByRole('menuitemradio', { name: 'Yes' })).toHaveAttribute('aria-checked', 'false');
        });

        it('does not render a nested interactive control inside either radio item', async () => {
            const user = userEvent.setup();
            renderBooleanChip(true);

            await user.click(screen.getByRole('button', { name: 'Published • 1 selected' }));

            expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
            expect(screen.getAllByRole('menuitemradio')).toHaveLength(2);
        });
    });
});
