'use client';

import { type Column } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface DataTableColumnHeaderProps {
  header: Column<Record<string, unknown>, unknown>;
  column: Column<Record<string, unknown>, unknown>;
  onSortChange: (updater: unknown) => void;
  onColumnSearchChange: (column: string, value: string) => void;
  onFilterChange: (column: string, value: unknown) => void;
}

export function DataTableColumnHeader({
  header,
  column,
  onSortChange,
  onColumnSearchChange,
  onFilterChange,
}: DataTableColumnHeaderProps) {
  const canSort = column.columnDef.enableSorting;
  const canFilter = column.columnDef.enableFiltering;

  return (
    <th className="relative px-4 py-3 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0">
      {header.isPlaceholder ? null : (
        <div className="flex items-center gap-2">
          {canSort && (
            <button
              onClick={() => column.toggleSorting(header.getIsSorted())}
              className="flex items-center gap-1 hover:text-foreground transition-colors"
              aria-label={`Sort by ${column.columnDef.header}`}
            >
              {flexRender(column.columnDef.header!, header.getContext())}
              {header.getIsSorted() === 'asc' ? (
                <span>↑</span>
              ) : header.getIsSorted() === 'desc' ? (
                <span>↓</span>
              ) : (
                <span className="text-muted-foreground">↕</span>
              )}
            </button>
          )}
          {!canSort && <span>{flexRender(column.columnDef.header!, header.getContext())}</span>}
        </div>
      )}
      <div className="absolute right-0 top-full mt-1 w-56 p-2 rounded-md border bg-popover shadow-lg hidden group-focus-within:block group-hover:block z-10">
        {canFilter && (
          <div className="space-y-2">
            <label className="block text-xs font-medium text-muted-foreground">
              Column search
            </label>
            <Input
              placeholder={`Search ${column.columnDef.header}...`}
              onChange={(e) => onColumnSearchChange(column.id, e.target.value)}
              value={((column.getFilterValue() as string) || '')}
            />
          </div>
        )}
        {canFilter && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center justify-between px-2 py-1 text-sm text-muted-foreground hover:text-foreground rounded">
                Filter
                <svg className="ml-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-48">
              <DropdownMenuItem
                onClick={() => onFilterChange(column.id, '')}
                className="text-sm"
              >
                Clear filter
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </th>
  );
}