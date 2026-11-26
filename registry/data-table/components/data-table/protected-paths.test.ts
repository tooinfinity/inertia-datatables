import { describe, expect, it } from 'vitest';
import {
    findProtectedChanges,
    isProtectedPath,
    parseChangedFiles,
    main as protectedPathsMain,
} from '../../../../scripts/ci/protected-paths.js';

// Build Git `--name-status -z` output: NUL-separated fields, e.g.
//   M\0path\0              (modify/add/delete)
//   R100\0old\0new\0       (rename/copy)
// Multiple changes concatenate: M\0p1\0A\0p2\0
function change(status: string, ...paths: string[]): string {
    return [status, ...paths].join('\0');
}

function gitZ(...changes: string[]): string {
    return changes.join('\0') + '\0';
}

describe('protected-paths: parseChangedFiles', () => {
    it('parses a modified file', () => {
        expect(
            parseChangedFiles(
                gitZ(
                    change(
                        'M',
                        'registry/data-table/components/data-table/data-table.tsx',
                    ),
                ),
            ),
        ).toEqual(['registry/data-table/components/data-table/data-table.tsx']);
    });

    it('parses an added file', () => {
        expect(
            parseChangedFiles(
                gitZ(change('A', 'registry/data-table/components/ui/checkbox.tsx')),
            ),
        ).toEqual(['registry/data-table/components/ui/checkbox.tsx']);
    });

    it('parses a deleted file', () => {
        expect(
            parseChangedFiles(
                gitZ(change('D', 'registry/data-table/components/ui/skeleton.tsx')),
            ),
        ).toEqual(['registry/data-table/components/ui/skeleton.tsx']);
    });

    it('parses a rename as both old and new paths', () => {
        expect(
            parseChangedFiles(
                gitZ(
                    change(
                        'R100',
                        'registry/data-table/components/ui/old.tsx',
                        'registry/data-table/components/ui/new.tsx',
                    ),
                ),
            ),
        ).toEqual([
            'registry/data-table/components/ui/old.tsx',
            'registry/data-table/components/ui/new.tsx',
        ]);
    });

    it('parses multiple changes concatenated', () => {
        expect(
            parseChangedFiles(
                gitZ(
                    change('M', 'README.md'),
                    change('A', 'registry/data-table/components/ui/button.tsx'),
                    change('D', 'registry/data-table/components/data-table/use-data-table.ts'),
                ),
            ),
        ).toEqual([
            'README.md',
            'registry/data-table/components/ui/button.tsx',
            'registry/data-table/components/data-table/use-data-table.ts',
        ]);
    });

    it('parses NUL-delimited output with a non-ASCII path', () => {
        expect(
            parseChangedFiles(
                gitZ(
                    change('A', 'registry/data-table/components/ui/café.tsx'),
                    change('M', 'registry/data-table/components/data-table/data-table.tsx'),
                ),
            ),
        ).toEqual([
            'registry/data-table/components/ui/café.tsx',
            'registry/data-table/components/data-table/data-table.tsx',
        ]);
    });

    it('parses a NUL-delimited rename with non-ASCII paths', () => {
        expect(
            parseChangedFiles(
                gitZ(
                    change(
                        'R100',
                        'registry/data-table/components/ui/é.tsx',
                        'registry/data-table/components/ui/è.tsx',
                    ),
                ),
            ),
        ).toEqual([
            'registry/data-table/components/ui/é.tsx',
            'registry/data-table/components/ui/è.tsx',
        ]);
    });

    it('returns an empty set for empty input', () => {
        expect(parseChangedFiles('')).toEqual([]);
        expect(parseChangedFiles('\0\0')).toEqual([]);
    });

    it('ignores fields that are not status codes', () => {
        expect(parseChangedFiles(gitZ(change('not-a-status', 'some-random-path')))).toEqual([]);
    });
});

