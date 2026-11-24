'use client';

import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import type { DataTableMeta } from './types';

export interface DataTablePaginationProps {
    currentPage: number;
    perPage: number;
    onPageChange: (_page: number) => void;
    totalPages: number;
    totalItems: number;
    /** Range from the accepted response, when separate from the navigation state. */
    resultRange?: Pick<DataTableMeta, 'from' | 'to'>;
    /** Optional callback when page size changes. */
    onPerPageChange?: (_perPage: number) => void;
    /** Available page size options. */
    perPageOptions?: number[];
    /** Number of selected rows. */
    selectedCount?: number;
}

export function DataTablePagination({
    currentPage,
    perPage,
    onPageChange,
    totalPages,
    totalItems,
    resultRange,
    onPerPageChange,
    perPageOptions,
    selectedCount,
}: DataTablePaginationProps) {
    const pageCount = Math.max(1, totalPages);
    // Keep the controls and the standalone range fallback valid while an
    // out-of-range page recovers.
    const displayPage = Math.min(Math.max(1, currentPage), pageCount);
    const { from, to } = resultRange ?? {
        from: totalItems === 0 ? 0 : Math.min(Math.max(1, (displayPage - 1) * perPage + 1), totalItems),
        to: totalItems === 0 ? 0 : Math.min(displayPage * perPage, totalItems),
    };
    const pages = getPageNumbers(displayPage, pageCount);
    const effectivePerPageOptions = perPageOptions
        ? perPageOptions.includes(perPage)
            ? perPageOptions
            : [...perPageOptions, perPage].sort((a, b) => a - b)
        : [];

    return (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2 py-4">
            <div className="text-sm text-muted-foreground order-2 sm:order-1" role="status" aria-live="polite">
                {typeof selectedCount === 'number' && selectedCount > 0 ? (
                    <span>
                        <span className="font-medium text-foreground">{selectedCount}</span> of{' '}
                        <span className="font-medium text-foreground">{totalItems}</span> row(s) selected.
                    </span>
                ) : (
                    <span>
                        Showing <span className="font-medium text-foreground">{from ?? 0}</span> to{' '}
                        <span className="font-medium text-foreground">{to ?? 0}</span> of{' '}
                        <span className="font-medium text-foreground">{totalItems}</span> results
                    </span>
                )}
            </div>
            <nav aria-label="Pagination" className="order-1 sm:order-2">
                <div className="flex flex-wrap items-center gap-3 sm:gap-6">
                    {onPerPageChange && effectivePerPageOptions.length > 0 && (
                        <div className="flex items-center gap-2">
                            <label htmlFor="per-page" className="text-sm font-medium text-muted-foreground whitespace-nowrap">
                                Rows per page
                            </label>
                            <Select
                                value={String(perPage)}
                                onValueChange={(value: string) => onPerPageChange(Number(value))}
                            >
                                <SelectTrigger id="per-page" aria-label="Rows per page" className="h-8 w-[72px]">
                                    <SelectValue placeholder={String(perPage)} />
                                </SelectTrigger>
                                <SelectContent side="top">
                                    {effectivePerPageOptions.map((option) => (
                                        <SelectItem key={String(option)} value={String(option)}>
                                            {option}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    <div className="flex items-center justify-center text-sm font-medium whitespace-nowrap">
                        Page {displayPage} of {pageCount}
                    </div>
                    <div className="flex items-center gap-1">
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => onPageChange(1)}
                            disabled={displayPage <= 1}
                            aria-label="First page"
                        >
                            <span className="sr-only">First</span>
                            ««
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => onPageChange(displayPage - 1)}
                            disabled={displayPage <= 1}
                            aria-label="Previous page"
                        >
                            <span className="sr-only">Previous</span>
                            «
                        </Button>
                        {pageCount > 1 &&
                            pages.map((page, index) => (
                                <Button
                                    key={index}
                                    variant={page === displayPage ? 'default' : 'outline'}
                                    size="sm"
                                    className="h-8 min-w-[2rem] px-2 text-xs"
                                    onClick={() => onPageChange(page)}
                                    aria-label={`Page ${page}`}
                                    aria-current={page === displayPage ? 'page' : undefined}
                                >
                                    {page}
                                </Button>
                            ))}
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => onPageChange(displayPage + 1)}
                            disabled={displayPage >= pageCount}
                            aria-label="Next page"
                        >
                            <span className="sr-only">Next</span>
                            »
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => onPageChange(pageCount)}
                            disabled={displayPage >= pageCount}
                            aria-label="Last page"
                        >
                            <span className="sr-only">Last</span>
                            »»
                        </Button>
                    </div>
                </div>
            </nav>
        </div>
    );
}

function getPageNumbers(currentPage: number, totalPages: number): number[] {
    const pages: number[] = [];
    const maxVisible = 5;
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);

    if (end - start + 1 < maxVisible) {
        start = Math.max(1, end - maxVisible + 1);
        end = Math.min(totalPages, start + maxVisible - 1);
    }

    for (let i = start; i <= end; i++) {
        pages.push(i);
    }

    return pages;
}
