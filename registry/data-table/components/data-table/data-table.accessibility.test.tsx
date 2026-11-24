'use client';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { usePage } from '@inertiajs/react';
import { axe } from 'vitest-axe';
import * as React from 'react';
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
        expect(screen.queryByRole('checkbox', { name: 'Active' })).not.toBeInTheDocument();
    });

    it('marks decorative sort arrow glyphs as hidden', () => {
        render(<DataTable data={createData()} />);

        const nameHeader = screen.getByRole('button', { name: /Sort by Name/ });
        const arrows = nameHeader.querySelectorAll('[aria-hidden="true"]');
        expect(arrows.length).toBeGreaterThan(0);
    });
});
