'use client';

import { type ReactNode } from 'react';
import { type Table } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface DataTableToolbarProps {
  table: Table<Record<string, unknown>>;
  search: string;
  onSearchChange: (value: string) => void;
  perPage: number;
  onPerPageChange: (value: number) => void;
  children?: ReactNode;
}

export function DataTableToolbar({
  table,
  search,
  onSearchChange,
  perPage,
  onPerPageChange,
  children,
}: DataTableToolbarProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div className="flex items-center gap-2">
        <Input
          placeholder="Search..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-64 max-w-[200px]"
          aria-label="Global search"
        />
        {children}
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor="per-page" className="text-sm text-muted-foreground">
          Show
        </label>
        <Select value={String(perPage)} onValueChange={(value) => onPerPageChange(Number(value))}>
          <SelectTrigger id="per-page" className="w-[100px]">
            <SelectValue placeholder="Per page" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="10">10</SelectItem>
            <SelectItem value="25">25</SelectItem>
            <SelectItem value="50">50</SelectItem>
            <SelectItem value="100">100</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">per page</span>
      </div>
    </div>
  );
}