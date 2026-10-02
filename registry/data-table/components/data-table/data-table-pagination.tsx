'use client';

import { Button } from '@ui/button';

interface DataTablePaginationProps {
    currentPage: number;
    perPage: number;
    onPageChange: (_page: number) => void;
    totalPages: number;
    totalItems: number;
}

export function DataTablePagination({
    currentPage,
    perPage,
    onPageChange,
    totalPages,
    totalItems,
}: DataTablePaginationProps) {
    const pageCount = totalPages;
    const from = (currentPage - 1) * perPage + 1;
    const to = Math.min(currentPage * perPage, totalItems);

    if (pageCount <= 1) {
        return (
            <div className="flex items-center justify-between border-t px-4 py-3 sm:px-6">
                <div className="text-sm text-muted-foreground">
                    Showing <span className="font-medium">{from}</span> to{' '}
                    <span className="font-medium">{to}</span> of{' '}
                    <span className="font-medium">{totalItems}</span> results
                </div>
            </div>
        );
    }

    const pages = getPageNumbers(currentPage, pageCount);

    return (
        <div className="flex items-center justify-between border-t px-4 py-3 sm:px-6">
            <div className="text-sm text-muted-foreground">
                Showing <span className="font-medium">{from}</span> to{' '}
                <span className="font-medium">{to}</span> of{' '}
                <span className="font-medium">{totalItems}</span> results
            </div>
            <div className="flex items-center gap-1">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onPageChange(1)}
                    disabled={currentPage === 1}
                    aria-label="First page"
                >
                    <span className="sr-only">First</span>
                    ««
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onPageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    aria-label="Previous page"
                >
                    <span className="sr-only">Previous</span>
                    «
                </Button>
                {pages.map((page, index) => (
                    <Button
                        key={index}
                        variant={page === currentPage ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => onPageChange(page)}
                        aria-label={`Page ${page}`}
                        aria-current={page === currentPage ? 'page' : undefined}
                    >
                        {page}
                    </Button>
                ))}
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onPageChange(currentPage + 1)}
                    disabled={currentPage === pageCount}
                    aria-label="Next page"
                >
                    <span className="sr-only">Next</span>
                    »
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onPageChange(pageCount)}
                    disabled={currentPage === pageCount}
                    aria-label="Last page"
                >
                    <span className="sr-only">Last</span>
                    »»
                </Button>
            </div>
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