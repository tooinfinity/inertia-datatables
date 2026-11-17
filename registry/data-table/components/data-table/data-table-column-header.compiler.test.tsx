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

    it('cycles back to ascending (↑) after clicking three times (no tri-state)', () => {
        render(<DataTable data={createData()} />);

        const button = sortButton('Name');

        act(() => {
            fireEvent.click(button);
        });
        expect(button).toHaveTextContent('↑');

        act(() => {
            fireEvent.click(button);
        });
        expect(button).toHaveTextContent('↓');

        act(() => {
            fireEvent.click(button);
        });
        expect(button).toHaveTextContent('↑');
        expect(button).not.toHaveTextContent('↕');
        expect(button).not.toHaveTextContent('↓');
    });

    it('triggers an Inertia visit with the sort parameter on click', () => {
        render(<DataTable data={createData()} />);

        const button = sortButton('Name');

        act(() => {
            fireEvent.click(button);
        });

        expect(router.visit).toHaveBeenCalledWith(
            '/?sort=name',
            expect.objectContaining({ replace: true })
        );
    });
});
