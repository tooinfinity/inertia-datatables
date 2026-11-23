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

function sortButton(label: string) {
    return screen.getByRole('button', { name: new RegExp(`Sort by ${label}`) });
}

describe('DataTableColumnHeader sort indicator with React Compiler', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(usePage).mockReturnValue({ props: {} } as never);
        global.location.search = '';
    });

    it('renders an unsorted arrow (↕) on a sortable column header', () => {
        render(<DataTable data={createData()} />);

        const button = sortButton('Name');
        expect(button).toBeInTheDocument();
        expect(button).toHaveTextContent('↕');
        expect(button).not.toHaveTextContent('↑');
        expect(button).not.toHaveTextContent('↓');
    });

    it('updates the sort arrow to ascending (↑) after clicking the header', () => {
        render(<DataTable data={createData()} />);

        const button = sortButton('Name');

        act(() => {
            fireEvent.click(button);
        });

        expect(button).toHaveTextContent('↑');
        expect(button).not.toHaveTextContent('↕');
        expect(button).not.toHaveTextContent('↓');
    });

    it('updates the sort arrow to descending (↓) after clicking twice', () => {
        render(<DataTable data={createData()} />);

        const button = sortButton('Name');

        act(() => {
            fireEvent.click(button);
        });
        act(() => {
            fireEvent.click(button);
        });

        expect(button).toHaveTextContent('↓');
        expect(button).not.toHaveTextContent('↕');
        expect(button).not.toHaveTextContent('↑');
    });

    it('cycles through unsorted → ascending → descending → unsorted (tri-state)', () => {
        render(<DataTable data={createData()} />);

        const button = sortButton('Name');

        expect(button).toHaveTextContent('↕');
        expect(button).toHaveAccessibleName(
            'Sort by Name, currently unsorted. Click to sort ascending.'
        );

        act(() => {
            fireEvent.click(button);
        });
        expect(button).toHaveTextContent('↑');
        expect(button).toHaveAccessibleName(
            'Sort by Name, currently sorted ascending. Click to sort descending.'
        );

        act(() => {
            fireEvent.click(button);
        });
        expect(button).toHaveTextContent('↓');
        expect(button).toHaveAccessibleName(
            'Sort by Name, currently sorted descending. Click to clear sorting.'
        );

        act(() => {
            fireEvent.click(button);
        });
        expect(button).toHaveTextContent('↕');
        expect(button).toHaveAccessibleName(
            'Sort by Name, currently unsorted. Click to sort ascending.'
        );
    });

    it('keeps cycling through the three states on repeated clicks', () => {
        render(<DataTable data={createData()} />);

        const button = sortButton('Name');

        act(() => fireEvent.click(button));
        expect(button).toHaveTextContent('↑');
        act(() => fireEvent.click(button));
        expect(button).toHaveTextContent('↓');
        act(() => fireEvent.click(button));
        expect(button).toHaveTextContent('↕');
        act(() => fireEvent.click(button));
        expect(button).toHaveTextContent('↑');
        act(() => fireEvent.click(button));
        expect(button).toHaveTextContent('↓');
        act(() => fireEvent.click(button));
        expect(button).toHaveTextContent('↕');
    });

    it('removes the sort parameter from the Inertia visit when sorting is cleared', () => {
        render(<DataTable data={createData()} />);

        const button = sortButton('Name');

        act(() => {
            fireEvent.click(button);
        });
        expect(router.visit).toHaveBeenCalledWith('/?sort=name', expect.objectContaining({ replace: true }));

        // Second click → descending.
        act(() => {
            fireEvent.click(button);
        });
        expect(router.visit).toHaveBeenCalledWith('/?sort=-name', expect.objectContaining({ replace: true }));

        // Third click → clearing sorting removes the parameter entirely.
        act(() => {
            fireEvent.click(button);
        });
        const lastCall = (router.visit as ReturnType<typeof vi.fn>).mock.calls.at(-1)!;
        const lastUrl = lastCall[0] as string;
        expect(lastUrl).not.toContain('sort=');
    });

    it('starts descending on a sortDescFirst column', () => {
        render(
            <DataTable
                data={createData()}
                columns={[{ id: 'name', sortDescFirst: true }]}
            />
        );

        const button = sortButton('Name');

        expect(button).toHaveAccessibleName(
            'Sort by Name, currently unsorted. Click to sort descending.'
        );

        act(() => {
            fireEvent.click(button);
        });
        expect(button).toHaveTextContent('↓');
        expect(button).toHaveAccessibleName(
            'Sort by Name, currently sorted descending. Click to sort ascending.'
        );

        act(() => {
            fireEvent.click(button);
        });
        expect(button).toHaveTextContent('↑');
        expect(button).toHaveAccessibleName(
            'Sort by Name, currently sorted ascending. Click to clear sorting.'
        );

        act(() => {
            fireEvent.click(button);
        });
        expect(button).toHaveTextContent('↕');
        expect(button).toHaveAccessibleName(
            'Sort by Name, currently unsorted. Click to sort descending.'
        );
    });
});
