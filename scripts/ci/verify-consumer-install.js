/* global console, process */
/**
 * Deterministic validation of the generated registry artifacts and manifest.
 *
 * Verifies:
 * 1. Root registry.json manifest syntax and data-table item declaration.
 * 2. Generated public/r/data-table.json artifact matches expected structure.
 * 3. All 11 package-owned files exist on disk and have @components/data-table/ targets.
 * 4. Required npm dependencies (@tanstack/react-table and @inertiajs/react) are declared.
 * 5. Required bare shadcn primitives (button, input, dropdown-menu, select, checkbox, table, skeleton)
 *    are declared as bare registry dependencies.
 * 6. Native GitHub registry address format (tooinfinity/inertia-datatables/data-table) conforms to
 *    expected owner, repository, and item conventions.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
 * Parses and verifies a GitHub registry item address without depending on private shadcn modules.
 * Address format: owner/repo/item or owner/repo#ref/item
 */
export function verifyGitHubRegistryAddress(addressString = 'tooinfinity/inertia-datatables/data-table') {
    if (!addressString || typeof addressString !== 'string') {
        throw new Error('Address must be a non-empty string.');
    }

    const segments = addressString.split('/');
    if (segments.length !== 3) {
        throw new Error(`Invalid GitHub item address "${addressString}". Expected format: owner/repo/item.`);
    }

    const [owner, rawRepo, item] = segments;
    let repo = rawRepo;
    let ref;

    if (rawRepo.includes('#')) {
        const parts = rawRepo.split('#');
        repo = parts[0];
        ref = parts[1];
    }

    if (!owner || !repo || !item) {
        throw new Error(`Invalid GitHub address components in "${addressString}".`);
    }

    if (owner !== 'tooinfinity' || repo !== 'inertia-datatables' || item !== 'data-table') {
        throw new Error(`Mismatched GitHub address resolution for "${addressString}".`);
    }

    return {
        scheme: 'github',
        owner,
        repo,
        item,
        ref,
    };
}

/**
 * Validates the registry item structure directly from JSON artifacts on disk.
 */
export function verifyRegistryItemStructure(registryItemPath = 'public/r/data-table.json') {
    const fullPath = resolve(registryItemPath);
    if (!existsSync(fullPath)) {
        throw new Error(`Registry artifact not found: ${registryItemPath}`);
    }

    const content = readFileSync(fullPath, 'utf8');
    const item = JSON.parse(content);

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

    // Verify each file actually exists on disk and targets the correct alias path
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
 * Validates the root manifest (registry.json)
 */
export function verifyRootRegistryManifest(manifestPath = 'registry.json') {
    const fullPath = resolve(manifestPath);
    if (!existsSync(fullPath)) {
        throw new Error(`Registry manifest not found: ${manifestPath}`);
    }

    const content = readFileSync(fullPath, 'utf8');
    const manifest = JSON.parse(content);

    if (manifest.name !== 'inertia-datatables') {
        throw new Error(`Expected manifest name "inertia-datatables", received "${manifest.name}".`);
    }

    const dataTableItem = (manifest.items || []).find((i) => i.name === 'data-table');
    if (!dataTableItem) {
        throw new Error('Manifest registry.json does not declare an item named "data-table".');
    }

    return manifest;
}

/**
 * Main verification runner for deterministic structural validation.
 */
export function main() {
    console.log('1. Verifying root registry.json manifest...');
    verifyRootRegistryManifest();
    console.log('✔ Manifest registry.json exposes data-table item.');

    console.log('2. Verifying GitHub registry address format...');
    verifyGitHubRegistryAddress();
    console.log('✔ Address resolves to scheme: github, owner: tooinfinity, repo: inertia-datatables, item: data-table.');

    console.log('3. Verifying generated registry artifact structure and dependencies...');
    verifyRegistryItemStructure();
    console.log('✔ Generated artifact public/r/data-table.json contains all 11 files and declared dependencies.');

    console.log('All deterministic registry validation checks passed.');
    return { ok: true };
}

/**
 * Returns true if the file was executed directly (not imported as a module).
 * Works reliably across Node.js versions >= 20.18.1 without relying on import.meta.main.
 */
export function isDirectExecution(metaUrl) {
    if (!process.argv || !process.argv[1]) {
        return false;
    }
    try {
        const scriptPath = resolve(process.argv[1]);
        const modulePath = resolve(fileURLToPath(metaUrl));
        return scriptPath === modulePath;
    } catch {
        return false;
    }
}

if (isDirectExecution(import.meta.url)) {
    try {
        main();
    } catch (err) {
        console.error('Registry validation failed:', err);
        process.exit(1);
    }
}
