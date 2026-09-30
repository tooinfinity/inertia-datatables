'use client';

import { type ReactNode } from 'react';
import { Input } from '@ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@ui/select';

interface DataTableToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  perPage: number;
  onPerPageChange: (value: number) => void;
  perPageOptions: number[];
  children?: ReactNode;
}

export function DataTableToolbar({
  search,
  onSearchChange,
  perPage,
  onPerPageChange,
  perPageOptions,
  children,
}: DataTableToolbarProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div className="flex items-center gap-2">
        <Input
          placeholder="Search..."
          value={search}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onSearchChange(e.target.value)}
          className="w-64 max-w-[200px]"
          aria-label="Global search"
        />
        {children}
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor="per-page" className="text-sm text-muted-foreground">
          Show
        </label>
        <Select value={String(perPage)} onValueChange={(value: string) => onPerPageChange(Number(value))}>
          <SelectTrigger id="per-page" className="w-[100px]">
            <SelectValue placeholder="Per page" />
          </SelectTrigger>
          <SelectContent>
            {perPageOptions.map((option) => (
              <SelectItem key={String(option)} value={String(option)}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">per page</span>
      </div>
    </div>
  );
}