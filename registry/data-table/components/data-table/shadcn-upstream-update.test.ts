import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
    detectAndPropose,
    detectComponents,
    applyChanges,
    hasLocalModification,
    isSafeToApply,
    buildPrTitle,
    buildPrBody,
    isStructuralComponent,
} from '../../../../scripts/ci/shadcn-upstream-update.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASELINE_COMMIT = '0000000000000000000000000000000000000000';
const LATEST_COMMIT = '1111111111111111111111111111111111111111';

const baselineTableSource = `
function Table({ children, ...props }) {
  return (
    <div data-slot="table-container">
      <table {...props}>{children}</table>
    </div>
  );
}
function TableHeader({ children, ...props }) {
  return <thead {...props}>{children}</thead>;
}
function TableBody({ children, ...props }) {
  return <tbody {...props}>{children}</tbody>;
}
function TableRow({ children, ...props }) {
  return <tr {...props}>{children}</tr>;
}
function TableCell({ children, ...props }) {
  return <td {...props}>{children}</td>;
}
export { Table, TableHeader, TableBody, TableRow, TableCell };
`;

const latestTableSourceAddedCaption = `
function Table({ children, ...props }) {
  return (
    <div data-slot="table-container">
      <table {...props}>{children}</table>
    </div>
  );
}
function TableHeader({ children, ...props }) {
  return <thead {...props}>{children}</thead>;
}
function TableBody({ children, ...props }) {
  return <tbody {...props}>{children}</tbody>;
}
function TableRow({ children, ...props }) {
  return <tr {...props}>{children}</tr>;
}
function TableCell({ children, ...props }) {
  return <td {...props}>{children}</td>;
}
function TableCaption({ children, ...props }) {
  return <caption {...props}>{children}</caption>;
}
export { Table, TableHeader, TableBody, TableRow, TableCell, TableCaption };
`;

function mockResponse(text: string, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText: status >= 200 && status < 300 ? 'OK' : 'Error',
        text: async () => text,
        json: async () => {
            try {
                return JSON.parse(text);
            } catch {
                return {};
            }
        },
    };
}

/**
 * Build a fetch mock for the raw.githubusercontent.com component URLs used by
 * the audit script. URLs look like:
 *   https://raw.githubusercontent.com/shadcn-ui/ui/{commit}/apps/v4/registry/new-york-v4/ui/{component}.tsx
 * The commit discovery call goes to api.github.com and returns `discoveredCommit`
 * (defaults to LATEST_COMMIT).
 */
function makeFetchHandler(
    baselineByComponent: Record<string, string>,
    latestByComponent: Record<string, string>,
    { discoveredCommit = LATEST_COMMIT } = {},
) {
    return async (url: string) => {
        if (url.includes('api.github.com')) {
            return mockResponse(JSON.stringify({ sha: discoveredCommit }));
        }
        const isBaseline = url.includes(`/${BASELINE_COMMIT}/`);
        const isLatest = url.includes(`/${LATEST_COMMIT}/`);
        if (!isBaseline && !isLatest) {
            return mockResponse('not found', 404);
        }
        const match = url.match(/ui\/([^/.]+)\.tsx$/);
        const component = match ? match[1] : null;
        const sources = isBaseline ? baselineByComponent : latestByComponent;
        const text = component ? sources?.[component] : undefined;
        if (text === undefined) {
            return mockResponse('not found', 404);
        }
        return mockResponse(text);
    };
}

function mockFetch(handler: (url: string) => unknown) {
    const fetchMock = vi.fn(async (url: string) => handler(url));
    vi.stubGlobal('fetch', fetchMock as unknown as (url: string) => Promise<Response>);
    return fetchMock;
}

function restoreFetch() {
    vi.restoreAllMocks();
}