describe('protected-paths: isProtectedPath', () => {
    it('returns true for files under components/ui/', () => {
        expect(isProtectedPath('registry/data-table/components/ui/table.tsx')).toBe(true);
        expect(isProtectedPath('registry/data-table/components/ui/input.tsx')).toBe(true);
    });

    it('returns false for package-owned DataTable components', () => {
        expect(isProtectedPath('registry/data-table/components/data-table/data-table.tsx')).toBe(false);
    });

    it('returns false for unrelated files', () => {
        expect(isProtectedPath('README.md')).toBe(false);
        expect(isProtectedPath('registry.json')).toBe(false);
    });
});

describe('protected-paths: findProtectedChanges', () => {
    it('allows ordinary DataTable component modification', () => {
        const input = gitZ(change('M', 'registry/data-table/components/data-table/data-table.tsx'));
        expect(findProtectedChanges(input)).toEqual([]);
    });

    it('allows unrelated documentation modification', () => {
        const input = gitZ(change('M', 'README.md'));
        expect(findProtectedChanges(input)).toEqual([]);
    });

    it('detects a protected compatibility shim modification', () => {
        const input = gitZ(change('M', 'registry/data-table/components/ui/button.tsx'));
        expect(findProtectedChanges(input)).toEqual([
            'registry/data-table/components/ui/button.tsx',
        ]);
    });

    it('detects a protected file addition', () => {
        const input = gitZ(change('A', 'registry/data-table/components/ui/checkbox.tsx'));
        expect(findProtectedChanges(input)).toEqual([
            'registry/data-table/components/ui/checkbox.tsx',
        ]);
    });

    it('detects a protected file deletion', () => {
        const input = gitZ(change('D', 'registry/data-table/components/ui/skeleton.tsx'));
        expect(findProtectedChanges(input)).toEqual([
            'registry/data-table/components/ui/skeleton.tsx',
        ]);
    });

    it('detects a protected file rename', () => {
        const input = gitZ(
            change(
                'R100',
                'registry/data-table/components/ui/dropdown-menu.tsx',
                'registry/data-table/components/ui/dropdown-menu.tsx.bak',
            ),
        );
        expect(findProtectedChanges(input)).toEqual([
            'registry/data-table/components/ui/dropdown-menu.tsx',
            'registry/data-table/components/ui/dropdown-menu.tsx.bak',
        ]);
    });

    it('detects a protected file type change (T status)', () => {
        const input = gitZ(change('T', 'registry/data-table/components/ui/button.tsx'));
        expect(findProtectedChanges(input)).toEqual([
            'registry/data-table/components/ui/button.tsx',
        ]);
    });

    it('reports only protected paths among mixed changes', () => {
        const input = gitZ(
            change('M', 'registry/data-table/components/data-table/use-data-table.ts'),
            change('M', 'registry/data-table/components/ui/select.tsx'),
            change('M', 'CHANGELOG.md'),
        );
        expect(findProtectedChanges(input)).toEqual([
            'registry/data-table/components/ui/select.tsx',
        ]);
    });
});

// ---------------------------------------------------------------------------
// main (authorization integration)
// ---------------------------------------------------------------------------

