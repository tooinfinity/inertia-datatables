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
 * protected compatibility shims, generated artifacts, registry manifest,
 * CODEOWNERS itself, and ownership policy documentation established in PR #142.
 */
export const REQUIRED_PATHS = [
    'registry/data-table/components/ui/',
    'public/r/',
    'registry.json',
    '.github/CODEOWNERS',
    'docs/architecture/shadcn-component-ownership.md',
];

/**
 * Parse a single CODEOWNERS line into { pattern, owners }.
 * Returns null for blank lines and full-line comments.
 *
 * Inline comments (a `#` token and everything after it) are stripped before
 * the pattern and owners are extracted, so `registry.json @tooinfinity # note`
 * is treated the same as `registry.json @tooinfinity`.
 */
export function parseRule(line) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
        return null;
    }

    const tokens = trimmed.split(/\s+/);

    // Drop the inline comment: everything from the first '#' token onward.
    const commentIndex = tokens.findIndex((token) => token.startsWith('#'));
    const ruleTokens =
        commentIndex === -1 ? tokens : tokens.slice(0, commentIndex);

    const owners = ruleTokens.filter((token) => token.startsWith('@'));
    const pattern = ruleTokens
        .slice(0, ruleTokens.length - owners.length)
        .join(' ')
        .trim();

    return { pattern, owners, raw: trimmed };
}

/**
 * Return true when an owner token names a real user or team.
 *
 * Accepts `@username` and `@org/team`. GitHub usernames and team slugs are
 * alphanumeric with single hyphens (never consecutive, never leading or
 * trailing), never empty. Rejects malformed tokens such as a bare `@`, `@/`,
 * `@org/team/extra` (extra separator), `@--org` (consecutive hyphens),
 * `@-org` (leading hyphen), or `@org-` (trailing hyphen).
 *
 * This is a syntactic check only; it cannot establish that a GitHub user or
 * team actually exists or is accessible to the repository.
 */
export function isValidOwner(token) {
    const segment = '[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?';
    const noConsecutiveHyphens = '(?!.*--)';
    return (
        new RegExp(`^@${noConsecutiveHyphens}${segment}$`).test(token) || // @username
        new RegExp(`^@${segment}\\/${noConsecutiveHyphens}${segment}$`).test(token) // @org/team
    );
}

/**
 * Return true when a CODEOWNERS pattern matches a path.
 *
 * Directory patterns (with or without a trailing slash) match the directory
 * itself and anything beneath it. File patterns match by exact path. A leading
 * '/' is ignored. GitHub permits directory patterns without a trailing slash.
 */
export function patternMatches(path, pattern) {
    const normalized = pattern.replace(/^\//, '');

    // Directory pattern with trailing slash: matches the directory and contents.
    if (normalized.endsWith('/')) {
        const directory = normalized.slice(0, -1);
        return path === directory || path.startsWith(normalized);
    }

    // Directory pattern without trailing slash: matches contents beneath it.
    if (path.startsWith(normalized + '/')) {
        return true;
    }

    // Exact file match.
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

        // Validate owner tokens before accepting the rule toward coverage.
        const invalidOwners = rule.owners.filter((owner) => !isValidOwner(owner));
        if (invalidOwners.length > 0) {
            errors.push(
                `Line ${lineNumber}: malformed owner token(s) ${invalidOwners
                    .map((owner) => `"${owner}"`)
                    .join(', ')}: "${rawLine}"`,
            );
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
