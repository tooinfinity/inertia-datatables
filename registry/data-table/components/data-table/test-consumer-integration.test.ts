import { describe, expect, it } from 'vitest';
import {
    CONSUMER_CUSTOM_BUTTON_CONTENT,
    DEFAULT_CONSUMER_ALIASES,
    DEFAULT_TS_PATHS,
    assertInstalledConsumer,
    checkNetworkAvailability,
    createConsumerFixture,
    isDirectExecution,
    resolveTargetItemAddress,
    testConsumerIntegration,
} from '../../../../scripts/ci/test-consumer-integration.js';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('test-consumer-integration', () => {
    describe('isDirectExecution', () => {
        it('returns false when evaluating an imported or arbitrary module URL', () => {
            expect(isDirectExecution(import.meta.url)).toBe(false);
        });

        it('returns false when process.argv is absent or points elsewhere', () => {
            expect(isDirectExecution('file:///some/other/file.js')).toBe(false);
        });
    });

    describe('resolveTargetItemAddress', () => {
        it('returns explicitly provided custom address', () => {
            expect(resolveTargetItemAddress('custom/repo/data-table')).toBe('custom/repo/data-table');
        });

        it('returns ref address when GITHUB_HEAD_REF is set', () => {
            const originalHead = process.env.GITHUB_HEAD_REF;
            try {
                process.env.GITHUB_HEAD_REF = 'feat/my-pr-branch';
                expect(resolveTargetItemAddress()).toBe(
                    'tooinfinity/inertia-datatables/data-table#feat/my-pr-branch'
                );
            } finally {
                if (originalHead !== undefined) {
                    process.env.GITHUB_HEAD_REF = originalHead;
                } else {
                    delete process.env.GITHUB_HEAD_REF;
                }
            }
        });

        it('returns default item address when no ref environment variables are present', () => {
            const originalHead = process.env.GITHUB_HEAD_REF;
            const originalPr = process.env.PR_HEAD_REF;
            const originalAddr = process.env.REGISTRY_ITEM_ADDRESS;
            try {
                delete process.env.GITHUB_HEAD_REF;
                delete process.env.PR_HEAD_REF;
                delete process.env.REGISTRY_ITEM_ADDRESS;
                expect(resolveTargetItemAddress()).toBe('tooinfinity/inertia-datatables/data-table');
            } finally {
                if (originalHead !== undefined) process.env.GITHUB_HEAD_REF = originalHead;
                if (originalPr !== undefined) process.env.PR_HEAD_REF = originalPr;
                if (originalAddr !== undefined) process.env.REGISTRY_ITEM_ADDRESS = originalAddr;
            }
        });
    });

    describe('checkNetworkAvailability (unit with mock requestHandler)', () => {
        it('resolves true when request completes with 200 status', async () => {
            const mockHandler = ((_url: unknown, _options: unknown, cb?: (res: { statusCode: number }) => void) => {
                const req = {
                    on: () => req,
                    end: () => {
                        cb?.({ statusCode: 200 });
                    },
                    destroy: () => {},
                };
                return req;
            }) as unknown as typeof import('node:https').request;

            const isOnline = await checkNetworkAvailability(100, mockHandler);
            expect(isOnline).toBe(true);
        });

        it('resolves false when request encounters an error', async () => {
            const mockHandler = () => {
                const listeners: Record<string, Function> = {};
                const req = {
                    on: (event: string, fn: Function) => {
                        listeners[event] = fn;
                        return req;
                    },
                    end: () => {
                        listeners.error?.(new Error('Network error'));
                    },
                    destroy: () => {},
                };
                return req;
            };

            const isOnline = await checkNetworkAvailability(
                100,
                mockHandler as unknown as typeof import('node:https').request
            );
            expect(isOnline).toBe(false);
        });

        it('resolves false on timeout', async () => {
            const mockHandler = () => {
                const listeners: Record<string, Function> = {};
                const req = {
                    on: (event: string, fn: Function) => {
                        listeners[event] = fn;
                        return req;
                    },
                    end: () => {
                        listeners.timeout?.();
                    },
                    destroy: () => {},
                };
                return req;
            };

            const isOnline = await checkNetworkAvailability(
                100,
                mockHandler as unknown as typeof import('node:https').request
            );
            expect(isOnline).toBe(false);
        });
    });

    describe('createConsumerFixture', () => {
        it('sets up a consumer directory with default configuration', async () => {
            const dir = await mkdtemp(join(tmpdir(), 'fixture-unit-test-'));
            try {
                await createConsumerFixture(dir);
                const buttonContent = await readFile(join(dir, 'resources/js/components/ui/button.tsx'), 'utf8');
                expect(buttonContent).toBe(CONSUMER_CUSTOM_BUTTON_CONTENT);

                const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
                expect(pkg.name).toBe('consumer-integration-test');

                const componentsJson = JSON.parse(await readFile(join(dir, 'components.json'), 'utf8'));
                expect(componentsJson.aliases.components).toBe(DEFAULT_CONSUMER_ALIASES.components);

                const tsconfigJson = JSON.parse(await readFile(join(dir, 'tsconfig.json'), 'utf8'));
                expect(tsconfigJson.compilerOptions.paths).toEqual(DEFAULT_TS_PATHS);
            } finally {
                await rm(dir, { recursive: true, force: true });
            }
        });

        it('sets up a consumer directory with custom non-default aliases and paths', async () => {
            const dir = await mkdtemp(join(tmpdir(), 'fixture-custom-alias-'));
            const customAliases = {
                components: '@/shared/components',
                ui: '@/shared/components/ui',
                utils: '@/shared/lib/utils',
                lib: '@/shared/lib',
                hooks: '@/shared/hooks',
            };
            const customTsPaths = {
                '@/shared/*': ['./resources/js/shared/*'],
            };
            const customUiDir = 'resources/js/shared/components/ui';

            try {
                await createConsumerFixture(dir, {
                    aliases: customAliases,
                    tsPaths: customTsPaths,
                    uiDirRelative: customUiDir,
                });

                const buttonContent = await readFile(join(dir, customUiDir, 'button.tsx'), 'utf8');
                expect(buttonContent).toBe(CONSUMER_CUSTOM_BUTTON_CONTENT);

                const componentsJson = JSON.parse(await readFile(join(dir, 'components.json'), 'utf8'));
                expect(componentsJson.aliases).toEqual(customAliases);

                const tsconfigJson = JSON.parse(await readFile(join(dir, 'tsconfig.json'), 'utf8'));
                expect(tsconfigJson.compilerOptions.paths).toEqual(customTsPaths);
            } finally {
                await rm(dir, { recursive: true, force: true });
            }
        });
    });

    describe('assertInstalledConsumer', () => {
        it('fails assertion if consumer button was overwritten', async () => {
            const dir = await mkdtemp(join(tmpdir(), 'fixture-assert-fail-'));
            try {
                await createConsumerFixture(dir);
                // Intentionally overwrite custom button
                await rm(join(dir, 'resources/js/components/ui/button.tsx'));
                await expect(assertInstalledConsumer(dir)).rejects.toThrow();
            } finally {
                await rm(dir, { recursive: true, force: true });
            }
        });

        it('supports assertions on custom non-default directories', async () => {
            const dir = await mkdtemp(join(tmpdir(), 'fixture-assert-custom-fail-'));
            const customOptions = {
                componentsDirRelative: 'resources/js/shared/components/data-table',
                uiDirRelative: 'resources/js/shared/components/ui',
            };

            try {
                await createConsumerFixture(dir, {
                    uiDirRelative: customOptions.uiDirRelative,
                });
                // Button exists, but DataTable files are not yet installed
                await expect(assertInstalledConsumer(dir, customOptions)).rejects.toThrow(
                    'Expected installed DataTable file missing'
                );
            } finally {
                await rm(dir, { recursive: true, force: true });
            }
        });
    });

    describe('testConsumerIntegration (deterministic network handling)', () => {
        it('explicitly returns skipped: true when network is unavailable and requireNetwork is false', async () => {
            const result = await testConsumerIntegration({
                requireNetwork: false,
                networkCheck: async () => false,
            });

            expect(result).toEqual({
                ok: true,
                skipped: true,
                reason: 'network_unavailable',
            });
        });

        it('explicitly throws when network is unavailable and requireNetwork is true', async () => {
            await expect(
                testConsumerIntegration({
                    requireNetwork: true,
                    networkCheck: async () => false,
                })
            ).rejects.toThrow('Network access required for consumer integration test but raw.githubusercontent.com is unreachable.');
        });
    });
});
