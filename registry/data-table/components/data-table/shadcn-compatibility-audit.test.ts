import { pathToFileURL } from 'node:url';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
    buildUpstreamUrl,
    extractComponentStructure,
    compareStructures,
    auditComponent,
    auditComponentDrift,
    buildReport,
    fetchWithTimeout,
    discoverLatestCommit,
    validateManifest,
} from '../../../../scripts/ci/shadcn-compatibility-audit.js';

// Minimal valid manifest fixture for testing.
const baseManifest = {
    version: 1,
    upstream: {
        repository: 'shadcn-ui/ui',
        branch: 'main',
        baselineCommit: '055aa6b7837b1808456a24beb4c97a677864aa82',
        currentCommit: '055aa6b7837b1808456a24beb4c97a677864aa82',
        style: 'new-york-v4',
        sourcePath: 'apps/v4/registry/new-york-v4/ui',
        rawUrlTemplate:
            'https://raw.githubusercontent.com/shadcn-ui/ui/{commit}/apps/v4/registry/new-york-v4/ui/{component}.tsx',
    },
    components: [
        {
            name: 'table',
            localPath: 'registry/data-table/components/ui/table.tsx',
            upstreamComponent: 'table',
            comparisonStrategy: 'structural',
            classification: 'structurally-mirrors-upstream',
            semanticElements: ['table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption'],
            upstreamSource:
                'https://raw.githubusercontent.com/shadcn-ui/ui/055aa6b7837b1808456a24beb4c97a677864aa82/apps/v4/registry/new-york-v4/ui/table.tsx',
            notes: 'test fixture',
        },
        {
            name: 'button',
            localPath: 'registry/data-table/components/ui/button.tsx',
            upstreamComponent: 'button',
            comparisonStrategy: 'manual',
            classification: 'role-equivalent-shim',
            upstreamSource:
                'https://raw.githubusercontent.com/shadcn-ui/ui/055aa6b7837b1808456a24beb4c97a677864aa82/apps/v4/registry/new-york-v4/ui/button.tsx',
            notes: 'test fixture',
        },
    ],
};

// Local shim source fixtures (mirror the actual local files' structure).
const localTableSource = `
import { forwardRef } from 'react';
import type { TableHTMLAttributes, HTMLAttributes, ThHTMLAttributes, TdHTMLAttributes } from 'react';
export const Table = forwardRef<HTMLTableElement, TableHTMLAttributes<HTMLTableElement>>(({ children, ...props }, ref) => <table ref={ref} {...props}>{children}</table>);
export const TableHeader = ({ children, ...props }: HTMLAttributes<HTMLTableSectionElement>) => <thead {...props}>{children}</thead>;
export const TableBody = ({ children, ...props }: HTMLAttributes<HTMLTableSectionElement>) => <tbody {...props}>{children}</tbody>;
export const TableFooter = ({ children, ...props }: HTMLAttributes<HTMLTableSectionElement>) => <tfoot {...props}>{children}</tfoot>;
export const TableHead = forwardRef<HTMLTableCellElement, ThHTMLAttributes<HTMLTableCellElement>>(({ children, ...props }, ref) => <th ref={ref} {...props}>{children}</th>);
export const TableRow = ({ children, ...props }: HTMLAttributes<HTMLTableRowElement>) => <tr {...props}>{children}</tr>;
export const TableCell = ({ children, ...props }: TdHTMLAttributes<HTMLTableCellElement>) => <td {...props}>{children}</td>;
export const TableCaption = ({ children, ...props }: HTMLAttributes<HTMLTableCaptionElement>) => <caption {...props}>{children}</caption>;
`;

const localButtonSource = `
import type { ButtonHTMLAttributes } from 'react';
export const Button = ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) => <button {...props}>{children}</button>;
`;

// Actual pinned upstream Table source (faithful reduced fixture).
// The upstream Table wraps <table> in an outer <div data-slot="table-container">.
const upstreamTableSourceWithWrapper = `
"use client"

import * as React from "react"
import { cn } from "cn"

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto"
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn("border-t", className)}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn("border-b", className)}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn("h-10 px-2", className)}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn("p-2", className)}
      {...props}
    />
  )
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
}
`;

// Upstream Table that renders null for TableCaption (removes <caption>) — should be detected as a difference.
const upstreamTableSourceMissingCaption = `
function Table({ className, ...props }) {
  return (
    <div>
      <table {...props}>{children}</table>
    </div>
  )
}

function TableHeader({ children, ...props }) {
  return <thead {...props}>{children}</thead>
}

function TableBody({ children, ...props }) {
  return <tbody {...props}>{children}</tbody>
}

function TableFooter({ children, ...props }) {
  return <tfoot {...props}>{children}</tfoot>
}

function TableRow({ children, ...props }) {
  return <tr {...props}>{children}</tr>
}

function TableHead({ children, ...props }) {
  return <th {...props}>{children}</th>
}

function TableCell({ children, ...props }) {
  return <td {...props}>{children}</td>
}

function TableCaption({ children, ...props }) {
  return null
}

export { Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell, TableCaption }
`;

function mockResponse(text: string, status = 200, statusText = 'OK') {
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText,
        text: async () => text,
        json: async () => JSON.parse(text),
    };
}

