import { describe, expect, it } from 'vitest';
import {
    CONSUMER_CUSTOM_BUTTON_CONTENT,
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
        it('returns a boolean status indicating connectivity', async () => {
            const result = await checkNetworkAvailability(3000);
            expect(typeof result).toBe('boolean');
        });
    });

    describe('createConsumerFixture', () => {
        it('sets up a consumer directory with package.json, components.json, and preserved custom button', async () => {
            const dir = await mkdtemp(join(tmpdir(), 'fixture-unit-test-'));
            try {
                await createConsumerFixture(dir);
                const buttonContent = await readFile(join(dir, 'resources/js/components/ui/button.tsx'), 'utf8');
                expect(buttonContent).toBe(CONSUMER_CUSTOM_BUTTON_CONTENT);

                const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
                expect(pkg.name).toBe('consumer-integration-test');

                const componentsJson = JSON.parse(await readFile(join(dir, 'components.json'), 'utf8'));
                expect(componentsJson.aliases.components).toBe('@/components');
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
    });

    describe('testConsumerIntegration (lifecycle & network fallback)', () => {
        it('gracefully handles network availability without crashing when requireNetwork is false', async () => {
            // Test that when network is offline, it skips cleanly with { ok: true, skipped: true }
            const result = await testConsumerIntegration({ requireNetwork: false, timeoutMs: 90000 });
            expect(result.ok).toBe(true);
        }, 120000);
    });
});
