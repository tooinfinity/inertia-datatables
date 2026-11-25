import { describe, expect, it } from 'vitest';
import {
    CONSUMER_CUSTOM_BUTTON_CONTENT,
    DEFAULT_CONSUMER_ALIASES,
    DEFAULT_TS_PATHS,
    assertInstalledConsumer,
    checkNetworkAvailability,
    createConsumerFixture,
    isDirectExecution,
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

    describe('checkNetworkAvailability', () => {
        it('returns a boolean status without throwing', async () => {
            // Test with a 100ms timeout against a local invalid port to verify deterministic boolean return
            const result = await checkNetworkAvailability(100);
            expect(typeof result).toBe('boolean');
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