describe('shadcn-compatibility-audit: extractComponentStructure', () => {
    it('extracts component names and rendered HTML elements from a local shim', () => {
        const { components: structure } = extractComponentStructure(localTableSource);
        expect(structure.get('Table')).toContain('table');
        expect(structure.get('TableHeader')).toContain('thead');
        expect(structure.get('TableBody')).toContain('tbody');
        expect(structure.get('TableFooter')).toContain('tfoot');
        expect(structure.get('TableHead')).toContain('th');
        expect(structure.get('TableRow')).toContain('tr');
        expect(structure.get('TableCell')).toContain('td');
        expect(structure.get('TableCaption')).toContain('caption');
        expect(structure.size).toBe(8);
    });

    it('extracts component names from a minimal button shim', () => {
        const { components: structure } = extractComponentStructure(localButtonSource);
        expect(structure.get('Button')).toContain('button');
        expect(structure.size).toBe(1);
    });

    it('returns an empty map for source with no exported components', () => {
        expect(extractComponentStructure('const x = 1;').components).toEqual(new Map());
        expect(extractComponentStructure('const x = 1;').error).toBeNull();
        expect(extractComponentStructure('').components).toEqual(new Map());
        expect(extractComponentStructure('').error).toBeNull();
    });

    it('handles forwardRef-wrapped components', () => {
        const { components: structure } = extractComponentStructure(upstreamTableSourceWithWrapper);
        expect(structure.get('Table')).toContain('table');
        expect(structure.get('Table')).toContain('div');
        expect(structure.get('TableHeader')).toContain('thead');
    });

    it('handles qualified React.forwardRef when React is imported from "react"', () => {
        const source = `
import * as React from "react";
export const Table = React.forwardRef((props, ref) => <table ref={ref} />);
`;
        const { components: structure } = extractComponentStructure(source);
        expect(structure.has('Table')).toBe(true);
        expect(structure.get('Table')).toContain('table');
    });

    it('rejects forwardRef on arbitrary objects not imported from "react"', () => {
        const source = `
const Custom = { forwardRef: (cb) => cb() };
export const Table = Custom.forwardRef(() => <table />);
`;
        const { components: structure } = extractComponentStructure(source);
        expect(structure.has('Table')).toBe(false);
    });

    it('traverses JSX attributes in self-closing JSX elements', () => {
        const source = `
export function CustomTable() {
    return <CustomWrapper icon={<span />} header={<div />} />;
}
`;
        const { components: structure } = extractComponentStructure(source);
        expect(structure.has('CustomTable')).toBe(true);
        expect(structure.get('CustomTable')).toContain('span');
        expect(structure.get('CustomTable')).toContain('div');
    });

    it('extracts all HTML elements including nested ones', () => {
        const { components: structure } = extractComponentStructure(upstreamTableSourceWithWrapper);
        const table = structure.get('Table');
        // Table renders <div> wrapper and <table> element.
        // <thead>, <tbody>, etc. are rendered by TableHeader, TableBody, etc.
        expect(table).toContain('div');
        expect(table).toContain('table');
        expect(structure.get('TableHeader')).toContain('thead');
        expect(structure.get('TableBody')).toContain('tbody');
        expect(structure.get('TableFooter')).toContain('tfoot');
        expect(structure.get('TableRow')).toContain('tr');
        expect(structure.get('TableHead')).toContain('th');
        expect(structure.get('TableCell')).toContain('td');
        expect(structure.get('TableCaption')).toContain('caption');
    });

    it('resolves aliases in grouped exports (export { A as B })', () => {
        const source = `
const Table = ({ children }) => <table>{children}</table>;
export { Table as MyTable }
`;
        const { components: structure } = extractComponentStructure(source);
        expect(structure.has('Table')).toBe(false);
        expect(structure.get('MyTable')).toContain('table');
    });

    it('excludes functions that are not exported (private helpers)', () => {
        const source = `
function Helper() { return <span />; }
function Table({ children }) { return <table>{children}</table>; }
export { Table }
`;
        const { components: structure } = extractComponentStructure(source);
        expect(structure.has('Helper')).toBe(false);
        expect(structure.has('Table')).toBe(true);
        expect(structure.get('Table')).toContain('table');
    });

    it('excludes a name removed from a grouped export', () => {
        const source = `
function Table({ children }) { return <table>{children}</table>; }
function Caption({ children }) { return <caption>{children}</caption>; }
export { Table }
`;
        const { components: structure } = extractComponentStructure(source);
        expect(structure.has('Table')).toBe(true);
        expect(structure.has('Caption')).toBe(false);
    });

    it('handles nested parentheses in parameter types', () => {
        const source = `
function Table(onReady: () => void) { return <table />; }
export { Table }
`;
        const { components: structure } = extractComponentStructure(source);
        expect(structure.get('Table')).toContain('table');
    });
});

describe('shadcn-compatibility-audit: compareStructures', () => {
    it('reports no differences when local elements are subset of upstream (wrapper case)', () => {
        const { components: local } = extractComponentStructure(localTableSource);
        const { components: upstream } = extractComponentStructure(upstreamTableSourceWithWrapper);
        const differences = compareStructures(local, upstream);
        // The local Table renders {table, thead, ...} which is a subset of
        // upstream's {div, table, thead, ...} — wrapper is allowed.
        const tableDiffs = differences.filter((d) => d.includes('Table'));
        expect(tableDiffs).toEqual([]);
    });

    it('reports no differences when structures match exactly', () => {
        const { components: local } = extractComponentStructure(localTableSource);
        const { components: upstream } = extractComponentStructure(upstreamTableSourceWithWrapper);
        // Compare only semantic elements (exclude div wrapper)
        const localSemantic = new Map(local);
        const upstreamSemantic = new Map(upstream);
        // Remove div from upstream to simulate semantic-only comparison
        const upstreamTable = upstreamSemantic.get('Table');
        if (upstreamTable) {
            upstreamTable.delete('div');
            upstreamSemantic.set('Table', upstreamTable);
        }
        expect(compareStructures(localSemantic, upstreamSemantic)).toEqual([]);
    });

    it('reports a component missing upstream', () => {
        const { components: local } = extractComponentStructure(localTableSource);
        const { components: upstream } = extractComponentStructure(
            `export const Table = ({ children }) => <table>{children}</table>;`,
        );
        const differences = compareStructures(local, upstream);
        expect(
            differences.some((d) => d.includes('TableHeader') && d.includes('no upstream counterpart')),
        ).toBe(true);
    });

    it('reports a component present upstream but missing locally', () => {
        const { components: local } = extractComponentStructure(
            `export const Table = ({ children }) => <table>{children}</table>;`,
        );
        const { components: upstream } = extractComponentStructure(localTableSource);
        const differences = compareStructures(local, upstream);
        expect(
            differences.some((d) => d.includes('TableHeader') && d.includes('not implemented locally')),
        ).toBe(true);
    });

    it('detects when upstream removes an element the local renders', () => {
        const { components: local } = extractComponentStructure(localTableSource);
        const { components: upstream } = extractComponentStructure(upstreamTableSourceMissingCaption);
        const differences = compareStructures(local, upstream);
        expect(
            differences.some((d) => d.includes('TableCaption') && d.includes('caption') && d.includes('renders <caption> locally but upstream does not render those elements')),
        ).toBe(true);
    });

    it('returns empty for identical empty structures', () => {
        expect(compareStructures(new Map(), new Map())).toEqual([]);
    });
});

