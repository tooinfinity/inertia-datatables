/* global console, process */
/**
 * Validates that the shadcn CLI version used in GitHub Actions integration
 * workflows matches the pinned version in package.json.
 *
 * This prevents silent version drift between the local dev toolchain and CI.
 *
 * Usage:
 *   node scripts/ci/check-shadcn-version.js
 *
 * Exit status:
 *   0 — versions are consistent.
 *   1 — drift detected (reported with an actionable error message).
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const INTEGRATION_WORKFLOW = '.github/workflows/integration.yml';

/**
 * Read the pinned shadcn version from package.json devDependencies.
 *
 * @returns {string} The exact pinned version (e.g. "4.23.0").
 */
export function readPinnedVersion() {
    const require = createRequire(import.meta.url);
    const pkg = require('../../package.json');
    const version = pkg?.devDependencies?.shadcn;
    if (!version) {
        throw new Error('shadcn not found in package.json devDependencies');
    }
    // Strip leading "^" or "~" if present (defensive; we pin exactly).
    return version.replace(/^[^~]/, (c) => (/[\^~]/.test(c) ? '' : c));
}

/**
 * Find all shadcn CLI version references in the integration workflow YAML.
 *
 * Returns an array of { version, line } objects.
 *
 * Matches patterns like:
 *   shadcn@4.22.0
 *   shadcn@4.23.0
 */
export function findWorkflowVersions(content) {
    const results = [];
    const lines = content.split('\n');
    const re = /shadcn@(\d+\.\d+\.\d+)/g;
    lines.forEach((line, index) => {
        let match;
        while ((match = re.exec(line)) !== null) {
            results.push({ version: match[1], line: index + 1 });
        }
        re.lastIndex = 0;
    });
    return results;
}

/**
 * Check that all workflow shadcn references match the pinned version.
 *
 * @param {string} pinnedVersion
 * @param {{ version: string, line: number }[]} workflowVersions
 * @returns {{ ok: boolean, mismatches: { version: string, line: number }[] }}
 */
export function checkVersionConsistency(pinnedVersion, workflowVersions) {
    const mismatches = workflowVersions.filter((ref) => ref.version !== pinnedVersion);
    return { ok: mismatches.length === 0, mismatches };
}

export function buildDriftMessage(pinnedVersion, mismatches, workflowPath) {
    const lines = [
        `error: shadcn CLI version drift detected in ${workflowPath}:`,
        '',
        `  Pinned version (package.json): ${pinnedVersion}`,
        '  Mismatched workflow references:',
        ...mismatches.map((m) => `    Line ${m.line}: shadcn@${m.version}`),
        '',
        `Update every shadcn@X.Y.Z reference in ${workflowPath}`,
        `to match the pinned version: shadcn@${pinnedVersion}`,
        '',
        'Using a consistent, exact version prevents silent drift between local',
        'dev toolchain and CI and ensures reproducible integration test results.',
    ];
    return lines.join('\n');
}

export function main() {
    let pinnedVersion;
    try {
        pinnedVersion = readPinnedVersion();
    } catch (err) {
        console.error(`error: failed to read pinned shadcn version: ${err.message}`);
        process.exit(1);
    }

    let workflowContent;
    try {
        workflowContent = readFileSync(INTEGRATION_WORKFLOW, 'utf-8');
    } catch {
        console.error(`error: ${INTEGRATION_WORKFLOW} not found.`);
        process.exit(1);
    }

    const workflowVersions = findWorkflowVersions(workflowContent);

    if (workflowVersions.length === 0) {
        console.warn(
            `warning: no shadcn@X.Y.Z references found in ${INTEGRATION_WORKFLOW}; nothing to validate.`,
        );
        process.exit(0);
    }

    const { ok, mismatches } = checkVersionConsistency(pinnedVersion, workflowVersions);

    if (!ok) {
        console.error(buildDriftMessage(pinnedVersion, mismatches, INTEGRATION_WORKFLOW));
        process.exit(1);
    }

    console.log(
        `shadcn CLI version consistent: all ${workflowVersions.length} reference(s) in ${INTEGRATION_WORKFLOW} match pinned version ${pinnedVersion}.`,
    );
}

if (import.meta.main) {
    main();
}
