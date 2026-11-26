import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    findWorkflowVersions,
    checkVersionConsistency,
    buildDriftMessage,
    readPinnedVersion,
} from '../../../../scripts/ci/check-shadcn-version.js';

it('exits with a drift error when the workflow uses nonmatching CLI specifiers', () => {
    const script = resolve('scripts/ci/check-shadcn-version.js');
    const cwd = mkdtempSync(join(tmpdir(), 'shadcn-version-'));
    try {
        const workflows = join(cwd, '.github', 'workflows');
        mkdirSync(workflows, { recursive: true });
        writeFileSync(join(workflows, 'integration.yml'), [
            'bunx --bun shadcn@4.23.0 add',
            'pnpm dlx shadcn@latest add',
            'npx "shadcn@4.23.0-beta.1" add',
            'npx "shadcn@4.23.0 || 4.24.0" add',
        ].join('\n'));

        const result = spawnSync(process.execPath, [script], { cwd, encoding: 'utf8' });
        expect(result.status).toBe(1);
        expect(result.stderr).toContain('Line 2: shadcn@latest');
        expect(result.stderr).toContain('Line 3: shadcn@4.23.0-beta.1');
        expect(result.stderr).toContain('Line 4: shadcn@4.23.0 || 4.24.0');
        expect(result.stderr).not.toContain('Line 1:');
    } finally {
        rmSync(cwd, { recursive: true, force: true });
    }
});

it('exits with a validation failure when the integration workflow has no shadcn CLI references', () => {
    const script = resolve('scripts/ci/check-shadcn-version.js');
    const cwd = mkdtempSync(join(tmpdir(), 'shadcn-version-empty-'));
    try {
        const workflows = join(cwd, '.github', 'workflows');
        mkdirSync(workflows, { recursive: true });
        writeFileSync(join(workflows, 'integration.yml'), [
            'name: Integration',
            'jobs:',
            '  integration:',
            '    runs-on: ubuntu-latest',
            '    steps:',
            '      - run: echo "no shadcn cli here"',
        ].join('\n'));

        const result = spawnSync(process.execPath, [script], { cwd, encoding: 'utf8' });
        expect(result.status).toBe(1);
        expect(result.stderr).toContain('no expected shadcn CLI references');
    } finally {
        rmSync(cwd, { recursive: true, force: true });
    }
});

it('exits with a validation failure when the integration workflow mixes pinned and unversioned CLI invocations', () => {
    const script = resolve('scripts/ci/check-shadcn-version.js');
    const cwd = mkdtempSync(join(tmpdir(), 'shadcn-version-mixed-'));
    try {
        const workflows = join(cwd, '.github', 'workflows');
        mkdirSync(workflows, { recursive: true });
        writeFileSync(join(workflows, 'integration.yml'), [
            'bunx --bun shadcn@4.23.0 add "$REGISTRY_URL" --yes --overwrite',
            'bunx --bun shadcn add "$REGISTRY_URL" --yes --overwrite',
            '          shadcn add "$REGISTRY_URL" --yes --overwrite',
        ].join('\n'));

        const result = spawnSync(process.execPath, [script], { cwd, encoding: 'utf8' });
        expect(result.status).toBe(1);
        expect(result.stderr).toContain('Line 2: shadcn (missing version specifier)');
        expect(result.stderr).toContain('Line 3: shadcn (missing version specifier)');
        expect(result.stderr).not.toContain('Line 1:');
    } finally {
        rmSync(cwd, { recursive: true, force: true });
    }
});

// ---------------------------------------------------------------------------
// findWorkflowVersions
// ---------------------------------------------------------------------------