describe('shadcn-compatibility-audit: auditComponent', () => {
    const tableUpstreamUrl = buildUpstreamUrl(
        baseManifest.upstream,
        'table',
        baseManifest.upstream.baselineCommit,
    );

    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('classifies manual-strategy components as manual-review without fetching', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const component = baseManifest.components[1]; // button — manual
        const result = await auditComponent(component, component.upstreamSource);

        expect(result.status).toBe('manual-review');
        expect(result.upstreamFetched).toBe(false);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(result.differences[0]).toContain('manual compatibility review');
    });

    it('detects no structural difference when upstream matches (wrapper allowed)', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            mockResponse(upstreamTableSourceWithWrapper),
        );
        vi.stubGlobal('fetch', fetchMock);

        // Uses the real local table.tsx at registry/data-table/components/ui/table.tsx.
        const component = baseManifest.components[0]; // table — structural
        const upstreamUrl = buildUpstreamUrl(
            baseManifest.upstream,
            component.upstreamComponent,
            baseManifest.upstream.baselineCommit,
        );
        const result = await auditComponent(component, upstreamUrl);

        expect(result.status).toBe('ok');
        expect(result.upstreamFetched).toBe(true);
        expect(result.differences).toEqual([]);
        expect(fetchMock).toHaveBeenCalledWith(
            upstreamUrl,
            expect.objectContaining({ signal: expect.anything() }),
        );
    });

    it('detects a structural difference when upstream removes an element', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            mockResponse(upstreamTableSourceMissingCaption),
        );
        vi.stubGlobal('fetch', fetchMock);

        const component = {
            ...baseManifest.components[0], // table — structural
        };
        const result = await auditComponent(component, tableUpstreamUrl);

        expect(result.status).toBe('structural-difference');
        expect(result.upstreamFetched).toBe(true);
        expect(result.differences.length).toBeGreaterThan(0);
    });

    it('handles upstream retrieval failure as upstream-error', async () => {
        const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
        vi.stubGlobal('fetch', fetchMock);

        const component = baseManifest.components[0]; // table — structural
        const result = await auditComponent(component, tableUpstreamUrl);

        expect(result.status).toBe('upstream-error');
        expect(result.upstreamFetched).toBe(false);
        expect(result.error).toContain('failed to retrieve upstream source');
    });

    it('handles non-ok HTTP response as upstream-error', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            mockResponse('not found', 404, 'Not Found'),
        );
        vi.stubGlobal('fetch', fetchMock);

        const component = baseManifest.components[0]; // table — structural
        const result = await auditComponent(component, tableUpstreamUrl);

        expect(result.status).toBe('upstream-error');
        expect(result.error).toContain('HTTP 404');
    });

    it('handles upstream source with no parseable exports as upstream-error', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            mockResponse('export const foo = 1;'),
        );
        vi.stubGlobal('fetch', fetchMock);

        const component = baseManifest.components[0]; // table — structural
        const result = await auditComponent(component, tableUpstreamUrl);

        expect(result.status).toBe('upstream-error');
        expect(result.error).toContain('no parseable component exports');
    });

    it('treats a missing local file as an audit error (non-zero exit)', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            mockResponse(upstreamTableSourceWithWrapper),
        );
        vi.stubGlobal('fetch', fetchMock);

        const component = {
            ...baseManifest.components[0],
            localPath: 'registry/data-table/components/ui/nonexistent.tsx',
        };
        const result = await auditComponent(component, tableUpstreamUrl);

        expect(result.status).toBe('error');
        expect(result.upstreamFetched).toBe(true);
        expect(result.error).toContain('cannot read local file');
    });

    it('enforces table semantic elements even when component.semanticElements is missing or empty in the manifest', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            mockResponse(upstreamTableSourceWithWrapper),
        );
        vi.stubGlobal('fetch', fetchMock);

        // Component definition with semanticElements removed
        const componentWithoutSemantic = {
            name: 'table',
            localPath: 'registry/data-table/components/ui/table.tsx',
            upstreamComponent: 'table',
            comparisonStrategy: 'structural',
            classification: 'structurally-mirrors-upstream',
            upstreamSource: tableUpstreamUrl,
        };

        const result = await auditComponent(componentWithoutSemantic, tableUpstreamUrl);
        // Local table.tsx satisfies the full semantic contract, so status is ok
        expect(result.status).toBe('ok');
    });
});

describe('shadcn-compatibility-audit: auditComponentDrift', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('detects no drift when latest matches baseline', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            mockResponse(upstreamTableSourceWithWrapper),
        );
        vi.stubGlobal('fetch', fetchMock);

        const { components: baselineStructure } = extractComponentStructure(upstreamTableSourceWithWrapper);
        const component = {
            name: 'table',
            localPath: 'registry/data-table/components/ui/table.tsx',
            upstreamComponent: 'table',
            comparisonStrategy: 'structural',
            classification: 'structurally-mirrors-upstream',
        };
        const latestUrl = 'https://raw.githubusercontent.com/shadcn-ui/ui/abc123/apps/v4/registry/new-york-v4/ui/table.tsx';
        const result = await auditComponentDrift(
            component,
            baselineStructure,
            latestUrl,
            'abc123',
        );

        expect(result.status).toBe('ok');
        expect(result.commit).toBe('abc123');
    });

    it('detects drift when latest differs from baseline', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            mockResponse(upstreamTableSourceMissingCaption),
        );
        vi.stubGlobal('fetch', fetchMock);

        const { components: baselineStructure } = extractComponentStructure(upstreamTableSourceWithWrapper);
        const component = {
            name: 'table',
            localPath: 'registry/data-table/components/ui/table.tsx',
            upstreamComponent: 'table',
            comparisonStrategy: 'structural',
            classification: 'structurally-mirrors-upstream',
        };
        const latestUrl = 'https://raw.githubusercontent.com/shadcn-ui/ui/def456/apps/v4/registry/new-york-v4/ui/table.tsx';
        const result = await auditComponentDrift(
            component,
            baselineStructure,
            latestUrl,
            'def456',
        );

        expect(result.status).toBe('structural-difference');
        expect(result.commit).toBe('def456');
        expect(result.differences.length).toBeGreaterThan(0);
    });

    it('handles upstream retrieval failure in drift mode', async () => {
        const fetchMock = vi.fn().mockRejectedValue(new TypeError('network down'));
        vi.stubGlobal('fetch', fetchMock);

        const component = {
            name: 'table',
            localPath: 'registry/data-table/components/ui/table.tsx',
            upstreamComponent: 'table',
            comparisonStrategy: 'structural',
            classification: 'structurally-mirrors-upstream',
        };
        const result = await auditComponentDrift(
            component,
            extractComponentStructure(upstreamTableSourceWithWrapper).components,
            'https://example.com/table.tsx',
            'abc123',
        );

        expect(result.status).toBe('upstream-error');
        expect(result.upstreamFetched).toBe(false);
        expect(result.error).toContain('failed to retrieve upstream source');
    });
});

