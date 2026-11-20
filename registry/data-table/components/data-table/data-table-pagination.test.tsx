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