// Build the real 7-component manifest with the given upstream SHAs.
function makeManifest(overrides: { baselineCommit?: string; currentCommit?: string } = {}) {
    return {
        version: 1,
        upstream: {
            repository: 'shadcn-ui/ui',
            branch: 'main',
            baselineCommit: overrides.baselineCommit ?? BASELINE_COMMIT,
            currentCommit: overrides.currentCommit ?? BASELINE_COMMIT,
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
                semanticElements: ['table', 'thead', 'tbody', 'tr', 'th', 'td', 'caption'],
                upstreamSource:
                    'https://raw.githubusercontent.com/shadcn-ui/ui/0000000000000000000000000000000000000000/apps/v4/registry/new-york-v4/ui/table.tsx',
                notes: 'test',
            },
            {
                name: 'button',
                localPath: 'registry/data-table/components/ui/button.tsx',
                upstreamComponent: 'button',
                comparisonStrategy: 'manual',
                classification: 'role-equivalent-shim',
                upstreamSource:
                    'https://raw.githubusercontent.com/shadcn-ui/ui/0000000000000000000000000000000000000000/apps/v4/registry/new-york-v4/ui/button.tsx',
                notes: 'test',
            },
            {
                name: 'input',
                localPath: 'registry/data-table/components/ui/input.tsx',
                upstreamComponent: 'input',
                comparisonStrategy: 'manual',
                classification: 'role-equivalent-shim',
                upstreamSource:
                    'https://raw.githubusercontent.com/shadcn-ui/ui/0000000000000000000000000000000000000000/apps/v4/registry/new-york-v4/ui/input.tsx',
                notes: 'test',
            },
            {
                name: 'select',
                localPath: 'registry/data-table/components/ui/select.tsx',
                upstreamComponent: 'select',
                comparisonStrategy: 'manual',
                classification: 'role-equivalent-shim',
                upstreamSource:
                    'https://raw.githubusercontent.com/shadcn-ui/ui/0000000000000000000000000000000000000000/apps/v4/registry/new-york-v4/ui/select.tsx',
                notes: 'test',
            },
            {
                name: 'dropdown-menu',
                localPath: 'registry/data-table/components/ui/dropdown-menu.tsx',
                upstreamComponent: 'dropdown-menu',
                comparisonStrategy: 'manual',
                classification: 'role-equivalent-shim',
                upstreamSource:
                    'https://raw.githubusercontent.com/shadcn-ui/ui/0000000000000000000000000000000000000000/apps/v4/registry/new-york-v4/ui/dropdown-menu.tsx',
                notes: 'test',
            },
            {
                name: 'checkbox',
                localPath: 'registry/data-table/components/ui/checkbox.tsx',
                upstreamComponent: 'checkbox',
                comparisonStrategy: 'manual',
                classification: 'role-equivalent-shim',
                upstreamSource:
                    'https://raw.githubusercontent.com/shadcn-ui/ui/0000000000000000000000000000000000000000/apps/v4/registry/new-york-v4/ui/checkbox.tsx',
                notes: 'test',
            },
            {
                name: 'skeleton',
                localPath: 'registry/data-table/components/ui/skeleton.tsx',
                upstreamComponent: 'skeleton',
                comparisonStrategy: 'manual',
                classification: 'role-equivalent-shim',
                upstreamSource:
                    'https://raw.githubusercontent.com/shadcn-ui/ui/0000000000000000000000000000000000000000/apps/v4/registry/new-york-v4/ui/skeleton.tsx',
                notes: 'test',
            },
        ],
    };
}

// Create a temporary directory containing a single local shim file, so tests
// can control whether the local shim matches the pinned baseline.
function makeLocalDir(shimSource: string) {
    const dir = mkdtempSync(join(tmpdir(), 'shadcn-update-'));
    const target = join(dir, 'registry', 'data-table', 'components', 'ui', 'table.tsx');
    mkdirSync(join(dir, 'registry', 'data-table', 'components', 'ui'), { recursive: true });
    writeFileSync(target, shimSource);
    return dir;
}

// ---------------------------------------------------------------------------
// hasLocalModification
// ---------------------------------------------------------------------------