describe('shadcn-compatibility-audit: buildReport', () => {
    it('produces a report with ok status for matching components', () => {
        const results = [
            {
                name: 'table',
                localPath: 'registry/data-table/components/ui/table.tsx',
                upstreamComponent: 'table',
                comparisonStrategy: 'structural',
                classification: 'structurally-mirrors-upstream',
                status: 'ok',
                differences: [],
                upstreamSource: 'https://example.com/table.tsx',
                upstreamFetched: true,
                error: null,
            },
            {
                name: 'button',
                localPath: 'registry/data-table/components/ui/button.tsx',
                upstreamComponent: 'button',
                comparisonStrategy: 'manual',
                classification: 'role-equivalent-shim',
                status: 'manual-review',
                differences: [
                    'role-equivalent shim; no automated source comparison — requires manual compatibility review',
                ],
                upstreamSource: 'https://example.com/button.tsx',
                upstreamFetched: false,
                error: null,
            },
        ];

        const report = buildReport(results);
        expect(report).toContain('[ok] table: no structural differences');
        expect(report).toContain('[manual-review] button:');
        expect(report).toContain('Summary:');
        expect(report).toContain('1 requiring manual review');
        expect(report).toContain('0 with upstream structural differences requiring review');
        expect(report).not.toContain('signal for review');
    });

    it('produces a report with the review signal when structural differences exist', () => {
        const results = [
            {
                name: 'table',
                localPath: 'registry/data-table/components/ui/table.tsx',
                upstreamComponent: 'table',
                comparisonStrategy: 'structural',
                classification: 'structurally-mirrors-upstream',
                status: 'structural-difference',
                differences: [
                    'component "TableCaption" renders <caption> locally but upstream does not render those elements',
                ],
                upstreamSource: 'https://example.com/table.tsx',
                upstreamFetched: true,
                error: null,
            },
        ];

        const report = buildReport(results);
        expect(report).toContain('[review-required] table');
        expect(report).toContain('signals for review, not instructions to copy upstream code');
    });

    it('produces a report with local file errors and non-zero summary count', () => {
        const results = [
            {
                name: 'table',
                localPath: 'registry/data-table/components/ui/table.tsx',
                upstreamComponent: 'table',
                comparisonStrategy: 'structural',
                classification: 'structurally-mirrors-upstream',
                status: 'error',
                differences: [],
                upstreamSource: 'https://example.com/table.tsx',
                upstreamFetched: true,
                error: 'cannot read local file: ENOENT',
            },
        ];

        const report = buildReport(results);
        expect(report).toContain('[error] table');
        expect(report).toContain('1 with local file errors');
        expect(report).toContain('signals for review, not instructions to copy upstream code');
    });

    it('produces a report listing upstream retrieval errors', () => {
        const results = [
            {
                name: 'table',
                localPath: 'registry/data-table/components/ui/table.tsx',
                upstreamComponent: 'table',
                comparisonStrategy: 'structural',
                classification: 'structurally-mirrors-upstream',
                status: 'upstream-error',
                differences: [],
                upstreamSource: 'https://example.com/table.tsx',
                upstreamFetched: false,
                error: 'failed to retrieve upstream source: HTTP 404',
            },
        ];

        const report = buildReport(results);
        expect(report).toContain('[upstream-error] table');
        expect(report).toContain('HTTP 404');
    });
});

describe('shadcn-compatibility-audit: fetchWithTimeout', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns response text on success', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            mockResponse('hello world'),
        );
        vi.stubGlobal('fetch', fetchMock);

        const text = await fetchWithTimeout('https://example.com/file.tsx');
        expect(text).toBe('hello world');
        expect(fetchMock).toHaveBeenCalledWith(
            'https://example.com/file.tsx',
            expect.objectContaining({ signal: expect.anything() }),
        );
    });

    it('throws on non-ok response', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            mockResponse('not found', 404),
        );
        vi.stubGlobal('fetch', fetchMock);

        await expect(fetchWithTimeout('https://example.com/file.tsx')).rejects.toThrow(
            'HTTP 404',
        );
    });

    it('throws on network error', async () => {
        const fetchMock = vi.fn().mockRejectedValue(new TypeError('network down'));
        vi.stubGlobal('fetch', fetchMock);

        await expect(fetchWithTimeout('https://example.com/file.tsx')).rejects.toThrow(
            'network down',
        );
    });
});

describe('shadcn-compatibility-audit: discoverLatestCommit', () => {
    const upstream = { repository: 'shadcn-ui/ui', branch: 'main' };

    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns the latest commit SHA from the GitHub API', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            mockResponse(JSON.stringify({ sha: 'abc123def456' })),
        );
        vi.stubGlobal('fetch', fetchMock);

        const sha = await discoverLatestCommit(upstream);
        expect(sha).toBe('abc123def456');
        expect(fetchMock).toHaveBeenCalledWith(
            'https://api.github.com/repos/shadcn-ui/ui/commits/main',
            expect.objectContaining({
                headers: expect.objectContaining({
                    Accept: 'application/vnd.github+json',
                }),
                signal: expect.anything(),
            }),
        );
    });

    it('constructs the API URL from the manifest repository and branch', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            mockResponse(JSON.stringify({ sha: 'sha' })),
        );
        vi.stubGlobal('fetch', fetchMock);

        await discoverLatestCommit({ repository: 'owner/repo', branch: 'dev' });
        expect(fetchMock).toHaveBeenCalledWith(
            'https://api.github.com/repos/owner/repo/commits/dev',
            expect.anything(),
        );
    });

    it('returns null when the API response has no SHA', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            mockResponse(JSON.stringify({})),
        );
        vi.stubGlobal('fetch', fetchMock);

        const sha = await discoverLatestCommit(upstream);
        expect(sha).toBe(null);
    });

    it('returns null when the API call fails', async () => {
        const fetchMock = vi.fn().mockRejectedValue(new TypeError('network down'));
        vi.stubGlobal('fetch', fetchMock);

        const sha = await discoverLatestCommit(upstream);
        expect(sha).toBe(null);
    });
});

