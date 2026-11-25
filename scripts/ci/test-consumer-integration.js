/* global console, process, setTimeout, clearTimeout */
/**
 * Real consumer integration test for native shadcn registry installation.
 *
 * Sets up an isolated temporary consumer application conforming to documented prerequisites:
 * - React 19 + Inertia React
 * - TypeScript + tsconfig paths
 * - components.json with configurable aliases
 * - Tailwind CSS app.css
 * - Pre-existing consumer-owned UI component to verify preservation
 *
 * Then runs:
 *   npx --yes shadcn@latest add tooinfinity/inertia-datatables/data-table
 *
 * And asserts:
 * 1. Native CLI command succeeds.
 * 2. Pre-existing consumer UI primitives are not unexpectedly overwritten.
 * 3. All 11 package-owned DataTable files are installed into the configured components path.
 * 4. Declared npm dependencies (@tanstack/react-table, @inertiajs/react) are installed into package.json.
 * 5. Required bare shadcn primitives are installed into the configured ui path.
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

export const DEFAULT_CONSUMER_ALIASES = {
    components: '@/components',
    ui: '@/components/ui',
    utils: '@/lib/utils',
    lib: '@/lib',
    hooks: '@/hooks',
};

export const DEFAULT_TS_PATHS = {
    '@/*': ['./resources/js/*'],
};

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
 * Creates the isolated temporary consumer fixture with configurable aliases and paths.
 */
export async function createConsumerFixture(baseDir, fixtureOptions = {}) {
    const aliases = fixtureOptions.aliases || DEFAULT_CONSUMER_ALIASES;
    const tsPaths = fixtureOptions.tsPaths || DEFAULT_TS_PATHS;
    const uiDirRelative = fixtureOptions.uiDirRelative || 'resources/js/components/ui';

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
                aliases,
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
                    paths: tsPaths,
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
    await mkdir(join(baseDir, uiDirRelative), { recursive: true });
    await writeFile(join(baseDir, uiDirRelative, 'button.tsx'), CONSUMER_CUSTOM_BUTTON_CONTENT);
}

/**
 * Runs the native shadcn add command in the consumer directory.
 * Keeps stdin open until prompt is answered to prevent write-after-end errors.
 */
export async function runShadcnAdd(cwd, itemAddress = 'tooinfinity/inertia-datatables/data-table', options = {}) {
    const { timeoutMs = 90000 } = options;

    return new Promise((resolvePromise, rejectPromise) => {
        const child = spawn('npx', ['--yes', 'shadcn@latest', 'add', itemAddress], {
            cwd,
            stdio: ['pipe', 'pipe', 'pipe'],
            detached: true,
            env: { ...process.env, CI: 'true' },
        });

        let stdout = '';
        let stderr = '';
        let closed = false;
        let promptHandled = false;

        const handlePromptResponse = () => {
            if (promptHandled || !child.stdin.writable || child.stdin.destroyed) {
                return;
            }
            promptHandled = true;
            child.stdin.write('n\n', () => {
                child.stdin.end();
            });
        };

        child.stdout.on('data', (d) => {
            const chunk = d.toString();
            stdout += chunk;
            if (chunk.includes('already exists. Would you like to overwrite?')) {
                handlePromptResponse();
            }
        });

        child.stderr.on('data', (d) => {
            const chunk = d.toString();
            stderr += chunk;
            if (chunk.includes('already exists. Would you like to overwrite?')) {
                handlePromptResponse();
            }
        });

        const timer = setTimeout(() => {
            if (!closed) {
                try {
                    if (child.pid) {
                        process.kill(-child.pid, 'SIGKILL');
                    } else {
                        child.kill('SIGKILL');
                    }
                } catch {
                    child.kill('SIGKILL');
                }
                rejectPromise(new Error(`shadcn add timed out after ${timeoutMs}ms.\nStdout: ${stdout}\nStderr: ${stderr}`));
            }
        }, timeoutMs);

        child.on('close', (code) => {
            closed = true;
            clearTimeout(timer);
            resolvePromise({
                code,
                stdout,
                stderr,
            });
        });

        child.on('error', (err) => {
            closed = true;
            clearTimeout(timer);
            rejectPromise(err);
        });
    });
}

/**
 * Validates the installed files, dependencies, and preservation in the consumer fixture.
 */
