import { describe, expect, it } from 'vitest';
import {
    EXPECTED_DATA_TABLE_FILES,
    EXPECTED_NPM_DEPENDENCIES,
    EXPECTED_REGISTRY_DEPENDENCIES,
    verifyConsumerProjectResolution,
    verifyGitHubRegistryAddress,
    verifyRegistryItemStructure,
} from '../../../../scripts/ci/verify-consumer-install.js';

describe('verify-consumer-install', () => {
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

        it('rejects invalid or non-github addresses', () => {
            expect(() => verifyGitHubRegistryAddress('not-a-valid-address')).toThrow();
        });
    });

    describe('verifyRegistryItemStructure', () => {
        it('contains all 11 expected data-table files with matching targets', async () => {
            const item = (await verifyRegistryItemStructure()) as {
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

        it('contains required npm dependencies', async () => {
            const item = (await verifyRegistryItemStructure()) as {
                dependencies: string[];
            };

            for (const dep of EXPECTED_NPM_DEPENDENCIES) {
                expect(item.dependencies).toContain(dep);
            }
        });

        it('declares required shadcn primitives as bare registry dependencies', async () => {
            const item = (await verifyRegistryItemStructure()) as {
                registryDependencies: string[];
            };

            for (const dep of EXPECTED_REGISTRY_DEPENDENCIES) {
                expect(item.registryDependencies).toContain(dep);
            }
        });
    });

    describe('verifyConsumerProjectResolution', () => {
        it('resolves tree with mocked or native fetch without CORS errors', async () => {
            // happy-dom intercepts window.fetch and enforces CORS for external URLs like ui.shadcn.com.
            // When executing in a browser-like DOM test runner, stub fetch to avoid unneeded network calls.
            const originalFetch = globalThis.fetch;
            const mockIndex = [
                { name: 'button', type: 'registry:ui' },
                { name: 'input', type: 'registry:ui' },
                { name: 'dropdown-menu', type: 'registry:ui' },
                { name: 'select', type: 'registry:ui' },
                { name: 'checkbox', type: 'registry:ui' },
                { name: 'table', type: 'registry:ui' },
                { name: 'skeleton', type: 'registry:ui' },
            ];

            try {
                globalThis.fetch = (async (url: string | URL | Request) => {
                    const urlStr = String(url);
                    if (urlStr.includes('ui.shadcn.com/r/index.json')) {
                        return new Response(JSON.stringify(mockIndex), {
                            status: 200,
                            headers: { 'Content-Type': 'application/json' },
                        });
                    }
                    if (urlStr.includes('ui.shadcn.com/r/styles/')) {
                        const name = urlStr.split('/').pop()?.replace('.json', '') ?? '';
                        return new Response(
                            JSON.stringify({
                                name,
                                type: 'registry:ui',
                                files: [{ path: `ui/${name}.tsx`, type: 'registry:ui' }],
                                dependencies: [],
                                registryDependencies: [],
                            }),
                            {
                                status: 200,
                                headers: { 'Content-Type': 'application/json' },
                            }
                        );
                    }
                    return originalFetch(url);
                }) as typeof globalThis.fetch;

                const tree = (await verifyConsumerProjectResolution()) as {
                    dependencies: string[];
                    files: Array<{ path: string }>;
                };

                expect(tree).toBeDefined();
                expect(tree.dependencies.some((d) => d.includes('@tanstack/react-table'))).toBe(true);
                expect(tree.dependencies.some((d) => d.includes('@inertiajs/react'))).toBe(true);
            } finally {
                globalThis.fetch = originalFetch;
            }
        });
    });
});