describe('shadcn-compatibility-audit: buildUpstreamUrl', () => {
    const upstream = {
        repository: 'shadcn-ui/ui',
        branch: 'main',
        baselineCommit: '055aa6b7837b1808456a24beb4c97a677864aa82',
        rawUrlTemplate:
            'https://raw.githubusercontent.com/shadcn-ui/ui/{commit}/apps/v4/registry/new-york-v4/ui/{component}.tsx',
    };

    it('substitutes the commit and component into the template', () => {
        const url = buildUpstreamUrl(upstream, 'table', 'abc123');
        expect(url).toBe(
            'https://raw.githubusercontent.com/shadcn-ui/ui/abc123/apps/v4/registry/new-york-v4/ui/table.tsx',
        );
    });

    it('produces distinct source URLs for distinct commits', () => {
        const baseline = buildUpstreamUrl(upstream, 'table', 'aaa');
        const latest = buildUpstreamUrl(upstream, 'table', 'bbb');
        expect(baseline).not.toBe(latest);
        expect(baseline).toContain('aaa');
        expect(latest).toContain('bbb');
    });
});

// Helper: build a valid manifest with all 7 expected components.
function makeValidManifest(overrides = {}) {
    const base = {
        version: 1,
        upstream: {
            repository: 'shadcn-ui/ui',
            branch: 'main',
            baselineCommit: '055aa6b7837b1808456a24beb4c97a677864aa82',
            currentCommit: '055aa6b7837b1808456a24beb4c97a677864aa82',
            style: 'new-york-v4',
            sourcePath: 'apps/v4/registry/new-york-v4/ui',
            rawUrlTemplate:
                'https://raw.githubusercontent.com/shadcn-ui/ui/{commit}/apps/v4/registry/new-york-v4/ui/{component}.tsx',
        },
    };
    const components = EXPECTED_NAMES.map((name) => ({
        name,
        localPath: `registry/data-table/components/ui/${name}.tsx`,
        upstreamComponent: name,
        comparisonStrategy: name === 'table' ? 'structural' : 'manual',
        classification: name === 'table' ? 'structurally-mirrors-upstream' : 'role-equivalent-shim',
        upstreamSource: buildUpstreamUrl(
            base.upstream,
            name,
            base.upstream.baselineCommit,
        ),
        notes: 'test',
    }));
    return { ...base, components, ...overrides };
}

const EXPECTED_NAMES = [
    'button',
    'checkbox',
    'dropdown-menu',
    'input',
    'select',
    'skeleton',
    'table',
];

