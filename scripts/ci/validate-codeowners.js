/* global console, process */
/**
 * Validates CODEOWNERS syntax and required-path coverage.
 *
 * Syntax: every non-blank, non-comment line must contain a pattern followed by
 * at least one owner (a @user or @org/team token).
 * Coverage: every required protected path must be matched by at least one rule.
 *
 * Exit status:
 *   0 — CODEOWNERS is valid and covers all required paths.
 *   1 — syntax error or missing coverage (reported with a failure message).
 */

import { readFileSync } from 'node:fs';

const CODEOWNERS_PATH = '.github/CODEOWNERS';

/**
 * Paths that must always carry an explicit ownership rule. These are the
 * protected compatibility shims, generated artifacts, registry manifest, and
 * ownership policy documentation established in PR #142.
 */
export const REQUIRED_PATHS = [
    'registry/data-table/components/ui/',
    'public/r/',
    'registry.json',
    'docs/architecture/shadcn-component-ownership.md',
];

/**
 * Parse a single CODEOWNERS line into { pattern, owners }.
 * Returns null for blank lines and comments.
 */
export function parseRule(line) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
        return null;
    }

    const tokens = trimmed.split(/\s+/);
    const owners = tokens.filter((token) => token.startsWith('@'));
    const pattern = tokens
        .slice(0, tokens.length - owners.length)
        .join(' ')
        .trim();

    return { pattern, owners, raw: trimmed };
}

/**
 * Return true when a CODEOWNERS pattern matches a path.
 *
 * Directory patterns (ending in '/') match the directory itself and anything
 * beneath it. File patterns match by exact path. A leading '/' is ignored.
 */
export function patternMatches(path, pattern) {
    const normalized = pattern.replace(/^\//, '');

    if (normalized.endsWith('/')) {
        const directory = normalized.slice(0, -1);
        return path === directory || path.startsWith(normalized);
    }

    return path === normalized;
}

/**
 * Validate CODEOWNERS content against required paths.
 */
export function validateCodeowners(content, requiredPaths = REQUIRED_PATHS) {
    const errors = [];
    const rules = [];

    let lineNumber = 0;
    for (const rawLine of content.split('\n')) {
        lineNumber += 1;

        const rule = parseRule(rawLine);
        if (!rule) {
            continue;
        }

        if (!rule.pattern || rule.owners.length === 0) {
            errors.push(`Line ${lineNumber}: missing pattern or owner: "${rawLine}"`);
            continue;
        }

        rules.push(rule);
    }

    for (const required of requiredPaths) {
        const covered = rules.some((rule) => patternMatches(required, rule.pattern));
        if (!covered) {
            errors.push(`No CODEOWNERS rule covers required protected path: ${required}`);
        }
    }

    return { valid: errors.length === 0, errors, rules };
}

export function main() {
    let content;

    try {
        content = readFileSync(CODEOWNERS_PATH, 'utf-8');
    } catch {
        console.error(`error: ${CODEOWNERS_PATH} not found.`);
        process.exit(1);
    }

    const result = validateCodeowners(content);

    if (!result.valid) {
        console.error('error: CODEOWNERS validation failed:');
        for (const error of result.errors) {
            console.error(`  - ${error}`);
        }
        process.exit(1);
    }

    console.log(
        `CODEOWNERS valid (${result.rules.length} rule(s), all required paths covered).`,
    );
}

if (import.meta.main) {
    main();
}
