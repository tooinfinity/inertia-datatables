import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, chmodSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
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

    it('returns true when source differs in className, props, or event handlers despite matching structure', () => {
        const structure = new Map([['Table', new Set(['table'])]]);
        const baselineSrc = 'export function Table(props) { return <table className="w-full" {...props} />; }';
        const customizedSrc = 'export function Table(props) { return <table className="w-full custom-border" onClick={props.onClick} {...props} />; }';

        const result = hasLocalModification(structure, structure, customizedSrc, baselineSrc);
        expect(result.modified).toBe(true);
        expect(result.detail).toContain('source differs');
    });

    it('returns false when source matches baseline with only line-ending or trailing-whitespace differences', () => {
        const structure = new Map([['Table', new Set(['table'])]]);
        const baselineSrc = 'export function Table(props) {\n  return <table {...props} />;\n}\n';
        const localSrc = 'export function Table(props) {\r\n  return <table {...props} />;\r\n}';

        expect(hasLocalModification(structure, structure, localSrc, baselineSrc)).toEqual({
            modified: false,
            detail: null,
        });
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

    it('treats an untouched local table (matching its pinned local baseline) as safe to apply even though it differs from the upstream source', async () => {
        // The real local table.tsx is intentionally simplified vs upstream (no
        // cn(), no wrapper div). It is identical to its pinned local baseline,
        // so it carries no local customizations and must be eligible for
        // automatic update even though it does not match the upstream source.
        const dir = mkdtempSync(join(tmpdir(), 'shadcn-update-table-baseline-'));
        const uiDir = join(dir, 'registry', 'data-table', 'components', 'ui');
        const baselineDir = join(dir, 'scripts', 'ci', 'shadcn-compatibility-baselines');
        mkdirSync(uiDir, { recursive: true });
        mkdirSync(baselineDir, { recursive: true });

        const realTableSource = readFileSync(
            join(process.cwd(), 'registry', 'data-table', 'components', 'ui', 'table.tsx'),
            'utf-8',
        );
        writeFileSync(join(uiDir, 'table.tsx'), realTableSource, 'utf-8');
        writeFileSync(join(baselineDir, 'table.tsx'), realTableSource, 'utf-8');

        try {
            // A manifest where the table component declares its pinned local
            // baseline. The local shim matches this baseline exactly.
            const manifest = makeManifest({ baselineCommit: BASELINE_COMMIT });
            const table = manifest.components.find((c) => c.name === 'table')! as { localBaselinePath?: string };
            table.localBaselinePath = 'scripts/ci/shadcn-compatibility-baselines/table.tsx';

            mockFetch(makeFetchHandler(
                { table: baselineTableSource },
                { table: latestTableSourceAddedCaption },
            ));

            const proposal = await detectAndPropose(manifest, { localBaseDir: dir });

            expect(proposal.error).toBeNull();
            const tableResult = proposal.components.find((c) => c.name === 'table')!;
            expect(tableResult.status).toBe('modified'); // upstream added TableCaption
            expect(tableResult.differences.length).toBeGreaterThan(0);
            expect(tableResult.localModification).toBe(false); // matches pinned local baseline
            expect(tableResult.localModificationDetail).toBeNull();
            expect(tableResult.safeToApply).toBe(true);
            expect(proposal.shouldCreatePr).toBe(true);
            expect(proposal.summary.safeToApply).toBe(1);
            // The 6 manual role-equivalent shims are skipped/conflict; the table
            // itself is not a conflict.
            expect(proposal.summary.conflicts).toBe(6);
            expect(proposal.summary.skipped).toBe(6);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('treats a customized local table (differing from its pinned local baseline) as a conflict and does not propose it', async () => {
        // A local table that has been customized relative to its pinned local
        // baseline must not be silently overwritten by an upstream update.
        const dir = mkdtempSync(join(tmpdir(), 'shadcn-update-table-custom-'));
        const uiDir = join(dir, 'registry', 'data-table', 'components', 'ui');
        const baselineDir = join(dir, 'scripts', 'ci', 'shadcn-compatibility-baselines');
        mkdirSync(uiDir, { recursive: true });
        mkdirSync(baselineDir, { recursive: true });

        const realTableSource = readFileSync(
            join(process.cwd(), 'registry', 'data-table', 'components', 'ui', 'table.tsx'),
            'utf-8',
        );
        // Pinned local baseline: the untouched real table.
        writeFileSync(join(baselineDir, 'table.tsx'), realTableSource, 'utf-8');
        // Local shim: customized (extra className).
        writeFileSync(
            join(uiDir, 'table.tsx'),
            realTableSource.replace('<table ', '<table className="custom" '),
            'utf-8',
        );

        try {
            const manifest = makeManifest({ baselineCommit: BASELINE_COMMIT });
            const table = manifest.components.find((c) => c.name === 'table')! as { localBaselinePath?: string };
            table.localBaselinePath = 'scripts/ci/shadcn-compatibility-baselines/table.tsx';

            mockFetch(makeFetchHandler(
                { table: baselineTableSource },
                { table: latestTableSourceAddedCaption },
            ));

            const proposal = await detectAndPropose(manifest, { localBaseDir: dir });

            expect(proposal.error).toBeNull();
            const tableResult = proposal.components.find((c) => c.name === 'table')!;
            expect(tableResult.localModification).toBe(true);
            expect(tableResult.localModificationDetail).toContain('source differs');
            expect(tableResult.safeToApply).toBe(false);
            expect(proposal.shouldCreatePr).toBe(false);
            expect(proposal.summary.safeToApply).toBe(0);
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
            expect(result.proposal.shouldCreatePr).toBe(false);
            expect(result.proposal.upstream.latestCommit).toBe(LATEST_COMMIT);
            expect(result.proposal.summary.modified).toBeGreaterThan(0);
            expect(result.proposal.summary.conflicts).toBeGreaterThan(0);

            const local = readFileSync(join(dir, 'registry', 'data-table', 'components', 'ui', 'table.tsx'), 'utf-8');
            expect(local).toBe('export const Table = () => <table />;'); // untouched
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('preserves local shims with className or prop customizations even when structure matches baseline', async () => {
        const customizedSource = baselineTableSource.replace(
            '<div data-slot="table-container">',
            '<div data-slot="table-container" className="custom-table">',
        );
        const dir = makeLocalDir(customizedSource);
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
            expect(result.changedFiles).toEqual([]);
            const table = result.proposal.components.find((c) => c.name === 'table')!;
            expect(table.localModification).toBe(true);
            expect(table.safeToApply).toBe(false);

            const local = readFileSync(join(dir, 'registry', 'data-table', 'components', 'ui', 'table.tsx'), 'utf-8');
            expect(local).toBe(customizedSource);
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
        expect(body).toContain('npm test');
        expect(body).toContain('npm run lint');
        expect(body).toContain('npm run typecheck');
        expect(body).toContain('registry:validate');
        expect(body).toContain('registry:verify-consumer');
        expect(body).toContain('registry:build');
        expect(body).toContain('public/r');
        expect(body).not.toContain('artifacts are not modified');
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

    it('rebuilds registry artifacts before committing and uses supported gh CLI flags', () => {
        expect(workflow).toContain('npm run registry:validate');
        expect(workflow).toContain('npm run registry:build');
        expect(workflow).toContain('npm run registry:verify-consumer');
        expect(workflow).toContain('npm test');
        expect(workflow).toContain('npm run lint');
        expect(workflow).toContain('npm run typecheck');
        expect(workflow).toContain('|| status=$?');
        expect(workflow).toContain('gh pr edit "$existing"');
        expect(workflow).toContain('--title "${pr_title}"');
        expect(workflow).not.toContain('--title-file');
        expect(workflow).toContain('gh label list');
        expect(workflow).not.toContain('gh label view');
        expect(workflow).not.toContain('>/dev/null 2>&1 || true');
    });
});

// ---------------------------------------------------------------------------
// Workflow integration tests (executes extracted YAML steps in temp git repo)
// ---------------------------------------------------------------------------

function extractWorkflowStepRun(workflowYaml: string, stepName: string): string {
    const lines = workflowYaml.split('\n');
    const stepHeader = `      - name: ${stepName}`;
    const startIdx = lines.findIndex((line) => line.trimEnd() === stepHeader);
    if (startIdx === -1) {
        throw new Error(`Workflow step not found: ${stepName}`);
    }

    let runIdx = -1;
    for (let i = startIdx + 1; i < lines.length; i += 1) {
        if (lines[i].startsWith('      - name:')) {
            break;
        }
        if (lines[i].trim() === 'run: |') {
            runIdx = i + 1;
            break;
        }
    }
    if (runIdx === -1) {
        throw new Error(`run: | block not found for step: ${stepName}`);
    }

    const scriptLines: string[] = [];
    for (let i = runIdx; i < lines.length; i += 1) {
        const line = lines[i];
        if (line.startsWith('      - name:') || (/^\s{6}[a-z-]+:/.test(line) && !line.startsWith('          '))) {
            break;
        }
        if (line === '') {
            scriptLines.push('');
        } else if (line.startsWith('          ')) {
            scriptLines.push(line.slice(10));
        } else {
            break;
        }
    }
    return scriptLines.join('\n').trim() + '\n';
}

function setupWorkflowTestRepo() {
    const root = mkdtempSync(join(tmpdir(), 'shadcn-workflow-test-'));
    const originDir = join(root, 'origin.git');
    const workDir = join(root, 'work');
    const binDir = join(root, 'bin');
    const githubOutput = join(root, 'github_output.txt');
    const ghLog = join(root, 'gh.log');
    const titleFile = join(root, 'pr-title.txt');
    const bodyFile = join(root, 'pr-body.txt');

    mkdirSync(binDir, { recursive: true });
    writeFileSync(githubOutput, '', 'utf-8');
    writeFileSync(ghLog, '', 'utf-8');
    writeFileSync(titleFile, 'chore: automated shadcn/ui upstream update (1 component)\n', 'utf-8');
    writeFileSync(bodyFile, 'Automated proposal body\n', 'utf-8');

    execFileSync('git', ['init', '--bare', '--initial-branch=main', originDir]);
    execFileSync('git', ['clone', originDir, workDir]);
    execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: workDir });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: workDir });
    execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: workDir });

    mkdirSync(join(workDir, 'registry/data-table/components/ui'), { recursive: true });
    mkdirSync(join(workDir, 'public/r'), { recursive: true });
    writeFileSync(
        join(workDir, 'registry/data-table/components/ui/table.tsx'),
        'export const Table = () => <table />;\n',
        'utf-8',
    );
    writeFileSync(join(workDir, 'public/r/data-table.json'), '{"name":"data-table"}\n', 'utf-8');
    execFileSync('git', ['add', '-A'], { cwd: workDir });
    execFileSync('git', ['commit', '-m', 'chore: initial'], { cwd: workDir });
    execFileSync('git', ['push', '-u', 'origin', 'main'], { cwd: workDir });

    return { root, originDir, workDir, binDir, githubOutput, ghLog, titleFile, bodyFile };
}

function installMockGh(
    binDir: string,
    ghLog: string,
    options: {
        existingPr?: string;
        createdPrNumber?: string;
        labels?: string[];
        attachedLabels?: string[];
    } = {},
) {
    const stateFile = join(binDir, 'gh-state.json');
    writeFileSync(
        stateFile,
        JSON.stringify({
            prNumber: options.existingPr ?? '',
            createdPrNumber: options.createdPrNumber ?? '42',
            labels: options.labels ?? ['maintenance: protected-component'],
            attachedLabels: options.attachedLabels ?? null,
        }),
        'utf-8',
    );

    const ghScript = `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(ghLog)}, JSON.stringify(args) + '\\n');
const state = JSON.parse(fs.readFileSync(${JSON.stringify(stateFile)}, 'utf-8'));

if (args[0] === 'pr' && args[1] === 'list') {
  if (state.prNumber) {
    process.stdout.write(state.prNumber + '\\n');
  }
  process.exit(0);
}
if (args[0] === 'pr' && args[1] === 'create') {
  state.prNumber = state.createdPrNumber;
  fs.writeFileSync(${JSON.stringify(stateFile)}, JSON.stringify(state));
  process.exit(0);
}
if (args[0] === 'pr' && args[1] === 'edit') {
  const addLabelIdx = args.indexOf('--add-label');
  if (addLabelIdx !== -1 && state.attachedLabels === null) {
    state.attachedLabels = [args[addLabelIdx + 1]];
    fs.writeFileSync(${JSON.stringify(stateFile)}, JSON.stringify(state));
  }
  process.exit(0);
}
if (args[0] === 'pr' && args[1] === 'view') {
  const out = state.attachedLabels ?? [];
  for (const l of out) process.stdout.write(l + '\\n');
  process.exit(0);
}
if (args[0] === 'label' && args[1] === 'list') {
  for (const l of state.labels) process.stdout.write(l + '\\n');
  process.exit(0);
}
process.exit(1);
`;
    const ghPath = join(binDir, 'gh');
    writeFileSync(ghPath, ghScript, 'utf-8');
    chmodSync(ghPath, 0o755);
}

function runWorkflowStep(
    workflowYaml: string,
    stepName: string,
    workDir: string,
    env: Record<string, string>,
) {
    const script = extractWorkflowStepRun(workflowYaml, stepName);
    return spawnSync('bash', ['-e', '-c', script], {
        cwd: workDir,
        env: { ...process.env, ...env },
        encoding: 'utf-8',
    });
}

describe('shadcn-upstream-update: workflow integration', () => {
    const workflow = readFileSync('.github/workflows/shadcn-upstream-update.yml', 'utf-8');

    it('creates branch, commits, pushes, opens a new PR, and routes protected changes', () => {
        const ctx = setupWorkflowTestRepo();
        try {
            installMockGh(ctx.binDir, ctx.ghLog, {
                existingPr: '',
                createdPrNumber: '42',
                labels: ['maintenance: protected-component'],
            });

            const baseEnv = {
                PATH: `${ctx.binDir}:${process.env.PATH}`,
                GITHUB_OUTPUT: ctx.githubOutput,
                UPDATE_BRANCH: 'ci/shadcn-upstream-update',
                DEFAULT_BRANCH: 'main',
                PR_TITLE_FILE: ctx.titleFile,
                PR_BODY_FILE: ctx.bodyFile,
                GH_TOKEN: 'test-token',
                UPDATE_PR_LABEL: 'maintenance: protected-component',
            };

            const branchRes = runWorkflowStep(workflow, 'Create update branch', ctx.workDir, baseEnv);
            expect(branchRes.status).toBe(0);

            writeFileSync(
                join(ctx.workDir, 'registry/data-table/components/ui/table.tsx'),
                'export const Table = () => <table data-updated="true" />;\n',
                'utf-8',
            );

            const commitRes = runWorkflowStep(workflow, 'Commit proposed changes', ctx.workDir, baseEnv);
            expect(commitRes.status).toBe(0);

            const outputs = readFileSync(ctx.githubOutput, 'utf-8');
            const commitSha = outputs.match(/commit_sha=([0-9a-f]+)/)?.[1] ?? '';
            expect(commitSha).toMatch(/^[0-9a-f]{40}$/);

            const pushRes = runWorkflowStep(workflow, 'Push update branch', ctx.workDir, {
                ...baseEnv,
                EXPECTED_COMMIT: commitSha,
            });
            expect(pushRes.status).toBe(0);

            const remoteHead = execFileSync(
                'git',
                ['--git-dir', ctx.originDir, 'rev-parse', 'refs/heads/ci/shadcn-upstream-update'],
                { encoding: 'utf-8' },
            ).trim();
            expect(remoteHead).toBe(commitSha);

            const prRes = runWorkflowStep(workflow, 'Create or update pull request', ctx.workDir, baseEnv);
            expect(prRes.status).toBe(0);

            const prNumber = readFileSync(ctx.githubOutput, 'utf-8').match(/pr_number=(\d+)/)?.[1] ?? '';
            expect(prNumber).toBe('42');

            const routeRes = runWorkflowStep(
                workflow,
                'Route protected changes to maintenance authorization',
                ctx.workDir,
                { ...baseEnv, PR_NUMBER: prNumber },
            );
            expect(routeRes.status).toBe(0);

            const ghCalls = readFileSync(ctx.ghLog, 'utf-8')
                .trim()
                .split('\n')
                .map((line) => JSON.parse(line) as string[]);
            expect(ghCalls.some((c) => c[0] === 'pr' && c[1] === 'create' && c.includes('--title'))).toBe(true);
            expect(ghCalls.some((c) => c[0] === 'pr' && c[1] === 'edit' && c.includes('--add-label'))).toBe(true);
            expect(ghCalls.some((c) => c[0] === 'pr' && c[1] === 'view')).toBe(true);
        } finally {
            rmSync(ctx.root, { recursive: true, force: true });
        }
    });

    it('updates an existing open PR instead of creating a duplicate', () => {
        const ctx = setupWorkflowTestRepo();
        try {
            installMockGh(ctx.binDir, ctx.ghLog, { existingPr: '99' });

            const res = runWorkflowStep(workflow, 'Create or update pull request', ctx.workDir, {
                PATH: `${ctx.binDir}:${process.env.PATH}`,
                GITHUB_OUTPUT: ctx.githubOutput,
                UPDATE_BRANCH: 'ci/shadcn-upstream-update',
                DEFAULT_BRANCH: 'main',
                PR_TITLE_FILE: ctx.titleFile,
                PR_BODY_FILE: ctx.bodyFile,
                GH_TOKEN: 'test-token',
            });
            expect(res.status).toBe(0);
            expect(readFileSync(ctx.githubOutput, 'utf-8')).toContain('pr_number=99');

            const ghCalls = readFileSync(ctx.ghLog, 'utf-8')
                .trim()
                .split('\n')
                .map((line) => JSON.parse(line) as string[]);
            expect(ghCalls.some((c) => c[0] === 'pr' && c[1] === 'edit' && c[2] === '99' && c.includes('--title'))).toBe(true);
            expect(ghCalls.some((c) => c[0] === 'pr' && c[1] === 'create')).toBe(false);
        } finally {
            rmSync(ctx.root, { recursive: true, force: true });
        }
    });

    it('fails on empty commit, failing git commit hook, and refuses to push without expected commit', () => {
        const ctx = setupWorkflowTestRepo();
        try {
            const baseEnv = {
                GITHUB_OUTPUT: ctx.githubOutput,
                UPDATE_BRANCH: 'ci/shadcn-upstream-update',
                DEFAULT_BRANCH: 'main',
            };

            // 1. Empty index
            const emptyCommit = runWorkflowStep(workflow, 'Commit proposed changes', ctx.workDir, baseEnv);
            expect(emptyCommit.status).not.toBe(0);
            expect(emptyCommit.stdout + emptyCommit.stderr).toContain('index is empty');

            // 2. Failing pre-commit hook (commit failure must not be suppressed)
            writeFileSync(
                join(ctx.workDir, 'registry/data-table/components/ui/table.tsx'),
                'export const Table = () => <table data-changed="1" />;\n',
                'utf-8',
            );
            const hookPath = join(ctx.workDir, '.git/hooks/pre-commit');
            writeFileSync(hookPath, '#!/usr/bin/env bash\necho "hook failed" >&2\nexit 1\n', 'utf-8');
            chmodSync(hookPath, 0o755);

            const failedCommit = runWorkflowStep(workflow, 'Commit proposed changes', ctx.workDir, baseEnv);
            expect(failedCommit.status).not.toBe(0);
            expect(failedCommit.stderr).toContain('hook failed');

            // 3. Push refuses when EXPECTED_COMMIT is missing or equals origin/main
            const refusedPush = runWorkflowStep(workflow, 'Push update branch', ctx.workDir, {
                ...baseEnv,
                EXPECTED_COMMIT: '',
            });
            expect(refusedPush.status).not.toBe(0);
            expect(refusedPush.stdout + refusedPush.stderr).toContain('Refusing to push');
        } finally {
            rmSync(ctx.root, { recursive: true, force: true });
        }
    });

    it('fails routing when protected paths are modified and the maintenance label is missing or unverified', () => {
        const ctx = setupWorkflowTestRepo();
        try {
            execFileSync('git', ['checkout', '-B', 'ci/shadcn-upstream-update', 'origin/main'], { cwd: ctx.workDir });
            writeFileSync(
                join(ctx.workDir, 'registry/data-table/components/ui/table.tsx'),
                'export const Table = () => <table data-protected-change="1" />;\n',
                'utf-8',
            );
            execFileSync('git', ['add', '-A'], { cwd: ctx.workDir });
            execFileSync('git', ['commit', '-m', 'chore: update table'], { cwd: ctx.workDir });

            // 1. Missing label -> must fail explicitly
            installMockGh(ctx.binDir, ctx.ghLog, { labels: [] });
            const missingLabel = runWorkflowStep(
                workflow,
                'Route protected changes to maintenance authorization',
                ctx.workDir,
                {
                    PATH: `${ctx.binDir}:${process.env.PATH}`,
                    GH_TOKEN: 'test-token',
                    UPDATE_PR_LABEL: 'maintenance: protected-component',
                    DEFAULT_BRANCH: 'main',
                    PR_NUMBER: '42',
                },
            );
            expect(missingLabel.status).not.toBe(0);
            expect(missingLabel.stdout + missingLabel.stderr).toContain('does not exist');

            // 2. Label exists, but verification via gh pr view shows it was not attached -> must fail
            installMockGh(ctx.binDir, ctx.ghLog, {
                labels: ['maintenance: protected-component'],
                attachedLabels: [],
            });
            const unverified = runWorkflowStep(
                workflow,
                'Route protected changes to maintenance authorization',
                ctx.workDir,
                {
                    PATH: `${ctx.binDir}:${process.env.PATH}`,
                    GH_TOKEN: 'test-token',
                    UPDATE_PR_LABEL: 'maintenance: protected-component',
                    DEFAULT_BRANCH: 'main',
                    PR_NUMBER: '42',
                },
            );
            expect(unverified.status).not.toBe(0);
            expect(unverified.stdout + unverified.stderr).toContain('Failed to verify');
        } finally {
            rmSync(ctx.root, { recursive: true, force: true });
        }
    });

    it('fails validation step when a frontend quality gate fails and passes when all gates succeed', () => {
        const ctx = setupWorkflowTestRepo();
        try {
            const installMockNpmAndNode = (failCommand: string | null) => {
                const npmPath = join(ctx.binDir, 'npm');
                writeFileSync(
                    npmPath,
                    `#!/usr/bin/env bash
cmd="$*"
if [ "$cmd" = "${failCommand}" ]; then
  echo "mocked failure: $cmd" >&2
  exit 1
fi
exit 0
`,
                    'utf-8',
                );
                chmodSync(npmPath, 0o755);

                const nodePath = join(ctx.binDir, 'node');
                writeFileSync(nodePath, '#!/usr/bin/env bash\nexit 0\n', 'utf-8');
                chmodSync(nodePath, 0o755);
            };

            installMockNpmAndNode('run lint');
            const failedValidation = runWorkflowStep(workflow, 'Validate proposed changes', ctx.workDir, {
                PATH: `${ctx.binDir}:${process.env.PATH}`,
            });
            expect(failedValidation.status).not.toBe(0);
            expect(failedValidation.stderr).toContain('mocked failure: run lint');

            installMockNpmAndNode(null);
            const passedValidation = runWorkflowStep(workflow, 'Validate proposed changes', ctx.workDir, {
                PATH: `${ctx.binDir}:${process.env.PATH}`,
            });
            expect(passedValidation.status).toBe(0);
        } finally {
            rmSync(ctx.root, { recursive: true, force: true });
        }
    });
});