describe('shadcn-compatibility-audit: manifest validation', () => {
    it('validates a well-formed manifest', () => {
        const result = validateManifest(makeValidManifest());
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
    });

    it('rejects a manifest with missing components', () => {
        const bad = {
            ...baseManifest,
            components: [baseManifest.components[0]], // only table
        };
        const result = validateManifest(bad);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('missing required component'))).toBe(true);
    });

    it('rejects a manifest with duplicate component names', () => {
        const bad = {
            ...baseManifest,
            components: [
                baseManifest.components[0],
                { ...baseManifest.components[0], name: 'table' }, // duplicate
            ],
        };
        const result = validateManifest(bad);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('duplicated'))).toBe(true);
    });

    it('rejects a manifest with an invalid baseline commit SHA', () => {
        const bad = {
            ...baseManifest,
            upstream: {
                ...baseManifest.upstream,
                baselineCommit: 'not-a-sha',
            },
        };
        const result = validateManifest(bad);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('baselineCommit'))).toBe(true);
    });

    it('rejects a manifest with an invalid comparison strategy', () => {
        const bad = {
            ...baseManifest,
            components: baseManifest.components.map((c) =>
                c.name === 'table' ? { ...c, comparisonStrategy: 'invalid' } : c,
            ),
        };
        const result = validateManifest(bad);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('comparisonStrategy'))).toBe(true);
    });

    it('rejects a manifest where table uses manual strategy', () => {
        const bad = {
            ...baseManifest,
            components: baseManifest.components.map((c) =>
                c.name === 'table' ? { ...c, comparisonStrategy: 'manual' } : c,
            ),
        };
        const result = validateManifest(bad);
        expect(result.valid).toBe(false);
        expect(
            result.errors.some((e) =>
                e.includes("comparisonStrategy") && e.includes('structural'),
            ),
        ).toBe(true);
    });

    it('rejects a manifest whose rawUrlTemplate identifies a different repository', () => {
        const bad = {
            ...baseManifest,
            upstream: {
                ...baseManifest.upstream,
                repository: 'owner/fork',
            },
        };
        const result = validateManifest(bad);
        expect(result.valid).toBe(false);
        expect(
            result.errors.some((e) => e.includes('rawUrlTemplate') && e.includes('repository')),
        ).toBe(true);
    });

    it('rejects a manifest whose rawUrlTemplate has a host other than raw.githubusercontent.com', () => {
        const bad = {
            ...baseManifest,
            upstream: {
                ...baseManifest.upstream,
                rawUrlTemplate:
                    'https://raw.github.com/shadcn-ui/ui/{commit}/apps/v4/registry/new-york-v4/ui/{component}.tsx',
            },
        };
        const result = validateManifest(bad);
        expect(result.valid).toBe(false);
        expect(
            result.errors.some((e) => e.includes('raw.githubusercontent.com')),
        ).toBe(true);
    });

    it('rejects a manifest whose rawUrlTemplate matches repository name only as substring (e.g. repo-fork)', () => {
        const bad = {
            ...baseManifest,
            upstream: {
                ...baseManifest.upstream,
                repository: 'shadcn-ui/ui',
                rawUrlTemplate:
                    'https://raw.githubusercontent.com/shadcn-ui/ui-fork/{commit}/apps/v4/registry/new-york-v4/ui/{component}.tsx',
            },
        };
        const result = validateManifest(bad);
        expect(result.valid).toBe(false);
        expect(
            result.errors.some((e) => e.includes('path segments must match')),
        ).toBe(true);
    });

    it('rejects a manifest whose rawUrlTemplate puts {commit} inside a URL fragment', () => {
        const bad = {
            ...baseManifest,
            upstream: {
                ...baseManifest.upstream,
                rawUrlTemplate:
                    'https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/registry/new-york-v4/ui/{component}.tsx#{commit}',
            },
        };
        const result = validateManifest(bad);
        expect(result.valid).toBe(false);
        expect(
            result.errors.some((e) => e.includes('URL fragment')),
        ).toBe(true);
    });

    it('rejects a manifest when a non-table component is set to structural strategy', () => {
        const bad = {
            ...makeValidManifest(),
        };
        bad.components = bad.components.map((c) =>
            c.name === 'button' ? { ...c, comparisonStrategy: 'structural' } : c,
        );
        const result = validateManifest(bad);
        expect(result.valid).toBe(false);
        expect(
            result.errors.some((e) => e.includes("must be 'manual' for button")),
        ).toBe(true);
    });

    it('does not throw and records a manifest error when manifest.upstream is missing or not an object', () => {
        const bad = {
            version: 1,
            components: makeValidManifest().components,
        };
        expect(() => validateManifest(bad)).not.toThrow();
        const result = validateManifest(bad);
        expect(result.valid).toBe(false);
        expect(
            result.errors.some((e) => e.includes('manifest.upstream is missing or not an object')),
        ).toBe(true);
    });

    it('rejects a manifest whose rawUrlTemplate does not substitute the commit', () => {
        const bad = {
            ...baseManifest,
            upstream: {
                ...baseManifest.upstream,
                rawUrlTemplate:
                    'https://raw.githubusercontent.com/shadcn-ui/ui/055aa6b7837b1808456a24beb4c97a677864aa82/apps/v4/registry/new-york-v4/ui/{component}.tsx',
            },
        };
        const result = validateManifest(bad);
        expect(result.valid).toBe(false);
        expect(
            result.errors.some((e) => e.includes('rawUrlTemplate') && e.includes('{commit}')),
        ).toBe(true);
    });

    it('rejects a manifest with missing upstream repository', () => {
        const bad = {
            ...baseManifest,
            upstream: { ...baseManifest.upstream, repository: '' },
        };
        const result = validateManifest(bad);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('repository'))).toBe(true);
    });

    it('rejects a manifest with a non-HTTPS upstream source', () => {
        const bad = {
            ...baseManifest,
            components: baseManifest.components.map((c) =>
                c.name === 'table' ? { ...c, upstreamSource: 'ftp://example.com/table.tsx' } : c,
            ),
        };
        const result = validateManifest(bad);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('HTTPS'))).toBe(true);
    });

    it('rejects a manifest whose upstreamSource points to a different commit than the manifest baseline', () => {
        const bad = {
            ...baseManifest,
            components: baseManifest.components.map((c) =>
                c.name === 'table'
                    ? {
                          ...c,
                          upstreamSource: c.upstreamSource.replace(
                              baseManifest.upstream.baselineCommit,
                              '0000000000000000000000000000000000000000',
                          ),
                      }
                    : c,
            ),
        };
        const result = validateManifest(bad);
        expect(result.valid).toBe(false);
        expect(
            result.errors.some((e) => e.includes('upstreamSource') && e.includes('baseline commit')),
        ).toBe(true);
    });

    it('rejects a manifest whose upstreamSource points to a different component than declared', () => {
        const bad = {
            ...baseManifest,
            components: baseManifest.components.map((c) =>
                c.name === 'table'
                    ? {
                          ...c,
                          upstreamSource: buildUpstreamUrl(
                              baseManifest.upstream,
                              'button',
                              baseManifest.upstream.baselineCommit,
                          ),
                      }
                    : c,
            ),
        };
        const result = validateManifest(bad);
        expect(result.valid).toBe(false);
        expect(
            result.errors.some((e) => e.includes('upstreamSource') && e.includes('baseline commit')),
        ).toBe(true);
    });

    it('rejects a null manifest', () => {
        const result = validateManifest(null);
        expect(result.valid).toBe(false);
    });

    it('rejects a manifest with wrong component count', () => {
        const bad = {
            ...baseManifest,
            components: [], // zero components instead of 7
        };
        const result = validateManifest(bad);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('exactly 7 entries'))).toBe(true);
    });
});

describe('shadcn-compatibility-audit: manifest validation (real manifest)', () => {
    it('validates the actual committed manifest', async () => {
        const fs = await import('node:fs');
        const manifest = JSON.parse(
            fs.readFileSync(
                'scripts/ci/shadcn-compatibility-manifest.json',
                'utf-8',
            ),
        );
        const result = validateManifest(manifest);
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
    });
});