describe('shadcn-upstream-update: hasLocalModification', () => {
    it('returns false when the local shim matches the baseline structure', () => {
        const local = new Map([
            ['Table', new Set(['div', 'table'])],
            ['TableHeader', new Set(['thead'])],
            ['TableBody', new Set(['tbody'])],
        ]);
        const baseline = new Map([
            ['Table', new Set(['div', 'table'])],
            ['TableHeader', new Set(['thead'])],
            ['TableBody', new Set(['tbody'])],
        ]);
        expect(hasLocalModification(local, baseline)).toEqual({ modified: false, detail: null });
    });

    it('returns true when exported names differ from baseline', () => {
        const local = new Map([['Table', new Set(['table'])]]);
        const baseline = new Map([
            ['Table', new Set(['table'])],
            ['Caption', new Set(['caption'])],
        ]);
        const result = hasLocalModification(local, baseline);
        expect(result.modified).toBe(true);
        expect(result.detail).toContain('exported component names');
    });

    it('returns true when rendered elements differ from baseline', () => {
        const local = new Map([['Table', new Set(['table'])]]);
        const baseline = new Map([['Table', new Set(['div', 'table'])]]);
        const result = hasLocalModification(local, baseline);
        expect(result.modified).toBe(true);
        expect(result.detail).toContain('renders different HTML elements');
    });

    it('returns true when either structure is missing', () => {
        expect(hasLocalModification(null as any, new Map()).modified).toBe(true);
        expect(hasLocalModification(new Map(), null as any).modified).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// isSafeToApply / isStructuralComponent
// ---------------------------------------------------------------------------

describe('shadcn-upstream-update: isSafeToApply', () => {
    const baseResult = (overrides: Record<string, unknown> = {}) => ({
        status: 'modified',
        localModification: false,
        error: null,
        ...overrides,
    });

    it('is true for a structural, modified component without local customizations', () => {
        const component = { comparisonStrategy: 'structural' };
        const result = baseResult({ status: 'modified', localModification: false, error: null });
        expect(isSafeToApply(component, result)).toBe(true);
    });

    it('is false for a manual role-equivalent shim', () => {
        const component = { comparisonStrategy: 'manual' };
        const result = baseResult({ status: 'modified', localModification: false });
        expect(isSafeToApply(component, result)).toBe(false);
    });

    it('is false when the component is unchanged', () => {
        const component = { comparisonStrategy: 'structural' };
        const result = baseResult({ status: 'unchanged', localModification: false });
        expect(isSafeToApply(component, result)).toBe(false);
    });

    it('is false when the component carries local customizations', () => {
        const component = { comparisonStrategy: 'structural' };
        const result = baseResult({ status: 'modified', localModification: true });
        expect(isSafeToApply(component, result)).toBe(false);
    });

    it('is false when there is a fetch/parse error', () => {
        const component = { comparisonStrategy: 'structural' };
        const result = baseResult({ status: 'modified', localModification: false, error: 'HTTP 404' });
        expect(isSafeToApply(component, result)).toBe(false);
    });

    it('is false for a removed component', () => {
        const component = { comparisonStrategy: 'structural' };
        const result = baseResult({ status: 'removed', localModification: false });
        expect(isSafeToApply(component, result)).toBe(false);
    });
});

describe('shadcn-upstream-update: isStructuralComponent', () => {
    it('returns true only for structural strategy', () => {
        expect(isStructuralComponent({ comparisonStrategy: 'structural' })).toBe(true);
        expect(isStructuralComponent({ comparisonStrategy: 'manual' })).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// detectAndPropose: no upstream changes
// ---------------------------------------------------------------------------

describe('shadcn-upstream-update: detectAndPropose (no upstream changes)', () => {
    beforeEach(restoreFetch);
    afterEach(restoreFetch);

    it('reports no changes and does not propose a PR when latest equals baseline', async () => {
        mockFetch(makeFetchHandler({}, {}, { discoveredCommit: BASELINE_COMMIT }));

        const proposal = await detectAndPropose(makeManifest({ baselineCommit: BASELINE_COMMIT }));

        expect(proposal.error).toBeNull();
        expect(proposal.shouldCreatePr).toBe(false);
        expect(proposal.exitCode).toBe(0);
        expect(proposal.summary.total).toBe(7);
        expect(proposal.summary.unchanged).toBe(7);
        expect(proposal.summary.safeToApply).toBe(0);
        for (const component of proposal.components) {
            expect(component.status).toBe('unchanged');
            expect(component.safeToApply).toBe(false);
        }
    });
});

// ---------------------------------------------------------------------------
// detectAndPropose: changed components (local customization protection)
// ---------------------------------------------------------------------------

describe('shadcn-upstream-update: detectAndPropose (changed components)', () => {
    beforeEach(restoreFetch);
    afterEach(restoreFetch);

    it('detects one modified component but does not propose a PR when the local shim carries customizations', async () => {
        // The real local table.tsx is simplified and differs from the baseline
        // upstream structure, so it carries local customizations.
        mockFetch(makeFetchHandler(
            { table: baselineTableSource },
            { table: latestTableSourceAddedCaption },
        ));

        const proposal = await detectAndPropose(makeManifest({ baselineCommit: BASELINE_COMMIT }));

        expect(proposal.error).toBeNull();
        expect(proposal.upstream.latestCommit).toBe(LATEST_COMMIT);
        const table = proposal.components.find((c) => c.name === 'table')!;
        expect(table.status).toBe('modified');
        expect(table.localModification).toBe(true); // local shim is simplified vs baseline
        expect(table.safeToApply).toBe(false);
        expect(table.differences.length).toBeGreaterThan(0);
        expect(proposal.shouldCreatePr).toBe(false); // conflict -> no PR
        expect(proposal.summary.conflicts).toBeGreaterThan(0);
        expect(proposal.summary.safeToApply).toBe(0);
    });

    it('detects multiple modified upstream components', async () => {
        const multi = {
            ...makeManifest({ baselineCommit: BASELINE_COMMIT }),
            components: [
                makeManifest({ baselineCommit: BASELINE_COMMIT }).components[0], // table (structural)
                {
                    ...makeManifest({ baselineCommit: BASELINE_COMMIT }).components[1],
                    comparisonStrategy: 'structural',
                    upstreamComponent: 'button',
                    localPath: 'registry/data-table/components/ui/button.tsx',
                },
            ],
        };

        mockFetch(makeFetchHandler(
            {
                table: baselineTableSource,
                button: 'export const Button = ({ children }) => <button {...props}>{children}</button>;',
            },
            {
                table: latestTableSourceAddedCaption,
                button: 'export const Button = ({ children }) => <button variant>{children}</button>;',
            },
        ));

        const { results } = await detectComponents(multi);
        expect(results.length).toBe(2);
        const modified = results.filter((c) => c.status === 'modified');
        expect(modified.length).toBeGreaterThanOrEqual(1);
    });
});

// ---------------------------------------------------------------------------
// detectAndPropose: added / removed components
// ---------------------------------------------------------------------------

describe('shadcn-upstream-update: detectAndPropose (added / removed)', () => {
    beforeEach(restoreFetch);
    afterEach(restoreFetch);

    it('classifies a new upstream component as added', async () => {
        mockFetch(makeFetchHandler(
            { table: 'export const foo = 1;' }, // baseline: no component exports
            { table: baselineTableSource },
        ));

        const proposal = await detectAndPropose(makeManifest({ baselineCommit: BASELINE_COMMIT }));
        const table = proposal.components.find((c) => c.name === 'table')!;
        expect(table.status).toBe('added');
        expect(proposal.summary.added).toBe(1);
    });

    it('classifies a removed upstream component as removed and does not propose it', async () => {
        mockFetch(makeFetchHandler(
            { table: baselineTableSource },
            { table: 'export const foo = 1;' }, // latest: no component exports
        ));

        const proposal = await detectAndPropose(makeManifest({ baselineCommit: BASELINE_COMMIT }));
        const table = proposal.components.find((c) => c.name === 'table')!;
        expect(table.status).toBe('removed');
        expect(table.safeToApply).toBe(false);
        expect(table.skipReason).toContain('manual review');
        expect(proposal.summary.removed).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// detectAndPropose: unavailable / invalid upstream source
// ---------------------------------------------------------------------------

describe('shadcn-upstream-update: detectAndPropose (unavailable upstream)', () => {
    beforeEach(restoreFetch);
    afterEach(restoreFetch);

    it('reports unavailable when latest commit discovery fails', async () => {
        mockFetch(async () => {
            throw new TypeError('network down');
        });

        const proposal = await detectAndPropose(makeManifest({ baselineCommit: BASELINE_COMMIT }));
        expect(proposal.shouldCreatePr).toBe(false);
        expect(proposal.exitCode).toBe(2);
        expect(proposal.error).toContain('failed to discover');
    });

    it('reports unavailable when a component source cannot be fetched', async () => {
        mockFetch(async (url) => {
            if (url.includes('api.github.com')) {
                return mockResponse(JSON.stringify({ sha: LATEST_COMMIT }));
            }
            throw new TypeError('network down');
        });

        const proposal = await detectAndPropose(makeManifest({ baselineCommit: BASELINE_COMMIT }));
        expect(proposal.shouldCreatePr).toBe(false);
        const table = proposal.components.find((c) => c.name === 'table')!;
        expect(table.status).toBe('unavailable');
        expect(table.error).toContain('network down');
    });

    it('rejects an invalid manifest without proposing a PR', async () => {
        const base = makeManifest();
        const bad = {
            ...base,
            upstream: { ...base.upstream, baselineCommit: 'not-a-sha' },
        };
        const proposal = await detectAndPropose(bad);
        expect(proposal.shouldCreatePr).toBe(false);
        expect(proposal.exitCode).toBe(1);
        expect(proposal.error).toContain('manifest validation failed');
    });
});

// ---------------------------------------------------------------------------
// detectAndPropose: safely applicable change -> PR proposed
// ---------------------------------------------------------------------------

describe('shadcn-upstream-update: detectAndPropose (safely applicable update)', () => {
    beforeEach(restoreFetch);
    afterEach(restoreFetch);

    it('proposes a PR when a structural component changed and the local shim matches baseline', async () => {
        const dir = makeLocalDir(baselineTableSource); // local shim == baseline (no customizations)
        try {
            mockFetch(makeFetchHandler(
                { table: baselineTableSource },
                { table: latestTableSourceAddedCaption },
            ));

            const proposal = await detectAndPropose(
                makeManifest({ baselineCommit: BASELINE_COMMIT }),
                { localBaseDir: dir },
            );

            expect(proposal.error).toBeNull();
            const table = proposal.components.find((c) => c.name === 'table')!;
            expect(table.status).toBe('modified');
            expect(table.localModification).toBe(false); // matches baseline
            expect(table.safeToApply).toBe(true);
            expect(proposal.shouldCreatePr).toBe(true);
            expect(proposal.summary.safeToApply).toBe(1);

            const title = buildPrTitle(proposal);
            expect(title).toMatch(/^chore: automated shadcn\/ui upstream update/);
            expect(title).toContain('1 component');

            const body = buildPrBody(proposal);
            expect(body).toContain('proposal only');
            expect(body).toContain(BASELINE_COMMIT);
            expect(body).toContain(LATEST_COMMIT);
            expect(body).toContain('human review');
            expect(body).toContain('protected-maintenance');
            expect(body).toContain('never approves, merges, or closes');
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});

// ---------------------------------------------------------------------------
// applyChanges (CI apply mode)
// ---------------------------------------------------------------------------

describe('shadcn-upstream-update: applyChanges', () => {
    beforeEach(restoreFetch);
    afterEach(restoreFetch);

    it('applies no changes and shouldApply is false when latest equals baseline', async () => {
        const dir = makeLocalDir(baselineTableSource);
        try {
            mockFetch(makeFetchHandler({}, {}, { discoveredCommit: BASELINE_COMMIT }));
            const manifestPath = join(dir, 'manifest.json');
            writeFileSync(
                manifestPath,
                JSON.stringify(makeManifest({ baselineCommit: BASELINE_COMMIT }), null, 2),
            );
            const result = await applyChanges(manifestPath, { localBaseDir: dir });
            expect(result.shouldApply).toBe(false);
            expect(result.changedFiles).toEqual([]);
            expect(result.proposal.shouldCreatePr).toBe(false);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('writes the latest source and bumps the baseline for a safely applicable component', async () => {
        const dir = makeLocalDir(baselineTableSource);
        try {
            mockFetch(makeFetchHandler(
                { table: baselineTableSource },
                { table: latestTableSourceAddedCaption },
            ));
            const manifestPath = join(dir, 'manifest.json');
            writeFileSync(
                manifestPath,
                JSON.stringify(makeManifest({ baselineCommit: BASELINE_COMMIT }), null, 2),
            );

            const result = await applyChanges(manifestPath, { localBaseDir: dir });

            expect(result.shouldApply).toBe(true);
            expect(result.changedFiles).toContain('registry/data-table/components/ui/table.tsx');
            expect(result.changedFiles).toContain(manifestPath);

            const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
            expect(manifest.upstream.baselineCommit).toBe(LATEST_COMMIT);
            expect(manifest.upstream.currentCommit).toBe(LATEST_COMMIT);

            const local = readFileSync(join(dir, 'registry', 'data-table', 'components', 'ui', 'table.tsx'), 'utf-8');
            expect(local).toContain('TableCaption');
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('does not write local shims that carry customizations (conflict)', async () => {
        const dir = makeLocalDir('export const Table = () => <table />;');
        try {
            mockFetch(makeFetchHandler(
                { table: baselineTableSource },
                { table: latestTableSourceAddedCaption },
            ));
            const manifestPath = join(dir, 'manifest.json');
            writeFileSync(
                manifestPath,
                JSON.stringify(makeManifest({ baselineCommit: BASELINE_COMMIT }), null, 2),
            );

            const result = await applyChanges(manifestPath, { localBaseDir: dir });

            expect(result.shouldApply).toBe(false);
            expect(result.changedFiles).not.toContain('registry/data-table/components/ui/table.tsx');

            const local = readFileSync(join(dir, 'registry', 'data-table', 'components', 'ui', 'table.tsx'), 'utf-8');
            expect(local).toBe('export const Table = () => <table />;'); // untouched
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('throws on an invalid manifest without writing partial changes', async () => {
        const dir = makeLocalDir(baselineTableSource);
        try {
            const manifestPath = join(dir, 'manifest.json');
            writeFileSync(
                manifestPath,
                JSON.stringify({
                    ...makeManifest(),
                    upstream: { ...makeManifest().upstream, baselineCommit: 'bad' },
                }),
            );
            await expect(applyChanges(manifestPath, { localBaseDir: dir })).rejects.toThrow(
                'manifest validation failed',
            );
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});

// ---------------------------------------------------------------------------
// buildPrTitle / buildPrBody
// ---------------------------------------------------------------------------

describe('shadcn-upstream-update: buildPrTitle / buildPrBody', () => {
    it('builds a conventional-commit title', () => {
        const proposal = { summary: { safeToApply: 1 } } as any;
        expect(buildPrTitle(proposal)).toMatch(/^chore:/);
        expect(buildPrTitle(proposal)).toContain('automated shadcn/ui upstream update');

        const many = { summary: { safeToApply: 3 } } as any;
        expect(buildPrTitle(many)).toContain('3 components');
    });

    it('builds a body that documents the proposal and review requirement', () => {
        const proposal = {
            checkedAt: '2026-01-01T00:00:00.000Z',
            upstream: {
                repository: 'shadcn-ui/ui',
                branch: 'main',
                baselineCommit: BASELINE_COMMIT,
                latestCommit: LATEST_COMMIT,
                style: 'new-york-v4',
            },
            summary: {
                total: 7, unchanged: 6, modified: 1, added: 0, removed: 0,
                unavailable: 0, manualReview: 0, safeToApply: 1, conflicts: 0, skipped: 0,
            },
            components: [
                {
                    name: 'table',
                    upstreamComponent: 'table',
                    status: 'modified',
                    latestCommit: LATEST_COMMIT,
                    differences: [
                        'component "TableCaption" renders <caption> locally but upstream does not render those elements',
                    ],
                    localModification: false,
                    localModificationDetail: null,
                    safeToApply: true,
                    skipReason: null,
                    error: null,
                },
            ],
        } as any;

        const body = buildPrBody(proposal);
        expect(body).toContain('Automated shadcn/ui upstream update proposal');
        expect(body).toContain('proposal only');
        expect(body).toContain(BASELINE_COMMIT);
        expect(body).toContain(LATEST_COMMIT);
        expect(body).toContain('human review');
        expect(body).toContain('protected-maintenance');
        expect(body).toContain('never approves, merges, or closes');
        expect(body).toContain('table');
    });
});

// ---------------------------------------------------------------------------
// Workflow security (static checks on the workflow file)
// ---------------------------------------------------------------------------

describe('shadcn-upstream-update: workflow security', () => {
    const workflow = readFileSync('.github/workflows/shadcn-upstream-update.yml', 'utf-8');

    it('uses least-privilege permissions (contents: write, pull-requests: write only)', () => {
        expect(workflow).toMatch(/permissions:/);
        expect(workflow).toMatch(/contents: write/);
        expect(workflow).toMatch(/pull-requests: write/);
        // No PAT secret or GitHub App is referenced; only GITHUB_TOKEN is used.
        expect(workflow).not.toMatch(/\$\{\{ secrets\./);
        expect(workflow).not.toMatch(/APP_ID/i);
    });

    it('triggers on a conservative schedule and workflow_dispatch', () => {
        expect(workflow).toMatch(/schedule:/);
        expect(workflow).toMatch(/cron: '0 9 \* \* 1'/);
        expect(workflow).toMatch(/workflow_dispatch:/);
    });

    it('targets the default branch and uses a dedicated automation branch', () => {
        expect(workflow).toMatch(/DEFAULT_BRANCH: main/);
        expect(workflow).toContain('origin/${DEFAULT_BRANCH}');
        expect(workflow).toMatch(/ci\/shadcn-upstream-update/);
    });

    it('uses concurrency control', () => {
        expect(workflow).toMatch(/concurrency:/);
        expect(workflow).toMatch(/cancel-in-progress: true/);
    });

    it('never auto-approves, auto-merges, or auto-closes pull requests', () => {
        expect(workflow).not.toMatch(/gh pr merge/);
        expect(workflow).not.toMatch(/gh pr close/);
        expect(workflow).not.toMatch(/auto-merge/i);
        expect(workflow).not.toMatch(/merge_method/);
        expect(workflow).not.toMatch(/MAINTENANCE_AUTHORIZED=true/);
    });

    it('prevents duplicate pull requests via the automation-owned branch', () => {
        expect(workflow).toMatch(/gh pr list/);
        expect(workflow).toMatch(/--head/);
        expect(workflow).toMatch(/--state open/);
        expect(workflow).toContain('git push -f origin "${UPDATE_BRANCH}"');
    });

    it('requires validation before a pull request is proposed', () => {
        expect(workflow).toMatch(/shadcn-compatibility-audit.js/);
        expect(workflow).toMatch(/check-shadcn-version.js/);
        expect(workflow).toMatch(/steps.detect.outputs.status == '3'/);
    });

    it('does not bypass protected maintenance authorization', () => {
        expect(workflow).toMatch(/protected-maintenance/);
        expect(workflow).toMatch(/maintenance: protected-component/);
        expect(workflow).not.toMatch(/MAINTENANCE_AUTHORIZED=true/);
    });
});
