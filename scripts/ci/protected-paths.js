/* global console, process */
/**
 * Detects modifications to protected shadcn/ui compatibility shims.
 *
 * Reads `git diff --name-status -z -M` output on stdin and reports every
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
 * Parse `git diff --name-status -z -M` output into the set of affected paths.
 *
 * With `-z`, Git emits NUL-separated fields, not tab-separated records:
 *   M\0path\0              (modify)
 *   A\0path\0              (add)
 *   D\0path\0              (delete)
 *   R100\0old\0new\0       (rename)
 *   C100\0old\0new\0       (copy)
 *
 * Multiple changes are concatenated: M\0p1\0A\0p2\0. A status field (M/A/D/R/C
 * optionally followed by a similarity score such as R100) is followed by one
 * path field (M/A/D) or two path fields (R/C).
 *
 * Paths are raw (never quoted), so non-ASCII filenames are parsed correctly
 * without quote decoding.
 *
 * Renames and copies contribute both the old and the new path so a move into or
 * out of a protected directory is detected either way.
 */
const STATUS_RE = /^[MACDRT]\d*$/;

export function parseChangedFiles(input) {
    const paths = new Set();

    // Split on NUL; trailing/duplicate delimiters yield empty fields which are skipped.
    const fields = input.split('\0').filter(Boolean);

    for (let i = 0; i < fields.length; i += 1) {
        const status = fields[i];
        if (!STATUS_RE.test(status)) {
            continue;
        }

        const kind = status[0];
        if (kind === 'R' || kind === 'C') {
            if (fields[i + 1]) {
                paths.add(fields[i + 1]);
            }
            if (fields[i + 2]) {
                paths.add(fields[i + 2]);
            }
            i += 2; // skip the two path fields
        } else if (fields[i + 1]) {
            paths.add(fields[i + 1]);
            i += 1; // skip the single path field
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