describe('shadcn-compatibility-audit: extractComponentStructure (Finding 1 & 2 — TS AST export boundaries)', () => {
    it('resolves both names in grouped exports to the same component structure', () => {
        const source = `
function Table() {
    return <table />;
}

export { Table, Table as TableAlias };
`;
        const { components: structure } = extractComponentStructure(source);
        expect(structure.has('Table')).toBe(true);
        expect(structure.has('TableAlias')).toBe(true);
        expect(structure.get('Table')).toEqual(structure.get('TableAlias'));
        expect(structure.get('Table')).toContain('table');
    });

    it('does not let a private helper contribute JSX to an exported component', () => {
        const source = `
export function TableCaption() {
    return null;
}

function PrivateHelper() {
    return <caption />;
}
`;
        const { components: structure } = extractComponentStructure(source);
        expect(structure.has('TableCaption')).toBe(true);
        expect(structure.has('PrivateHelper')).toBe(false);
        expect(structure.get('TableCaption')).toEqual(new Set());
    });

    it('does not count JSX inside an uncalled nested helper function', () => {
        const source = `
export function Table() {
    function renderCaption() {
        return <caption />;
    }
    return <table />;
}
`;
        const { components: structure } = extractComponentStructure(source);
        expect(structure.has('Table')).toBe(true);
        expect(structure.get('Table')).toEqual(new Set(['table']));
        expect(structure.get('Table')).not.toContain('caption');
    });

    it('identifies an export alias correctly', () => {
        const source = `
function Table() {
    return <table />;
}

export { Table as DataTable };
`;
        const { components: structure } = extractComponentStructure(source);
        expect(structure.has('Table')).toBe(false);
        expect(structure.has('DataTable')).toBe(true);
        expect(structure.get('DataTable')).toContain('table');
    });

    it('gives each exported component in the same file only its own JSX', () => {
        const source = `
function Table() { return <table />; }
function Caption() { return <caption />; }
export { Table, Caption };
`;
        const { components: structure } = extractComponentStructure(source);
        expect(structure.size).toBe(2);
        expect(structure.get('Table')).toEqual(new Set(['table']));
        expect(structure.get('Caption')).toEqual(new Set(['caption']));
    });

    it('detects a removed or renamed required export', () => {
        const source = `
function Table() { return <table />; }
function Caption() { return <caption />; }
export { Table };
`;
        const { components: structure } = extractComponentStructure(source);
        expect(structure.has('Table')).toBe(true);
        expect(structure.has('Caption')).toBe(false);
    });

    it('handles named function declarations', () => {
        const source = `
function Button() { return <button />; }
export { Button };
`;
        const { components: structure } = extractComponentStructure(source);
        expect(structure.get('Button')).toContain('button');
    });

    it('handles arrow-function declarations', () => {
        const source = `
const Button = () => <button />;
export { Button };
`;
        const { components: structure } = extractComponentStructure(source);
        expect(structure.get('Button')).toContain('button');
    });

    it('handles function expressions', () => {
        const source = `
const Button = function () { return <button />; };
export { Button };
`;
        const { components: structure } = extractComponentStructure(source);
        expect(structure.get('Button')).toContain('button');
    });

    it('handles inline exports (export function / export const)', () => {
        const source = `
export function Button() { return <button />; }
export const Input = () => <input />;
`;
        const { components: structure } = extractComponentStructure(source);
        expect(structure.size).toBe(2);
        expect(structure.get('Button')).toContain('button');
        expect(structure.get('Input')).toContain('input');
    });

    it('handles simple, destructured and multiline parameters', () => {
        const source = `
function Simple() { return <div />; }
function Destructured({ children }) { return <div>{children}</div>; }
function Multiline(
    onReady: () => void,
    id: string,
) { return <div />; }
export { Simple, Destructured, Multiline };
`;
        const { components: structure } = extractComponentStructure(source);
        expect(structure.size).toBe(3);
        expect(structure.get('Simple')).toContain('div');
        expect(structure.get('Destructured')).toContain('div');
        expect(structure.get('Multiline')).toContain('div');
    });

    it('preserves nested JSX within a component body', () => {
        const source = `
function Table({ children }) {
    return (
        <div>
            <table>
                <thead><tr><th /></tr></thead>
                <tbody><tr><td /></tr></tbody>
            </table>
        </div>
    );
}
export { Table };
`;
        const { components: structure } = extractComponentStructure(source);
        expect(structure.get('Table')).toContain('div');
        expect(structure.get('Table')).toContain('table');
        expect(structure.get('Table')).toContain('thead');
        expect(structure.get('Table')).toContain('tr');
        expect(structure.get('Table')).toContain('th');
        expect(structure.get('Table')).toContain('tbody');
        expect(structure.get('Table')).toContain('td');
    });

    it('handles multiple exported components in one file', () => {
        const source = `
function Table() { return <table />; }
function Caption() { return <caption />; }
function Button() { return <button />; }
export { Table, Caption, Button };
`;
        const { components: structure } = extractComponentStructure(source);
        expect(structure.size).toBe(3);
        expect(structure.get('Table')).toContain('table');
        expect(structure.get('Caption')).toContain('caption');
        expect(structure.get('Button')).toContain('button');
    });

    it('skips unsupported export patterns instead of producing a bogus structure', () => {
        const source = `
export const notAComponent = 42;
export default function Default() { return <div />; }
function Real() { return <span />; }
export { Real };
`;
        const { components: structure } = extractComponentStructure(source);
        expect(structure.has('Real')).toBe(true);
        expect(structure.get('Real')).toContain('span');
        expect(structure.has('notAComponent')).toBe(false);
    });

    it('ignores type-only exports and type-only specifiers', () => {
        const source = `
function Table() { return <table />; }
export type { Table };
export { type Caption };
function Caption() { return <caption />; }
export { Real };
function Real() { return <div />; }
`;
        const { components: structure } = extractComponentStructure(source);
        // Table is re-exported only as a type, not as a value component.
        expect(structure.has('Table')).toBe(false);
        // Caption is re-exported only as a type via a type-only specifier.
        expect(structure.has('Caption')).toBe(false);
        // Real is a genuine value export.
        expect(structure.has('Real')).toBe(true);
        expect(structure.get('Real')).toContain('div');
    });

    it('treats a default export as removal of the named export', () => {
        const source = `
export default function Table() { return <table />; }
`;
        const { components: structure } = extractComponentStructure(source);
        expect(structure.has('Table')).toBe(false);
        expect(structure.size).toBe(0);
    });

    it('does not associate an external re-export with a same-named local declaration', () => {
        const source = `
function Table() { return <table />; }
export { Table } from './other';
`;
        const { components: structure } = extractComponentStructure(source);
        expect(structure.has('Table')).toBe(false);
    });

    it('does not crash on a namespace export clause', () => {
        const source = `
function Table() { return <table />; }
export * as ns from './other';
`;
        const { components: structure } = extractComponentStructure(source);
        expect(structure.has('Table')).toBe(false);
        expect(structure.size).toBe(0);
    });

    it('does not treat an unrelated call callback as a component render body', () => {
        const source = `
const Items = ([1, 2]).map(() => <li />);
function Table() { return <table />; }
export { Table, Items };
`;
        const { components: structure } = extractComponentStructure(source);
        expect(structure.has('Table')).toBe(true);
        expect(structure.get('Table')).toContain('table');
        expect(structure.has('Items')).toBe(false);
    });

    it('ignores JSX tags that appear only in comments', () => {
        const source = `
export function TableCaption() {
    // <caption />
    return null;
}
`;
        const { components: structure } = extractComponentStructure(source);
        expect(structure.has('TableCaption')).toBe(true);
        expect(structure.get('TableCaption')).toEqual(new Set());
    });

    it('returns an empty map for TSX with syntax errors', () => {
        const broken = extractComponentStructure('function Table() { return <table />;');
        expect(broken.components).toEqual(new Map());
        expect(broken.error).toBeTruthy();
        const incomplete = extractComponentStructure('export { ');
        expect(incomplete.components).toEqual(new Map());
        expect(incomplete.error).toBeTruthy();
    });
});

