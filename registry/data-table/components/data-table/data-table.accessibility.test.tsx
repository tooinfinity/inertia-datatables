'use client';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { usePage } from '@inertiajs/react';
import { axe } from 'vitest-axe';
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

    it('exposes aria-sort on sortable column headers', () => {
        render(<DataTable data={createData()} />);

        const columnHeaders = screen.getAllByRole('columnheader');

        // "Name" and "Role" are sortable; "ID" and "Status" are not.
        const sortable = columnHeaders.filter((header) => header.hasAttribute('aria-sort'));
        const unsortable = columnHeaders.filter((header) => !header.hasAttribute('aria-sort'));
        expect(sortable).toHaveLength(2);
        expect(unsortable).toHaveLength(2);
        expect(sortable.every((header) => header.getAttribute('aria-sort') === 'none')).toBe(true);
    });

    it('updates aria-sort when the sort state changes', () => {
        render(<DataTable data={createData()} />);

        const nameButton = screen.getByRole('button', { name: /Sort by Name/ });
        const nameHeader = nameButton.closest('th')!;

        expect(nameHeader).toHaveAttribute('aria-sort', 'none');
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

        // Third click clears sorting and returns to unsorted.
        act(() => {
            fireEvent.click(nameButton);
        });
        expect(nameHeader).toHaveAttribute('aria-sort', 'none');
        expect(nameButton).toHaveAccessibleName(
            'Sort by Name, currently unsorted. Click to sort ascending.'
        );
    });

    it('associates the column search label with its input via htmlFor/id', () => {
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
        act(() => {
            fireEvent.click(chip);
        });

        // getByLabelText returns the associated form control (the input);
        // the <label> element is found by its visible text.
        const label = screen.getByText('Search Name');
        const input = screen.getByLabelText('Search Name');
        expect(label).toBeInTheDocument();
        expect(input).toBeInTheDocument();
        expect(label).toHaveAttribute('for', input.getAttribute('id'));
        expect(label.tagName).toBe('LABEL');
    });

    it('gives the filter value input an accessible name', () => {
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
        act(() => {
            fireEvent.click(chip);
        });

        expect(screen.getByLabelText('Filter Name value')).toBeInTheDocument();
    });

    it('exposes aria-expanded on the filter trigger and toggles it on activation (keyboard Enter/Space or click)', () => {
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

        act(() => {
            fireEvent.click(chip);
        });

        expect(chip).toHaveAttribute('aria-expanded', 'true');

        act(() => {
            fireEvent.click(chip);
        });

        expect(chip).toHaveAttribute('aria-expanded', 'false');
    });

    it('marks decorative sort arrow glyphs as hidden', () => {
        render(<DataTable data={createData()} />);

        const nameHeader = screen.getByRole('button', { name: /Sort by Name/ });
        const arrows = nameHeader.querySelectorAll('[aria-hidden="true"]');
        expect(arrows.length).toBeGreaterThan(0);
    });
});
