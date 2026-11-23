'use client';

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DataTablePagination } from './data-table-pagination';

describe('DataTablePagination narrow-viewport behavior', () => {
    it('stacks the summary above the controls on narrow viewports and rows them side by side on wider ones', () => {
        render(
            <DataTablePagination
                currentPage={1}
                perPage={25}
                onPageChange={vi.fn()}
                totalPages={10}
                totalItems={250}
            />
        );

        const summary = screen.getByText(/Showing/);

        expect(summary.textContent).toBe('Showing 1 to 25 of 250 results');

        const outer = summary.closest('[class*="flex-col"]');
        expect(outer).toBeInTheDocument();
        expect(outer!.className).toContain('flex-col');
        expect(outer!.className).toContain('sm:flex-row');
    });

    it('keeps the pagination summary visible and reachable', () => {
        render(
            <DataTablePagination
                currentPage={3}
                perPage={25}
                onPageChange={vi.fn()}
                totalPages={10}
                totalItems={250}
            />
        );

        const summary = screen.getByText(/Showing/);
        expect(summary.textContent).toBe('Showing 51 to 75 of 250 results');
        expect(screen.getByText(/Page 3 of 10/)).toBeInTheDocument();
    });

    it('renders all page navigation controls without horizontal overflow', () => {
        render(
            <DataTablePagination
                currentPage={1}
                perPage={25}
                onPageChange={vi.fn()}
                totalPages={10}
                totalItems={250}
            />
        );

        expect(screen.getByRole('button', { name: 'First page' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Previous page' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Page 1' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Next page' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Last page' })).toBeInTheDocument();
    });

    it('lets the control buttons wrap predictably instead of forcing page overflow', () => {
        render(
            <DataTablePagination
                currentPage={1}
                perPage={25}
                onPageChange={vi.fn()}
                totalPages={10}
                totalItems={250}
            />
        );

        const pageInfo = screen.getByText(/Page 1 of 10/);
        const controls = pageInfo.closest('[class*="flex-wrap"]');

        expect(controls).toBeInTheDocument();
        expect(controls!.className).toContain('flex-wrap');
    });
});

describe('DataTablePagination summary', () => {
    it('shows a valid range on the first page', () => {
        render(
            <DataTablePagination
                currentPage={1}
                perPage={25}
                onPageChange={vi.fn()}
                totalPages={2}
                totalItems={50}
            />
        );

        expect(screen.getByText(/Showing/).textContent).toBe('Showing 1 to 25 of 50 results');
    });

    it('shows a valid range on the last page', () => {
        render(
            <DataTablePagination
                currentPage={2}
                perPage={25}
                onPageChange={vi.fn()}
                totalPages={2}
                totalItems={50}
            />
        );

        expect(screen.getByText(/Showing/).textContent).toBe('Showing 26 to 50 of 50 results');
    });

    it('never shows an invalid from > to range when current_page exceeds last_page', () => {
        render(
            <DataTablePagination
                currentPage={3}
                perPage={25}
                onPageChange={vi.fn()}
                totalPages={2}
                totalItems={50}
            />
        );

        const summary = screen.getByText(/Showing/).textContent;
        expect(summary).not.toMatch(/51 to/);
        expect(summary).toBe('Showing 50 to 50 of 50 results');
    });

    it('shows the clamped page indicator and marks the last page active when current_page exceeds last_page', () => {
        render(
            <DataTablePagination
                currentPage={3}
                perPage={25}
                onPageChange={vi.fn()}
                totalPages={2}
                totalItems={50}
            />
        );

        expect(screen.getByText(/Page 2 of 2/)).toBeInTheDocument();

        const lastPageButton = screen.getByRole('button', { name: 'Page 2' });
        expect(lastPageButton).toHaveAttribute('aria-current', 'page');
    });

    it('shows the zero-results wording when there are no records', () => {
        render(
            <DataTablePagination
                currentPage={1}
                perPage={25}
                onPageChange={vi.fn()}
                totalPages={1}
                totalItems={0}
            />
        );

        expect(screen.getByText(/Showing/).textContent).toBe('Showing 0 to 0 of 0 results');
    });

    it('shows the zero-results wording on an out-of-range page with no records', () => {
        render(
            <DataTablePagination
                currentPage={3}
                perPage={25}
                onPageChange={vi.fn()}
                totalPages={2}
                totalItems={0}
            />
        );

        expect(screen.getByText(/Showing/).textContent).toBe('Showing 0 to 0 of 0 results');
    });
});
