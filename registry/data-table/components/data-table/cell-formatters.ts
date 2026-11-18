'use client';

import type { ReactNode } from 'react';
import type { CellContext, RowData } from '@tanstack/react-table';
import type { DataTableFeatures } from './table-features';

/**
 * Default cell value formatter.
 * Handles booleans, null/undefined, objects, arrays, and other types.
 */
export function formatCellValue(value: unknown): ReactNode {
    if (value === null || value === undefined) {
        return '—';
    }

    if (typeof value === 'boolean') {
        return value ? 'Yes' : 'No';
    }

    if (typeof value === 'object') {
        try {
            const json = JSON.stringify(value);
            // Truncate long JSON strings
            return json.length > 100 ? json.slice(0, 100) + '…' : json;
        } catch {
            return Object.prototype.toString.call(value);
        }
    }

    // Primitives (string, number, bigint, symbol) are valid React nodes
    return value as ReactNode;
}

/**
 * Default cell renderer that uses formatCellValue.
 * Can be overridden by providing a custom cell formatter in the column definition.
 */
export function defaultCellFormatter<TData extends RowData>(
    info: CellContext<DataTableFeatures, TData, unknown>
): ReactNode {
    return formatCellValue(info.getValue());
}
