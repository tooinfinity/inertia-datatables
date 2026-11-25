import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
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
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
}
`;

// Upstream Table that removes <caption> — should be detected as a difference.
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

export { Table, TableHeader, TableBody }
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
        const structure = extractComponentStructure(localTableSource);
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
        const structure = extractComponentStructure(localButtonSource);
        expect(structure.get('Button')).toContain('button');
        expect(structure.size).toBe(1);
    });

    it('returns an empty map for source with no exported components', () => {
        expect(extractComponentStructure('const x = 1;')).toEqual(new Map());
        expect(extractComponentStructure('')).toEqual(new Map());
    });

    it('handles forwardRef-wrapped components', () => {
        const structure = extractComponentStructure(upstreamTableSourceWithWrapper);
        expect(structure.get('Table')).toContain('table');
        expect(structure.get('Table')).toContain('div');
        expect(structure.get('TableHeader')).toContain('thead');
    });

    it('extracts all HTML elements including nested ones', () => {
        const structure = extractComponentStructure(upstreamTableSourceWithWrapper);
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
});

describe('shadcn-compatibility-audit: compareStructures', () => {
    it('reports no differences when local elements are subset of upstream (wrapper case)', () => {
        const local = extractComponentStructure(localTableSource);
        const upstream = extractComponentStructure(upstreamTableSourceWithWrapper);
        const differences = compareStructures(local, upstream);
        // The local Table renders {table, thead, ...} which is a subset of
        // upstream's {div, table, thead, ...} — wrapper is allowed.
        const tableDiffs = differences.filter((d) => d.includes('Table'));
        expect(tableDiffs).toEqual([]);
    });

    it('reports no differences when structures match exactly', () => {
        const local = extractComponentStructure(localTableSource);
        const upstream = extractComponentStructure(upstreamTableSourceWithWrapper);
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
        const local = extractComponentStructure(localTableSource);
        const upstream = extractComponentStructure(
            `export const Table = ({ children }) => <table>{children}</table>;`,
        );
        const differences = compareStructures(local, upstream);
        expect(
            differences.some((d) => d.includes('TableHeader') && d.includes('no upstream counterpart')),
        ).toBe(true);
    });

    it('reports a component present upstream but missing locally', () => {
        const local = extractComponentStructure(
            `export const Table = ({ children }) => <table>{children}</table>;`,
        );
        const upstream = extractComponentStructure(localTableSource);
        const differences = compareStructures(local, upstream);
        expect(
            differences.some((d) => d.includes('TableHeader') && d.includes('not implemented locally')),
        ).toBe(true);
    });

    it('detects when upstream removes an element the local renders', () => {
        const local = extractComponentStructure(localTableSource);
        const upstream = extractComponentStructure(upstreamTableSourceMissingCaption);
        const differences = compareStructures(local, upstream);
        expect(
            differences.some((d) => d.includes('TableCaption') || d.includes('caption')),
        ).toBe(true);
    });

    it('returns empty for identical empty structures', () => {
        expect(compareStructures(new Map(), new Map())).toEqual([]);
    });
});

describe('shadcn-compatibility-audit: auditComponent', () => {
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
        const result = await auditComponent(component);

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
        const component = {
            ...baseManifest.components[0], // table — structural
            upstreamSource:
                'https://raw.githubusercontent.com/shadcn-ui/ui/0000000000000000000000000000000000000000/apps/v4/registry/new-york-v4/ui/table.tsx',
        };
        const result = await auditComponent(component);

        expect(result.status).toBe('ok');
        expect(result.upstreamFetched).toBe(true);
        expect(result.differences).toEqual([]);
        expect(fetchMock).toHaveBeenCalledWith(
            component.upstreamSource,
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
        const result = await auditComponent(component);

        expect(result.status).toBe('structural-difference');
        expect(result.upstreamFetched).toBe(true);
        expect(result.differences.length).toBeGreaterThan(0);
    });

    it('handles upstream retrieval failure as upstream-error', async () => {
        const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
        vi.stubGlobal('fetch', fetchMock);

        const component = baseManifest.components[0]; // table — structural
        const result = await auditComponent(component);

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
        const result = await auditComponent(component);

        expect(result.status).toBe('upstream-error');
        expect(result.error).toContain('HTTP 404');
    });

    it('handles upstream source with no parseable exports as upstream-error', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            mockResponse('export const foo = 1;'),
        );
        vi.stubGlobal('fetch', fetchMock);

        const component = baseManifest.components[0]; // table — structural
        const result = await auditComponent(component);

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
        const result = await auditComponent(component);

        expect(result.status).toBe('error');
        expect(result.upstreamFetched).toBe(true);
        expect(result.error).toContain('cannot read local file');
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

        const baselineStructure = extractComponentStructure(upstreamTableSourceWithWrapper);
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

        const baselineStructure = extractComponentStructure(upstreamTableSourceWithWrapper);
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
            new Map(),
            'https://example.com/table.tsx',
            'abc123',
        );

        expect(result.status).toBe('upstream-error');
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

        const sha = await discoverLatestCommit();
        expect(sha).toBe('abc123def456');
    });

    it('returns null when the API response has no SHA', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            mockResponse(JSON.stringify({})),
        );
        vi.stubGlobal('fetch', fetchMock);

        const sha = await discoverLatestCommit();
        expect(sha).toBe(null);
    });

    it('returns null when the API call fails', async () => {
        const fetchMock = vi.fn().mockRejectedValue(new TypeError('network down'));
        vi.stubGlobal('fetch', fetchMock);

        const sha = await discoverLatestCommit();
        expect(sha).toBe(null);
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
        components: EXPECTED_NAMES.map((name) => ({
            name,
            localPath: `registry/data-table/components/ui/${name}.tsx`,
            upstreamComponent: name,
            comparisonStrategy: name === 'table' ? 'structural' : 'manual',
            classification: name === 'table' ? 'structurally-mirrors-upstream' : 'role-equivalent-shim',
            upstreamSource: `https://example.com/${name}.tsx`,
            notes: 'test',
        })),
    };
    return { ...base, ...overrides };
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
