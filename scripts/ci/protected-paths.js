/* global console, process */
/**
 * Detects modifications to protected shadcn/ui compatibility shims.
 *
 * Reads `git diff --name-status -M` output on stdin and reports every
 * protected path that was added, modified, renamed, or deleted in the change
 * set being inspected.
 *
 * Protected path:
 *   registry/data-table/components/ui/  (package-maintained compatibility shims)
 *
 * Exit status:
 *   0 — no protected paths changed (safe).
 *   1 — one or more protected paths changed (reported with a failure message).
 */

import { readFileSync } from 'node:fs';

const PROTECTED_PREFIX = 'registry/data-table/components/ui/';

/**
 * Parse `git diff --name-status -M` output into the set of affected paths.
 *
 * Status lines look like:
 *   M\tpath            (modify)
 *   A\tpath            (add)
 *   D\tpath            (delete)
 *   R100\told\tnew     (rename)
 *   C100\told\tnew     (copy)
 *
 * Renames and copies contribute both the old and the new path so a move into or
 * out of a protected directory is detected either way.
 */
export function parseChangedFiles(input) {
    const paths = new Set();

    for (const rawLine of input.split('\n')) {
        const line = rawLine.trimEnd();
        if (!line) {
            continue;
        }

        const parts = line.split('\t');
        const status = parts[0];
        if (!status) {
            continue;
        }

        const kind = status[0];
        if (kind === 'R' || kind === 'C') {
            if (parts[1]) {
                paths.add(parts[1]);
            }
            if (parts[2]) {
                paths.add(parts[2]);
            }
        } else if (parts[1]) {
            paths.add(parts[1]);
        }
    }

    return [...paths];
}

/**
 * Return true when a path lives under the protected compatibility shim dir.
 */
export function isProtectedPath(path) {
    return path.startsWith(PROTECTED_PREFIX);
}

/**
 * Return the protected paths touched by a change set described by `input`.
 */
export function findProtectedChanges(input) {
    return parseChangedFiles(input).filter(isProtectedPath);
}

export function buildFailureMessage(protectedChanges) {
    const lines = [
        'error: protected shadcn/ui compatibility shim(s) were modified:',
        ...protectedChanges.map((path) => `  - ${path}`),
        '',
        'Files under registry/data-table/components/ui/ are package-maintained',
        'compatibility shims (button, checkbox, dropdown-menu, input, select,',
        'table, skeleton). They must not be modified, refactored, renamed, or',
        'reformatted during ordinary feature development.',
        '',
        'Intentional changes require explicit maintainer authorization via a',
        'dedicated maintenance PR. See',
        'docs/architecture/shadcn-component-ownership.md.',
    ];

    return lines.join('\n');
}

export function main(input) {
    const protectedChanges = findProtectedChanges(input);

    if (protectedChanges.length === 0) {
        return { ok: true, protectedChanges: [] };
    }

    return { ok: false, protectedChanges, message: buildFailureMessage(protectedChanges) };
}

if (import.meta.main) {
    const input = readFileSync(0, 'utf-8');
    const result = main(input);

    if (!result.ok) {
        console.error(result.message);
        process.exit(1);
    }
}
