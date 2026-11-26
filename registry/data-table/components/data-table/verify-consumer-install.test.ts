import { describe, expect, it } from 'vitest';
import {
    EXPECTED_DATA_TABLE_FILES,
    EXPECTED_NPM_DEPENDENCIES,
    EXPECTED_REGISTRY_DEPENDENCIES,
    isDirectExecution,
    main,
    verifyGitHubRegistryAddress,
    verifyRegistryItemStructure,
    verifyRootRegistryManifest,
} from '../../../../scripts/ci/verify-consumer-install.js';

describe('verify-consumer-install (deterministic registry validation)', () => {
    describe('isDirectExecution', () => {
        it('returns false when evaluating an imported or arbitrary module URL', () => {
            expect(isDirectExecution(import.meta.url)).toBe(false);
        });

        it('returns false when process.argv is absent or different', () => {
            expect(isDirectExecution('file:///some/other/file.js')).toBe(false);
        });
    });

    describe('verifyGitHubRegistryAddress', () => {
        it('resolves the primary native GitHub command address', () => {
            const resolved = verifyGitHubRegistryAddress('tooinfinity/inertia-datatables/data-table');
            expect(resolved).toEqual({
                scheme: 'github',
                owner: 'tooinfinity',
                repo: 'inertia-datatables',
                item: 'data-table',
                ref: undefined,
            });
        });

        it('supports optional branch or ref', () => {
            const resolvedSuffix = verifyGitHubRegistryAddress('tooinfinity/inertia-datatables/data-table#feat/my-branch');
            expect(resolvedSuffix).toEqual({
                scheme: 'github',
                owner: 'tooinfinity',
                repo: 'inertia-datatables',
                item: 'data-table',
                ref: 'feat/my-branch',
            });

            const resolvedInfix = verifyGitHubRegistryAddress('tooinfinity/inertia-datatables#main/data-table');
            expect(resolvedInfix).toEqual({
                scheme: 'github',
                owner: 'tooinfinity',
                repo: 'inertia-datatables',
                item: 'data-table',
                ref: 'main',
            });
        });

        it('rejects invalid or non-github addresses', () => {
            expect(() => verifyGitHubRegistryAddress('not-a-valid-address')).toThrow();
            expect(() => verifyGitHubRegistryAddress('too/many/parts/here/item')).toThrow();
            expect(() => verifyGitHubRegistryAddress('wrong/repo/data-table')).toThrow();
        });
    });

    describe('verifyRootRegistryManifest', () => {
        it('validates that registry.json declares the data-table item', () => {
            const manifest = verifyRootRegistryManifest('registry.json') as {
                name: string;
                items: Array<{ name: string }>;
            };
            expect(manifest.name).toBe('inertia-datatables');
            expect(manifest.items.some((i) => i.name === 'data-table')).toBe(true);
        });

        it('throws when manifest does not exist', () => {
            expect(() => verifyRootRegistryManifest('non-existent.json')).toThrow();
        });
    });

    describe('verifyRegistryItemStructure', () => {
        it('contains all 11 expected data-table files with matching targets', () => {
            const item = verifyRegistryItemStructure('public/r/data-table.json') as {
                name: string;
                files: Array<{ path: string; target: string; type: string }>;
                dependencies: string[];
                registryDependencies: string[];
            };

            expect(item.name).toBe('data-table');
            expect(item.files.length).toBe(EXPECTED_DATA_TABLE_FILES.length);

            const filePaths = item.files.map((f) => f.path);
            for (const expected of EXPECTED_DATA_TABLE_FILES) {
                expect(filePaths).toContain(expected);
            }

            for (const file of item.files) {
                expect(file.target).toMatch(/^@components\/data-table\//);
            }
        });

        it('contains required npm dependencies', () => {
            const item = verifyRegistryItemStructure('public/r/data-table.json') as {
                dependencies: string[];
            };

            for (const dep of EXPECTED_NPM_DEPENDENCIES) {
                expect(item.dependencies).toContain(dep);
            }
        });

        it('declares required shadcn primitives as bare registry dependencies', () => {
            const item = verifyRegistryItemStructure('public/r/data-table.json') as {
                registryDependencies: string[];
            };

            for (const dep of EXPECTED_REGISTRY_DEPENDENCIES) {
                expect(item.registryDependencies).toContain(dep);
            }
        });

        it('throws when artifact path is missing', () => {
            expect(() => verifyRegistryItemStructure('public/r/missing-item.json')).toThrow();
        });
    });

    describe('main', () => {
        it('executes full deterministic validation successfully', () => {
            const result = main();
            expect(result).toEqual({ ok: true });
        });
    });
});
