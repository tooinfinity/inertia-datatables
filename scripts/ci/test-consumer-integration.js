/* global console, process, setTimeout, clearTimeout */
/**
 * Real consumer integration test for native shadcn registry installation.
 *
 * Sets up a clean temporary consumer application conforming to the documented prerequisites:
 * - React 19 + Inertia React
 * - TypeScript + tsconfig paths (@/* -> ./resources/js/*)
 * - components.json with standard aliases
 * - Tailwind CSS app.css
 * - Pre-existing consumer-owned UI component to verify preservation
 *
 * Then runs:
 *   npx --yes shadcn@latest add tooinfinity/inertia-datatables/data-table
 *
 * And asserts:
 * 1. Native CLI command succeeds.
 * 2. Pre-existing consumer UI primitives are not unexpectedly overwritten.
 * 3. All 11 package-owned DataTable files are installed into resources/js/components/data-table/.
 * 4. Declared npm dependencies (@tanstack/react-table, @inertiajs/react) are installed into package.json.
 * 5. Required bare shadcn primitives are installed.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { request as httpsRequest } from 'node:https';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXPECTED_DATA_TABLE_FILES } from './verify-consumer-install.js';

export const CONSUMER_CUSTOM_BUTTON_CONTENT = `// CONSUMER_CUSTOM_BUTTON_PRESERVED\nexport function Button() { return <button>Custom</button>; }\n`;

/**
 * Checks whether network access is available for the native GitHub registry test.
 * Uses node:https directly to bypass browser-like DOM window.fetch CORS interception in tests.
 */
export async function checkNetworkAvailability(timeoutMs = 4000) {
    return new Promise((resolveResult) => {
        const req = httpsRequest(
            'https://raw.githubusercontent.com',
            { method: 'HEAD', timeout: timeoutMs },
            (res) => {
                resolveResult(typeof res.statusCode === 'number' && res.statusCode < 500);
            }
        );

        req.on('timeout', () => {
            req.destroy();
            resolveResult(false);
        });

        req.on('error', () => {
            resolveResult(false);
        });

        req.end();
    });
}

/**
 * Creates the isolated temporary consumer fixture.
 */
export async function createConsumerFixture(baseDir) {
    await writeFile(
        join(baseDir, 'package.json'),
        JSON.stringify(
            {
                name: 'consumer-integration-test',
                type: 'module',
                dependencies: {
                    react: '^19.0.0',
                    'react-dom': '^19.0.0',
                },
            },
            null,
            2
        )
    );

    await writeFile(
        join(baseDir, 'components.json'),
        JSON.stringify(
            {
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
            },
            null,
            2
        )
    );

    await writeFile(
        join(baseDir, 'tsconfig.json'),
        JSON.stringify(
            {
                compilerOptions: {
                    target: 'ES2022',
                    module: 'ESNext',
                    moduleResolution: 'bundler',
                    jsx: 'react-jsx',
                    strict: true,
                    baseUrl: '.',
                    paths: {
                        '@/*': ['./resources/js/*'],
                    },
                    noEmit: true,
                    skipLibCheck: true,
                },
                include: ['resources/js/**/*'],
            },
            null,
            2
        )
    );

    await mkdir(join(baseDir, 'resources/css'), { recursive: true });
    await writeFile(join(baseDir, 'resources/css/app.css'), '@import "tailwindcss";\n');

    // Plant existing consumer-owned button to verify preservation
    await mkdir(join(baseDir, 'resources/js/components/ui'), { recursive: true });
    await writeFile(join(baseDir, 'resources/js/components/ui/button.tsx'), CONSUMER_CUSTOM_BUTTON_CONTENT);
}

/**
 * Runs the native shadcn add command in the consumer directory.
 */
export async function runShadcnAdd(cwd, itemAddress = 'tooinfinity/inertia-datatables/data-table', options = {}) {
    const { timeoutMs = 90000 } = options;

    return new Promise((resolvePromise, rejectPromise) => {
        const child = spawn('npx', ['--yes', 'shadcn@latest', 'add', itemAddress], {
            cwd,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, CI: 'true' },
        });

        // Automatically send "n\n" to avoid overwriting existing consumer files
        child.stdin.write('n\n');
        child.stdin.end();

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (d) => {
            stdout += d.toString();
        });
        child.stderr.on('data', (d) => {
            stderr += d.toString();
        });

        const timer = setTimeout(() => {
            child.kill();
            rejectPromise(new Error(`shadcn add timed out after ${timeoutMs}ms.\nStdout: ${stdout}\nStderr: ${stderr}`));
        }, timeoutMs);

        child.on('close', (code) => {
            clearTimeout(timer);
            resolvePromise({
                code,
                stdout,
                stderr,
            });
        });

        child.on('error', (err) => {
            clearTimeout(timer);
            rejectPromise(err);
        });
    });
}