export async function assertInstalledConsumer(baseDir, fixtureOptions = {}) {
    const componentsDirRelative = fixtureOptions.componentsDirRelative || 'resources/js/components/data-table';
    const uiDirRelative = fixtureOptions.uiDirRelative || 'resources/js/components/ui';

    // 1. Verify consumer-owned button.tsx was preserved completely unchanged
    const buttonPath = join(baseDir, uiDirRelative, 'button.tsx');
    if (!existsSync(buttonPath)) {
        throw new Error(`Consumer button.tsx does not exist at ${buttonPath}.`);
    }
    const buttonContent = await readFile(buttonPath, 'utf8');
    if (buttonContent !== CONSUMER_CUSTOM_BUTTON_CONTENT) {
        throw new Error('Consumer-owned button.tsx was unexpectedly overwritten or modified!');
    }

    // 2. Verify all 11 package-owned DataTable files are installed under configured components directory
    for (const expectedRelative of EXPECTED_DATA_TABLE_FILES) {
        const fileName = expectedRelative.split('/').pop();
        const installedPath = join(baseDir, componentsDirRelative, fileName);
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

    // 4. Verify remaining bare primitives were installed into configured ui directory
    const requiredPrimitives = ['input.tsx', 'dropdown-menu.tsx', 'select.tsx', 'checkbox.tsx', 'table.tsx', 'skeleton.tsx'];
    for (const primitive of requiredPrimitives) {
        const primitivePath = join(baseDir, uiDirRelative, primitive);
        if (!existsSync(primitivePath)) {
            throw new Error(`Expected installed shadcn primitive missing: ${primitivePath}`);
        }
    }

    return true;
}

/**
 * Executes the complete integration test lifecycle in a temporary directory.
 * Checks both standard default aliases and custom non-default aliases.
 */
export async function testConsumerIntegration(options = {}) {
    const isOnline = options.networkCheck
        ? await options.networkCheck()
        : await checkNetworkAvailability();

    if (!isOnline) {
        if (options.requireNetwork) {
            throw new Error('Network access required for consumer integration test but raw.githubusercontent.com is unreachable.');
        }
        console.warn('Network unavailable: skipping live GitHub registry consumer integration test.');
        return { ok: true, skipped: true, reason: 'network_unavailable' };
    }

    // Configuration 1: Standard Laravel Inertia alias configuration (@/components)
    const standardFixtureDir = await mkdtemp(join(tmpdir(), 'shadcn-consumer-standard-'));
    try {
        console.log(`Setting up standard consumer fixture at ${standardFixtureDir}...`);
        await createConsumerFixture(standardFixtureDir);

        console.log('Running npx shadcn@latest add tooinfinity/inertia-datatables/data-table (standard aliases)...');
        const standardResult = await runShadcnAdd(standardFixtureDir, 'tooinfinity/inertia-datatables/data-table', options);

        if (standardResult.code !== 0) {
            throw new Error(
                `Native shadcn add command failed with exit code ${standardResult.code}.\nStdout: ${standardResult.stdout}\nStderr: ${standardResult.stderr}`
            );
        }

        console.log('Validating standard installed files, dependencies, and primitive preservation...');
        await assertInstalledConsumer(standardFixtureDir);
        console.log('✔ Standard consumer fixture verified.');
    } finally {
        await rm(standardFixtureDir, { recursive: true, force: true });
    }

    // Configuration 2: Custom non-default aliases (@/shared/components, @/shared/components/ui)
    const customFixtureDir = await mkdtemp(join(tmpdir(), 'shadcn-consumer-custom-'));
    const customOptions = {
        aliases: {
            components: '@/shared/components',
            ui: '@/shared/components/ui',
            utils: '@/shared/lib/utils',
            lib: '@/shared/lib',
            hooks: '@/shared/hooks',
        },
        tsPaths: {
            '@/shared/*': ['./resources/js/shared/*'],
        },
        componentsDirRelative: 'resources/js/shared/components/data-table',
        uiDirRelative: 'resources/js/shared/components/ui',
    };

    try {
        console.log(`Setting up custom alias consumer fixture at ${customFixtureDir}...`);
        await createConsumerFixture(customFixtureDir, customOptions);

        console.log('Running npx shadcn@latest add tooinfinity/inertia-datatables/data-table (custom aliases)...');
        const customResult = await runShadcnAdd(customFixtureDir, 'tooinfinity/inertia-datatables/data-table', options);

        if (customResult.code !== 0) {
            throw new Error(
                `Native shadcn add command failed on custom aliases with exit code ${customResult.code}.\nStdout: ${customResult.stdout}\nStderr: ${customResult.stderr}`
            );
        }

        console.log('Validating custom alias installed files, dependencies, and primitive preservation...');
        await assertInstalledConsumer(customFixtureDir, customOptions);
        console.log('✔ Custom alias consumer fixture verified.');
    } finally {
        await rm(customFixtureDir, { recursive: true, force: true });
    }

    console.log('✔ All consumer integration tests passed successfully across standard and custom alias configurations.');
    return { ok: true, skipped: false };
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