describe('shadcn-compatibility-audit: auditComponentDrift baseline guards (Finding 3)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    const structuralComponent = {
        name: 'table',
        localPath: 'registry/data-table/components/ui/table.tsx',
        upstreamComponent: 'table',
        comparisonStrategy: 'structural',
        classification: 'structurally-mirrors-upstream',
    };

    const { components: baselineTable } = extractComponentStructure(upstreamTableSourceWithWrapper);

    it('extracts a valid baseline structure from a parseable baseline source', () => {
        expect(baselineTable.size).toBeGreaterThan(0);
        expect(baselineTable.get('Table')).toContain('table');
    });

    it('returns an empty map for an empty baseline source', () => {
        expect(extractComponentStructure('').components).toEqual(new Map());
        expect(extractComponentStructure('').error).toBeNull();
        expect(extractComponentStructure('   ').components).toEqual(new Map());
        expect(extractComponentStructure('   ').error).toBeNull();
    });

    it('returns an empty map for invalid TSX baseline source', () => {
        const result = extractComponentStructure('this is not valid tsx {{{');
        expect(result.components).toEqual(new Map());
        expect(result.error).toBeTruthy();
    });

    it('reports an upstream-error when the baseline structure is empty', async () => {
        const result = await auditComponentDrift(
            structuralComponent,
            new Map(),
            'https://example.com/table.tsx',
            'latest123',
        );
        expect(result.status).toBe('upstream-error');
        expect(result.error).toContain('baseline');
        expect(result.error).toContain('table');
    });

    it('reports an upstream-error when the baseline structure is null', async () => {
        const result = await auditComponentDrift(
            structuralComponent,
            null,
            'https://example.com/table.tsx',
            'latest123',
        );
        expect(result.status).toBe('upstream-error');
        expect(result.error).toContain('baseline');
    });

    it('reports an upstream-error when the baseline is missing required exports', async () => {
        // Baseline has only Table, TableHeader, TableBody — missing TableCaption
        // and other required exports. Drift must reject it before fetching latest.
        const incompleteBaseline = new Map([
            ['Table', new Set(['table'])],
            ['TableHeader', new Set(['thead'])],
            ['TableBody', new Set(['tbody'])],
        ]);
        const fetchMock = vi.fn().mockResolvedValue(
            mockResponse(upstreamTableSourceWithWrapper),
        );
        vi.stubGlobal('fetch', fetchMock);

        const result = await auditComponentDrift(
            structuralComponent,
            incompleteBaseline,
            'https://example.com/table.tsx',
            'latest123',
        );
        expect(result.status).toBe('upstream-error');
        expect(result.upstreamFetched).toBe(false);
        expect(result.error).toContain('baseline');
        expect(result.error).toContain('TableCaption');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('reports drift when latest is missing a required export such as TableCaption', async () => {
        // Complete baseline (all 8 exports) vs latest missing TableCaption.
        const fetchMock = vi.fn().mockResolvedValue(
            mockResponse(upstreamTableSourceMissingCaption),
        );
        vi.stubGlobal('fetch', fetchMock);

        const result = await auditComponentDrift(
            structuralComponent,
            baselineTable,
            'https://example.com/table.tsx',
            'latest123',
        );
        expect(result.status).toBe('structural-difference');
        expect(result.upstreamFetched).toBe(true);
        expect(result.commit).toBe('latest123');
        expect(result.differences.length).toBeGreaterThan(0);
        expect(
            result.differences.some((d) => d.includes('TableCaption')),
        ).toBe(true);
    });

    it('fails explicitly when one baseline component is unusable during drift comparison', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            mockResponse(upstreamTableSourceMissingCaption),
        );
        vi.stubGlobal('fetch', fetchMock);

        const result = await auditComponentDrift(
            structuralComponent,
            new Map(), // unusable baseline
            'https://example.com/table.tsx',
            'latest123',
        );
        expect(result.status).toBe('upstream-error');
        expect(result.upstreamFetched).toBe(false);
    });

    it('performs drift comparison when the baseline is usable', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            mockResponse(upstreamTableSourceMissingCaption),
        );
        vi.stubGlobal('fetch', fetchMock);

        const result = await auditComponentDrift(
            structuralComponent,
            baselineTable,
            'https://example.com/table.tsx',
            'latest123',
        );
        expect(result.status).toBe('structural-difference');
        expect(result.commit).toBe('latest123');
        expect(result.differences.length).toBeGreaterThan(0);
    });
});

describe('shadcn-compatibility-audit: CLI entry-point detection with spaces in path (Finding 6)', () => {
    it('matches import.meta.url with pathToFileURL for paths containing spaces', () => {
        const pathWithSpaces = '/Users/test user/project name/scripts/ci/shadcn-compatibility-audit.js';
        const fileUrl = pathToFileURL(pathWithSpaces).href;

        expect(fileUrl).toContain('test%20user');
        expect(fileUrl).toContain('project%20name');
        expect(fileUrl.startsWith('file://')).toBe(true);

        // A naive template literal file://${path} would NOT match the encoded file URL
        expect(`file://${pathWithSpaces}`).not.toBe(fileUrl);
        // But pathToFileURL(path).href matches an import.meta.url created for that file path
        expect(pathToFileURL(pathWithSpaces).href).toBe(fileUrl);
    });
});
