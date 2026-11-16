'use client';

import type { ReactNode } from 'react';

interface DataTableEmptyProps {
  columns: number;
  /** Replaces the default empty state message. */
  children?: ReactNode;
}

export function DataTableEmpty({ columns, children }: DataTableEmptyProps) {
  return (
    <tr>
      <td colSpan={columns} className="py-12 text-center text-muted-foreground">
        {children ?? 'No results found'}
      </td>
    </tr>
  );
}
