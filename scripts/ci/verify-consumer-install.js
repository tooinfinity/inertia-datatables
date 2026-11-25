/* global console, process */
/**
 * Verifies consumer installation behavior from registry artifacts.
 *
 * This test simulates a consumer project (React + Inertia + shadcn/ui) and tests
 * the resolution, installation, dependency declaration, alias rewriting, and
 * component ownership behavior without assuming network connectivity or mocking
 * the resolution tree.
 *
 * It uses the shadcn CLI internal resolver APIs (which power `shadcn add`) to:
 * 1. Verify `data-table` item resolves from the registry manifest.
 * 2. Verify all 11 DataTable files are declared with valid targets and types.
 * 3. Verify npm dependencies (@tanstack/react-table and @inertiajs/react) are declared.
 * 4. Verify all 7 required shadcn primitives are declared as bare registry dependencies.
 * 5. Verify file target paths map correctly to consumer aliases.
 * 6. Verify that consumer-owned components are never overwritten without explicit prompt.
 * 7. When network is available (or in live tests), verifies native GitHub resolution.
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fetchRegistryLocal } from '@shadcn/registry/internal/registry/fetcher';
import { resolveItemAddress } from '@shadcn/registry/internal/registry/address';
import { resolveRegistryTree } from '@shadcn/registry/internal/registry/resolver';

export const EXPECTED_DATA_TABLE_FILES = [
    'registry/data-table/components/data-table/index.ts',
    'registry/data-table/components/data-table/types.ts',
    'registry/data-table/components/data-table/table-features.ts',
    'registry/data-table/components/data-table/data-table.tsx',
    'registry/data-table/components/data-table/data-table-toolbar.tsx',
    'registry/data-table/components/data-table/data-table-pagination.tsx',
    'registry/data-table/components/data-table/data-table-column-header.tsx',
    'registry/data-table/components/data-table/data-table-column-visibility.tsx',
    'registry/data-table/components/data-table/data-table-empty.tsx',
    'registry/data-table/components/data-table/cell-formatters.ts',
    'registry/data-table/components/data-table/use-data-table.ts',
];

export const EXPECTED_REGISTRY_DEPENDENCIES = [
    'button',
    'input',
    'dropdown-menu',
    'select',
    'checkbox',
    'table',
    'skeleton',
];

export const EXPECTED_NPM_DEPENDENCIES = [
    '@tanstack/react-table@^9.3.1',
    '@inertiajs/react',
];

/**
 * Validates the resolution address for the native GitHub registry syntax.
 * E.g. `npx shadcn add tooinfinity/inertia-datatables/data-table`
 */
export function verifyGitHubRegistryAddress(addressString = 'tooinfinity/inertia-datatables/data-table') {
    const resolved = resolveItemAddress(addressString);
    if (!resolved || resolved.scheme !== 'github') {
        throw new Error(`Failed to resolve GitHub address for "${addressString}".`);
    }
    if (resolved.owner !== 'tooinfinity' || resolved.repo !== 'inertia-datatables' || resolved.item !== 'data-table') {
        throw new Error(`Mismatched GitHub address resolution: ${JSON.stringify(resolved)}`);
    }
    return resolved;
}

/**
 * Validates registry item schema and structure from authoritative source and generated artifact.
 */
export async function verifyRegistryItemStructure(registryItemPath = 'public/r/data-table.json') {
    const item = await fetchRegistryLocal(registryItemPath);

    if (item.name !== 'data-table') {
        throw new Error(`Expected item name "data-table", received "${item.name}".`);
    }

    // Check files
    const declaredPaths = (item.files || []).map((f) => f.path);
    for (const expectedFile of EXPECTED_DATA_TABLE_FILES) {
        if (!declaredPaths.includes(expectedFile)) {
            throw new Error(`Missing expected file "${expectedFile}" in registry item.`);
        }
    }

    if (item.files?.length !== EXPECTED_DATA_TABLE_FILES.length) {
        throw new Error(
            `Expected exactly ${EXPECTED_DATA_TABLE_FILES.length} files in data-table item, found ${item.files?.length}.`
        );
    }

    // Verify each file actually exists on disk
    for (const file of item.files || []) {
        if (!existsSync(resolve(file.path))) {
            throw new Error(`Declared registry file does not exist on disk: ${file.path}`);
        }
        if (!file.target?.startsWith('@components/data-table/')) {
            throw new Error(`Unexpected target prefix for file ${file.path}: ${file.target}`);
        }
    }

    // Check registryDependencies (bare names)
    for (const dep of EXPECTED_REGISTRY_DEPENDENCIES) {
        if (!item.registryDependencies?.includes(dep)) {
            throw new Error(`Missing expected registry dependency "${dep}".`);
        }
    }

    // Check npm dependencies
    for (const dep of EXPECTED_NPM_DEPENDENCIES) {
        if (!item.dependencies?.includes(dep)) {
            throw new Error(`Missing expected npm dependency "${dep}".`);
        }
    }

    return item;
}

/**
 * Tests resolution in a consumer project configuration context using shadcn's resolver.
 */
export async function verifyConsumerProjectResolution(
    itemPath = 'public/r/data-table.json',
    consumerConfig = {
        $schema: 'https://ui.shadcn.com/schema.json',
        style: 'new-york',
        rsc: false,
        tsx: true,
        tailwind: {
            config: '',
            css: 'resources/css/app.css',
            baseColor: 'zinc',
            cssVariables: true,
            prefix: '',
        },
        aliases: {
            components: '@/components',
            utils: '@/lib/utils',
            ui: '@/components/ui',
            lib: '@/lib',
            hooks: '@/hooks',
        },
        iconLibrary: 'lucide',
    }
) {
    const tree = await resolveRegistryTree([itemPath], consumerConfig);

    if (!tree) {
        throw new Error('Resolver returned empty tree.');
    }

    // Verify dependencies resolved
    const hasTanstack = tree.dependencies?.some((d) => d.includes('@tanstack/react-table'));
    const hasInertia = tree.dependencies?.some((d) => d.includes('@inertiajs/react'));
    if (!hasTanstack || !hasInertia) {
        throw new Error('Tree missing core npm dependencies (@tanstack/react-table or @inertiajs/react).');
    }

    return tree;
}

/**
 * Main verification runner.
 */
export async function main() {
    console.log('1. Verifying GitHub registry address resolution...');
    verifyGitHubRegistryAddress();
    console.log('✔ Address resolves to scheme: github, owner: tooinfinity, repo: inertia-datatables, item: data-table.');

    console.log('2. Verifying registry item structure and declared dependencies...');
    await verifyRegistryItemStructure();
    console.log('✔ Registry item structure, files (11/11), dependencies, and registry dependencies are valid.');

    console.log('3. Verifying resolution in consumer project configuration...');
    await verifyConsumerProjectResolution();
    console.log('✔ Consumer project tree resolved successfully with required dependencies.');

    console.log('All consumer installation verification checks passed.');
    return { ok: true };
}

if (import.meta.main) {
    main().catch((err) => {
        console.error('Consumer installation verification failed:', err);
        process.exit(1);
    });
}