describe('check-shadcn-version: findWorkflowVersions', () => {
    it('finds a single shadcn@X.Y.Z reference', () => {
        const content = 'bunx --bun shadcn@4.23.0 add "$URL" --yes';
        const refs = findWorkflowVersions(content);
        expect(refs).toHaveLength(1);
        expect(refs[0]).toEqual({ version: '4.23.0', line: 1 });
    });

    it('finds multiple references on separate lines', () => {
        const content = [
            '          bunx --bun shadcn@4.22.0 add "$REGISTRY_URL" --yes --overwrite',
            '          pnpm dlx shadcn@4.22.0 add "$REGISTRY_URL" --yes --overwrite',
        ].join('\n');
        const refs = findWorkflowVersions(content);
        expect(refs).toHaveLength(2);
        expect(refs[0]).toEqual({ version: '4.22.0', line: 1 });
        expect(refs[1]).toEqual({ version: '4.22.0', line: 2 });
    });

    it('reports correct line numbers', () => {
        const content = ['', '', '          bunx --bun shadcn@4.23.0 add'].join('\n');
        const refs = findWorkflowVersions(content);
        expect(refs).toHaveLength(1);
        expect(refs[0].line).toBe(3);
    });

    it('returns an empty array when no shadcn@ references are present', () => {
        const content = 'pnpm dlx some-other-tool@1.2.3 add stuff';
        expect(findWorkflowVersions(content)).toEqual([]);
    });

    it('handles mixed versions in the same content', () => {
        const content = [
            'bunx --bun shadcn@4.22.0 add "$URL"',
            'pnpm dlx shadcn@4.23.0 add "$URL"',
        ].join('\n');
        const refs = findWorkflowVersions(content);
        expect(refs).toHaveLength(2);
        expect(refs[0].version).toBe('4.22.0');
        expect(refs[1].version).toBe('4.23.0');
    });
});

// ---------------------------------------------------------------------------
// checkVersionConsistency
// ---------------------------------------------------------------------------

describe('check-shadcn-version: checkVersionConsistency', () => {
    it('returns ok=true when all references match the pinned version', () => {
        const refs = [
            { version: '4.23.0', line: 1 },
            { version: '4.23.0', line: 2 },
        ];
        const result = checkVersionConsistency('4.23.0', refs);
        expect(result.ok).toBe(true);
        expect(result.mismatches).toEqual([]);
    });

    it('returns ok=false when any reference does not match the pinned version', () => {
        const refs = [
            { version: '4.22.0', line: 1 },
            { version: '4.22.0', line: 2 },
        ];
        const result = checkVersionConsistency('4.23.0', refs);
        expect(result.ok).toBe(false);
        expect(result.mismatches).toHaveLength(2);
    });

    it('reports only the mismatched references, not the matching ones', () => {
        const refs = [
            { version: '4.23.0', line: 1 },
            { version: '4.22.0', line: 2 },
        ];
        const result = checkVersionConsistency('4.23.0', refs);
        expect(result.ok).toBe(false);
        expect(result.mismatches).toHaveLength(1);
        expect(result.mismatches[0]).toEqual({ version: '4.22.0', line: 2 });
    });

    it('returns ok=false for an empty references list', () => {
        const result = checkVersionConsistency('4.23.0', []);
        expect(result.ok).toBe(false);
        expect(result.mismatches).toEqual([]);
    });

    it('detects stale 4.22.0 references against pinned 4.23.0 (the real drift scenario)', () => {
        // Mirrors the actual integration.yml before the fix.
        const refs = [
            { version: '4.22.0', line: 105 },
            { version: '4.22.0', line: 107 },
        ];
        const result = checkVersionConsistency('4.23.0', refs);
        expect(result.ok).toBe(false);
        expect(result.mismatches).toHaveLength(2);
    });
});

// ---------------------------------------------------------------------------
// buildDriftMessage
// ---------------------------------------------------------------------------

describe('check-shadcn-version: buildDriftMessage', () => {
    it('mentions the pinned version and the mismatched references', () => {
        const msg = buildDriftMessage(
            '4.23.0',
            [{ version: '4.22.0', line: 105 }],
            '.github/workflows/integration.yml',
        );
        expect(msg).toMatch(/4.23.0/);
        expect(msg).toMatch(/4.22.0/);
        expect(msg).toMatch(/Line 105/);
        expect(msg).toMatch(/integration\.yml/);
    });

    it('includes an actionable update instruction', () => {
        const msg = buildDriftMessage('4.23.0', [{ version: '4.22.0', line: 1 }], 'some.yml');
        expect(msg).toMatch(/shadcn@4.23.0/);
    });
});

// ---------------------------------------------------------------------------
// readPinnedVersion (integration with real package.json)
// ---------------------------------------------------------------------------

describe('check-shadcn-version: readPinnedVersion', () => {
    it('reads the shadcn version from package.json and returns a semver string', () => {
        const version = readPinnedVersion();
        // Must be a valid semver string such as "4.23.0"
        expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('returns 4.23.0 for the current pinned version', () => {
        // This test documents the current pinned version. Update it when the
        // version is intentionally bumped in package.json.
        expect(readPinnedVersion()).toBe('4.23.0');
    });
});
