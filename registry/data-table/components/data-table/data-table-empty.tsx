'use client';

interface DataTableEmptyProps {
  columns: number;
}

export function DataTableEmpty({ columns }: DataTableEmptyProps) {
  return (
    <tr>
      <td colSpan={columns} className="py-12 text-center text-muted-foreground">
        No results found
      </td>
    </tr>
  );
}