describe('protected-paths: main (authorization)', () => {
    // No authorization (ordinary PR)
    it('returns ok=true for unprotected changes with no authorization', () => {
        const input = gitZ(change('M', 'README.md'));
        const result = protectedPathsMain(input, {});
        expect(result.ok).toBe(true);
        expect(result.protectedChanges).toEqual([]);
    });

    it('returns ok=false for protected changes with no authorization', () => {
        const input = gitZ(change('M', 'registry/data-table/components/ui/table.tsx'));
        const result = protectedPathsMain(input, {});
        expect(result.ok).toBe(false);
        expect(result.protectedChanges).toEqual([
            'registry/data-table/components/ui/table.tsx',
        ]);
        expect(result.message).toMatch(/error: protected/);
        expect(result.message).toMatch(/maintenance: protected-component/);
    });

    it('returns ok=false when routing label is present but authorization env vars are absent', () => {
        // Simulates a PR with the label but the environment gate did not run.
        const input = gitZ(change('M', 'registry/data-table/components/ui/button.tsx'));
        const result = protectedPathsMain(input, {
            // No MAINTENANCE_AUTHORIZED — env gate did not run.
        });
        expect(result.ok).toBe(false);
        expect(result.message).toMatch(/error: protected/);
    });

    it('returns ok=false when MAINTENANCE_AUTHORIZED is set to something other than "true"', () => {
        const input = gitZ(change('M', 'registry/data-table/components/ui/button.tsx'));
        const result = protectedPathsMain(input, {
            MAINTENANCE_AUTHORIZED: 'yes',
            MAINTENANCE_AUTHORIZED_BY: 'tooinfinity',
            MAINTENANCE_AUTHORIZED_AT: '2024-01-01T00:00:00Z',
        });
        expect(result.ok).toBe(false);
    });

    it('returns ok=false when MAINTENANCE_AUTHORIZED=true but actor is missing', () => {
        const input = gitZ(change('M', 'registry/data-table/components/ui/input.tsx'));
        const result = protectedPathsMain(input, {
            MAINTENANCE_AUTHORIZED: 'true',
            MAINTENANCE_AUTHORIZED_AT: '2024-01-01T00:00:00Z',
        });
        expect(result.ok).toBe(false);
    });

    it('returns ok=false when MAINTENANCE_AUTHORIZED=true but timestamp is missing', () => {
        const input = gitZ(change('M', 'registry/data-table/components/ui/input.tsx'));
        const result = protectedPathsMain(input, {
            MAINTENANCE_AUTHORIZED: 'true',
            MAINTENANCE_AUTHORIZED_BY: 'tooinfinity',
        });
        expect(result.ok).toBe(false);
    });

    it('returns ok=true and authorized=true for valid authorization with protected changes', () => {
        const input = gitZ(change('M', 'registry/data-table/components/ui/table.tsx'));
        const result = protectedPathsMain(input, {
            MAINTENANCE_AUTHORIZED: 'true',
            MAINTENANCE_AUTHORIZED_BY: 'trusted-reviewer',
            MAINTENANCE_AUTHORIZED_AT: '2024-06-01T12:00:00Z',
        });
        expect(result.ok).toBe(true);
        expect(result.authorized).toBe(true);
        expect(result.protectedChanges).toEqual([
            'registry/data-table/components/ui/table.tsx',
        ]);
        expect(result.message).toMatch(/authorized/i);
        expect(result.message).toMatch(/trusted-reviewer/);
        expect(result.message).toMatch(/2024-06-01T12:00:00Z/);
    });

    it('records all protected paths in the authorized audit message for a mixed change', () => {
        const input = gitZ(
            change('M', 'registry/data-table/components/ui/button.tsx'),
            change('M', 'registry/data-table/components/ui/table.tsx'),
            change('M', 'README.md'),
        );
        const result = protectedPathsMain(input, {
            MAINTENANCE_AUTHORIZED: 'true',
            MAINTENANCE_AUTHORIZED_BY: 'tooinfinity',
            MAINTENANCE_AUTHORIZED_AT: '2024-11-26T01:00:00Z',
        });
        expect(result.ok).toBe(true);
        expect(result.authorized).toBe(true);
        // Both protected files appear, but not the unprotected one
        expect(result.protectedChanges).toContain(
            'registry/data-table/components/ui/button.tsx',
        );
        expect(result.protectedChanges).toContain(
            'registry/data-table/components/ui/table.tsx',
        );
        expect(result.protectedChanges).not.toContain('README.md');
    });

    it('returns ok=true for ordinary DataTable component modification with no authorization', () => {
        // Package-owned files are never blocked, authorization is irrelevant.
        const input = gitZ(
            change('M', 'registry/data-table/components/data-table/data-table.tsx'),
        );
        const result = protectedPathsMain(input, {});
        expect(result.ok).toBe(true);
        expect(result.authorized).toBeUndefined();
    });
});
