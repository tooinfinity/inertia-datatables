'use client';

import type { ReactNode } from 'react';
import { TableRow, TableCell } from '@/components/ui/table';

interface DataTableEmptyProps {
    columns: number;
    /** Replaces the default empty state message. */
    children?: ReactNode;
}

export function DataTableEmpty({ columns, children }: DataTableEmptyProps) {
    return (
        <TableRow>
            <TableCell colSpan={Math.max(1, columns)} className="h-32 text-center text-muted-foreground">
                <div className="flex flex-col items-center justify-center gap-1.5 py-6">
                    {children ?? (
                        <>
                            <div className="rounded-full bg-muted p-2.5 text-muted-foreground mb-1">
                                <svg
                                    className="h-5 w-5"
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    strokeWidth="1.5"
                                    stroke="currentColor"
                                    aria-hidden="true"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                                    />
                                </svg>
                            </div>
                            <p className="text-sm font-medium text-foreground">No results found</p>
                            <p className="text-xs text-muted-foreground">
                                No records match your search or active filter criteria.
                            </p>
                        </>
                    )}
                </div>
            </TableCell>
        </TableRow>
    );
}
