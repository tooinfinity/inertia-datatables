'use client';

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DataTableToolbar } from './data-table-toolbar';

describe('DataTableToolbar narrow-viewport behavior', () => {
    it('keeps the global search input visible on narrow viewports', () => {
        render(
            <DataTableToolbar
                search=""
                onSearchChange={vi.fn()}
                isFiltered={false}
            />
        );

        expect(screen.getByLabelText('Global search')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument();
    });

    it('wraps search and custom toolbar content predictably instead of forcing horizontal overflow', () => {
        render(
            <DataTableToolbar
                search=""
                onSearchChange={vi.fn()}
                isFiltered={false}
            />
        );

        const search = screen.getByLabelText('Global search');

        const container = search.closest('[class*="flex-wrap"]');
        expect(container).toBeInTheDocument();
        expect(container!.className).toContain('flex-wrap');
    });
});