/**
 * Validates the installed files, dependencies, and preservation in the consumer fixture.
 */
export async function assertInstalledConsumer(baseDir) {
    // 1. Verify consumer-owned button.tsx was preserved
    const buttonPath = join(baseDir, 'resources/js/components/ui/button.tsx');
    if (!existsSync(buttonPath)) {
        throw new Error('Consumer button.tsx does not exist.');
    }
    const buttonContent = await readFile(buttonPath, 'utf8');
    if (!buttonContent.includes('CONSUMER_CUSTOM_BUTTON_PRESERVED')) {
        throw new Error('Consumer-owned button.tsx was unexpectedly overwritten or modified!');
    }

    // 2. Verify all 11 package-owned DataTable files are installed under resources/js/components/data-table/
    for (const expectedRelative of EXPECTED_DATA_TABLE_FILES) {
        const fileName = expectedRelative.split('/').pop();
        const installedPath = join(baseDir, 'resources/js/components/data-table', fileName);
        if (!existsSync(installedPath)) {
            throw new Error(`Expected installed DataTable file missing: ${installedPath}`);
        }
    }

    // 3. Verify npm dependencies in consumer package.json
    const packageJsonPath = join(baseDir, 'package.json');
    const pkg = JSON.parse(await readFile(packageJsonPath, 'utf8'));
    if (!pkg.dependencies?.['@tanstack/react-table']) {
        throw new Error('Consumer package.json is missing required dependency @tanstack/react-table.');
    }
    if (!pkg.dependencies?.['@inertiajs/react']) {
        throw new Error('Consumer package.json is missing required dependency @inertiajs/react.');
    }

    // 4. Verify remaining bare primitives were installed into resources/js/components/ui/
    const requiredPrimitives = ['input.tsx', 'dropdown-menu.tsx', 'select.tsx', 'checkbox.tsx', 'table.tsx', 'skeleton.tsx'];
    for (const primitive of requiredPrimitives) {
        const primitivePath = join(baseDir, 'resources/js/components/ui', primitive);
        if (!existsSync(primitivePath)) {
            throw new Error(`Expected installed shadcn primitive missing: ${primitivePath}`);
        }
    }

    return true;
}

/**
 * Executes the complete integration test lifecycle in a temporary directory.
 */
export async function testConsumerIntegration(options = {}) {
    const isOnline = await checkNetworkAvailability();
    if (!isOnline) {
        if (options.requireNetwork) {
            throw new Error('Network access required for consumer integration test but raw.githubusercontent.com is unreachable.');
        }
        console.warn('Network unavailable: skipping live GitHub registry consumer integration test.');
        return { ok: true, skipped: true, reason: 'network_unavailable' };
    }

    const fixtureDir = await mkdtemp(join(tmpdir(), 'shadcn-consumer-fixture-'));
    try {
        console.log(`Setting up consumer fixture at ${fixtureDir}...`);
        await createConsumerFixture(fixtureDir);

        console.log('Running npx shadcn@latest add tooinfinity/inertia-datatables/data-table...');
        const result = await runShadcnAdd(fixtureDir, 'tooinfinity/inertia-datatables/data-table', options);

        if (result.code !== 0) {
            throw new Error(
                `Native shadcn add command failed with exit code ${result.code}.\nStdout: ${result.stdout}\nStderr: ${result.stderr}`
            );
        }

        console.log('Validating installed files, dependencies, aliases, and primitive preservation...');
        await assertInstalledConsumer(fixtureDir);

        console.log('✔ Consumer integration test passed successfully.');
        return { ok: true, skipped: false };
    } finally {
        await rm(fixtureDir, { recursive: true, force: true });
    }
}

/**
 * Direct execution helper compatible with Node.js >= 20.18.1.
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
    testConsumerIntegration({ requireNetwork: true })
        .then(() => {
            console.log('Consumer integration test completed successfully.');
        })
        .catch((err) => {
            console.error('Consumer integration test failed:', err);
            process.exit(1);
        });
}
