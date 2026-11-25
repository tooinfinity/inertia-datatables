/* global console, process, AbortController, setTimeout, clearTimeout, fetch */
/**
 * Audits package-maintained shadcn/ui compatibility shims against official
 * shadcn/ui upstream sources.
 *
 * Two modes:
 *
 *   PR validation (default): fetches each component's pinned baseline source
 *   and compares the local shim against it. Deterministic — always uses the
 *   baseline commit from the manifest. Runs on every push/PR.
 *
 *   Drift detection (--drift): discovers the latest commit on the upstream
 *   branch and compares the latest source against the baseline source. Reports
 *   whether upstream has changed since the baseline was reviewed. Runs on a
 *   schedule and via manual dispatch.
 *
 * Upstream references are pinned to a specific commit SHA so the audit is
 * reproducible and does not follow arbitrary upstream changes.
 *
 * Exit status:
 *   0 — no issues found.
 *   1 — structural differences or manifest validation failures (requires review).
 *   2 — network or upstream retrieval failure (distinguishable from findings).
 */

import { readFileSync } from 'node:fs';

const MANIFEST_PATH = 'scripts/ci/shadcn-compatibility-manifest.json';
const EXPECTED_COMPONENT_NAMES = [
    'button',
    'checkbox',
    'dropdown-menu',
    'input',
    'select',
    'skeleton',
    'table',
];
const GITHUB_API_URL =
    'https://api.github.com/repos/shadcn-ui/ui/commits/main';

/**
 * Fetch a URL with a timeout. Throws on non-2xx or network errors.
 */
export async function fetchWithTimeout(url, timeoutMs = 30000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, { signal: controller.signal });

        if (!response.ok) {
            throw new Error(
                `HTTP ${response.status} ${response.statusText} for ${url}`,
            );
        }

        return await response.text();
    } finally {
        clearTimeout(timeout);
    }
}

/**
 * Fetch JSON from a URL with a timeout.
 */
export async function fetchJsonWithTimeout(url, timeoutMs = 30000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: { Accept: 'application/vnd.github+json' },
        });

        if (!response.ok) {
            throw new Error(
                `HTTP ${response.status} ${response.statusText} for ${url}`,
            );
        }

        return await response.json();
    } finally {
        clearTimeout(timeout);
    }
}

/**
 * Discover the latest commit SHA on the upstream branch via the GitHub API.
 * Returns null if the discovery fails (caller decides how to handle).
 */
export async function discoverLatestCommit() {
    try {
        const data = await fetchJsonWithTimeout(GITHUB_API_URL);
        return data.sha || null;
    } catch {
        return null;
    }
}

/**
 * Build the raw URL for a component at a given commit.
 */
export function buildUpstreamUrl(upstream, componentName, commit) {
    return upstream.rawUrlTemplate
        .replace('{commit}', commit)
        .replace('{component}', componentName);
}

/**
 * Find the index of the matching closing parenthesis for an opening
 * parenthesis at `openIdx`, tracking nested parentheses and accounting for
 * strings, template literals, and comments.
 * Returns -1 if no match is found.
 */
function findMatchingParen(source, openIdx) {
    let depth = 0;
    let inString = false;
    let stringChar = null;
    let inLineComment = false;
    let inBlockComment = false;

    for (let i = openIdx; i < source.length; i++) {
        const ch = source[i];
        const next = source[i + 1];

        if (inLineComment) {
            if (ch === '\n') inLineComment = false;
            continue;
        }
        if (inBlockComment) {
            if (ch === '*' && next === '/') {
                inBlockComment = false;
                i++;
            }
            continue;
        }
        if (inString) {
            if (ch === '\\') {
                i++; // skip escaped character
                continue;
            }
            if (ch === stringChar) inString = false;
            continue;
        }
        if (ch === '/' && next === '/') {
            inLineComment = true;
            i++;
            continue;
        }
        if (ch === '/' && next === '*') {
            inBlockComment = true;
            i++;
            continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') {
            inString = true;
            stringChar = ch;
            continue;
        }
        if (ch === '(') depth++;
        if (ch === ')') {
            depth--;
            if (depth === 0) return i;
        }
    }

    return -1;
}

/**
 * Extract exported named component declarations from a .tsx source string.
 * Returns a map of componentName -> Set of lowercase HTML element names
 * rendered by that component (including nested elements).
 *
 * Handles both:
 *   - Pattern A: export const Name = ... => <JSX>
 *   - Pattern B: (export) function Name(...) { ... }
 *
 * Only lowercase JSX tags are treated as HTML elements (e.g. <table>, <div>).
 * PascalCase tags (e.g. <TableHeader>) are React components, not HTML elements.
 */
export function extractComponentStructure(source) {
    const components = new Map();
    const HTML_ELEMENT_RE = /<([a-z][a-z0-9]*)/g;

    // All top-level const-arrow and function declarations (exported or not),
    // so grouped exports can reference declarations declared elsewhere in the
    // file. Private helpers that are never exported are excluded later.
    const declMap = new Map(); // name -> { start, kind }

    const CONST_ARROW_RE = /\bconst\s+([A-Za-z][A-Za-z0-9]*)\s*=/g;
    const FN_RE = /\bfunction\s+([A-Za-z][A-Za-z0-9]*)\s*\(/g;

    let match;
    while ((match = CONST_ARROW_RE.exec(source)) !== null) {
        declMap.set(match[1], { start: match.index, kind: 'arrow' });
    }
    while ((match = FN_RE.exec(source)) !== null) {
        declMap.set(match[1], { start: match.index, kind: 'function' });
    }

    // Determine which names are actually exported, resolving aliases
    // (export { A as B } -> public name B maps to declaration A).
    // Supports inline exports and grouped exports.
    const exported = new Map(); // publicName -> originalName

    // Grouped exports: export { A, B, C } and export { A as Alias, B }.
    const EXPORT_GROUP_RE = /export\s*\{[^}]*\}/g;
    while ((match = EXPORT_GROUP_RE.exec(source)) !== null) {
        const body = match[0]
            .replace(/^export\s*\{\s*/, '')
            .replace(/\s*\}\s*$/, '');
        for (const item of body.split(',')) {
            const trimmed = item.trim();
            if (!trimmed) continue;
            const parts = trimmed.split(/\s+as\s+/);
            const originalName = parts[0].trim();
            const publicName = parts.length > 1 ? parts[1].trim() : originalName;
            if (
                /^[A-Za-z][A-Za-z0-9]*$/.test(originalName) &&
                /^[A-Za-z][A-Za-z0-9]*$/.test(publicName)
            ) {
                exported.set(publicName, originalName);
            }
        }
    }

    // Inline exports: export const Name = ..., export function Name(.
    const EXPORT_INLINE_RE = /export\s+(?:const\s+([A-Za-z][A-Za-z0-9]*)\s*=|function\s+([A-Za-z][A-Za-z0-9]*)\s*\()/g;
    while ((match = EXPORT_INLINE_RE.exec(source)) !== null) {
        const originalName = match[1] || match[2];
        exported.set(originalName, originalName);
    }

    // Build the component map only for exported names that have a declaration.
    const declarations = [];
    for (const [publicName, originalName] of exported) {
        const decl = declMap.get(originalName);
        if (decl) {
            declarations.push({ name: publicName, start: decl.start, kind: decl.kind });
        }
    }

    // Sort by position so sections can be delimited by the next declaration.
    declarations.sort((a, b) => a.start - b.start);

    for (let i = 0; i < declarations.length; i++) {
        const decl = declarations[i];
        const sectionEnd =
            i + 1 < declarations.length ? declarations[i + 1].start : source.length;

        let bodyStart;

        if (decl.kind === 'arrow') {
            // Arrow function body (after =>).
            const arrowIdx = source.indexOf('=>', decl.start);
            if (arrowIdx === -1 || arrowIdx > sectionEnd) continue;
            bodyStart = arrowIdx + 2;
        } else {
            // Function declaration: find the opening brace of the body
            // after the closing parenthesis of the parameter list.
            const openParen = source.indexOf('(', decl.start);
            if (openParen === -1 || openParen > sectionEnd) continue;
            const closeParen = findMatchingParen(source, openParen);
            if (closeParen === -1 || closeParen > sectionEnd) continue;
            const bodyBrace = source.indexOf('{', closeParen);
            if (bodyBrace === -1 || bodyBrace > sectionEnd) continue;
            bodyStart = bodyBrace + 1;
        }

        // Trim leading whitespace.
        while (bodyStart < source.length && /\s/.test(source[bodyStart])) {
            bodyStart++;
        }

        const section = source.slice(bodyStart, sectionEnd);
        const elements = new Set();

        let elemMatch;
        while ((elemMatch = HTML_ELEMENT_RE.exec(section)) !== null) {
            elements.add(elemMatch[1].toLowerCase());
        }

        components.set(decl.name, elements);
    }

    return components;
}

/**
 * Read a local shim file and extract its component structure.
 */
export function readLocalComponent(localPath) {
    let source;
    try {
        source = readFileSync(localPath, 'utf-8');
    } catch (error) {
        return {
            ok: false,
            error: `cannot read local file ${localPath}: ${error.message}`,
        };
    }

    return {
        ok: true,
        source,
        structure: extractComponentStructure(source),
    };
}

/**
 * Compare local and upstream component structures.
 *
 * For each exported component:
 *   - Reports components present locally but missing upstream
 *   - Reports components present upstream but missing locally
 *   - For common components, checks that the local component's rendered HTML
 *     elements are a subset of the upstream component's rendered HTML elements.
 *     This intentionally allows upstream to render additional wrapper elements
 *     (e.g. the upstream Table wraps <table> in a <div> container) without
 *     flagging a false incompatibility.
 *
 * Intentional simplifications (missing cn(), cva, className prop, etc.) are
 * NOT flagged — only structural mismatches in exported component names or
 * rendered HTML elements are reported.
 */
export function compareStructures(localStructure, upstreamStructure) {
    const differences = [];

    const localNames = new Set(localStructure.keys());
    const upstreamNames = new Set(upstreamStructure.keys());

    // Components present locally but missing upstream
    for (const name of localNames) {
        if (!upstreamNames.has(name)) {
            differences.push(
                `local component "${name}" has no upstream counterpart`,
            );
        }
    }

    // Components present upstream but missing locally
    for (const name of upstreamNames) {
        if (!localNames.has(name)) {
            differences.push(
                `upstream component "${name}" is not implemented locally`,
            );
        }
    }

    // Components present in both — compare rendered HTML element sets.
    // Local elements must be a subset of upstream elements: upstream may
    // render additional wrapper elements, but must not remove elements the
    // local shim renders.
    for (const name of [...localNames].filter((n) => upstreamNames.has(n))) {
        const localElements = localStructure.get(name);
        const upstreamElements = upstreamStructure.get(name);

        if (!localElements || !upstreamElements) {
            differences.push(
                `component "${name}" structure could not be statically compared`,
            );
            continue;
        }

        const missingFromUpstream = [...localElements].filter(
            (el) => !upstreamElements.has(el),
        );

        if (missingFromUpstream.length > 0) {
            differences.push(
                `component "${name}" renders <${missingFromUpstream.join('>, <')}> locally but upstream does not render those elements`,
            );
        }
    }

    return differences;
}

/**
 * Validate the manifest structure and contents.
 * Returns { valid: true } or { valid: false, errors: string[] }.
 */
export function validateManifest(manifest) {
    const errors = [];

    if (!manifest || typeof manifest !== 'object') {
        return { valid: false, errors: ['manifest is not a valid JSON object'] };
    }

    // Validate upstream section
    const upstream = manifest.upstream;
    if (!upstream || typeof upstream !== 'object') {
        errors.push('manifest.upstream is missing or not an object');
    } else {
        if (!upstream.repository || typeof upstream.repository !== 'string') {
            errors.push('manifest.upstream.repository is missing or not a string');
        }
        if (!upstream.branch || typeof upstream.branch !== 'string') {
            errors.push('manifest.upstream.branch is missing or not a string');
        }
        if (
            !upstream.baselineCommit ||
            typeof upstream.baselineCommit !== 'string' ||
            !/^[0-9a-f]{40}$/.test(upstream.baselineCommit)
        ) {
            errors.push(
                'manifest.upstream.baselineCommit is missing or not a 40-char hex SHA',
            );
        }
        if (
            upstream.currentCommit !== undefined &&
            (!/^[0-9a-f]{40}$/.test(upstream.currentCommit))
        ) {
            errors.push(
                'manifest.upstream.currentCommit is not a 40-char hex SHA',
            );
        }
        if (!upstream.rawUrlTemplate || typeof upstream.rawUrlTemplate !== 'string') {
            errors.push('manifest.upstream.rawUrlTemplate is missing or not a string');
        }
    }

    // Validate components array
    const components = manifest.components;
    if (!Array.isArray(components)) {
        errors.push('manifest.components is missing or not an array');
        return { valid: errors.length === 0, errors };
    }

    if (components.length !== EXPECTED_COMPONENT_NAMES.length) {
        errors.push(
            `manifest.components must contain exactly ${EXPECTED_COMPONENT_NAMES.length} entries (found ${components.length})`,
        );
    }

    const seenNames = new Set();

    for (const [index, component] of components.entries()) {
        const prefix = `manifest.components[${index}]`;

        if (!component || typeof component !== 'object') {
            errors.push(`${prefix} is not an object`);
            continue;
        }

        // Validate name
        if (!component.name || typeof component.name !== 'string') {
            errors.push(`${prefix}.name is missing or not a string`);
        } else {
            if (seenNames.has(component.name)) {
                errors.push(`${prefix}.name "${component.name}" is duplicated`);
            }
            seenNames.add(component.name);

            if (!EXPECTED_COMPONENT_NAMES.includes(component.name)) {
                errors.push(
                    `${prefix}.name "${component.name}" is not an expected component`,
                );
            }
        }

        // Validate localPath
        if (
            !component.localPath ||
            typeof component.localPath !== 'string'
        ) {
            errors.push(`${prefix}.localPath is missing or not a string`);
        } else if (!component.localPath.endsWith('.tsx')) {
            errors.push(`${prefix}.localPath must point to a .tsx file`);
        }

        // Validate upstreamComponent
        if (
            !component.upstreamComponent ||
            typeof component.upstreamComponent !== 'string'
        ) {
            errors.push(`${prefix}.upstreamComponent is missing or not a string`);
        }

        // Validate comparisonStrategy
        if (
            !component.comparisonStrategy ||
            !['structural', 'manual'].includes(component.comparisonStrategy)
        ) {
            errors.push(
                `${prefix}.comparisonStrategy must be 'structural' or 'manual'`,
            );
        }

        // Validate classification
        if (
            !component.classification ||
            typeof component.classification !== 'string'
        ) {
            errors.push(`${prefix}.classification is missing or not a string`);
        }

        // Validate upstreamSource
        if (!component.upstreamSource || typeof component.upstreamSource !== 'string') {
            errors.push(`${prefix}.upstreamSource is missing or not a string`);
        } else if (!component.upstreamSource.startsWith('https://')) {
            errors.push(`${prefix}.upstreamSource must be an HTTPS URL`);
        }
    }

    // Check for missing expected components
    for (const expected of EXPECTED_COMPONENT_NAMES) {
        if (!seenNames.has(expected)) {
            errors.push(`manifest is missing required component: ${expected}`);
        }
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Audit a single component in validation mode: compares the local shim
 * against the pinned baseline upstream source.
 */
export async function auditComponent(component) {
    const result = {
        name: component.name,
        localPath: component.localPath,
        upstreamComponent: component.upstreamComponent,
        comparisonStrategy: component.comparisonStrategy,
        classification: component.classification,
        status: 'ok',
        differences: [],
        upstreamSource: component.upstreamSource,
        upstreamFetched: false,
        error: null,
    };

    // Manual strategy: no automated comparison possible.
    if (component.comparisonStrategy === 'manual') {
        result.status = 'manual-review';
        result.differences = [
            'role-equivalent shim; no automated source comparison — requires manual compatibility review',
        ];
        return result;
    }

    // Structural strategy: fetch upstream baseline and compare.
    let upstreamSource;
    try {
        upstreamSource = await fetchWithTimeout(component.upstreamSource);
        result.upstreamFetched = true;
    } catch (error) {
        result.status = 'upstream-error';
        result.error = `failed to retrieve upstream source: ${error.message}`;
        return result;
    }

    const upstreamStructure = extractComponentStructure(upstreamSource);

    if (upstreamStructure.size === 0) {
        result.status = 'upstream-error';
        result.error = `upstream source for ${component.upstreamComponent} contained no parseable component exports`;
        return result;
    }

    const local = readLocalComponent(component.localPath);
    if (!local.ok) {
        result.status = 'error';
        result.error = local.error;
        return result;
    }

    const differences = compareStructures(local.structure, upstreamStructure);

    if (differences.length > 0) {
        result.status = 'structural-difference';
        result.differences = differences;
    }

    return result;
}

/**
 * Audit a single component in drift mode: compares the latest upstream
 * source against the baseline structure.
 */
export async function auditComponentDrift(component, baselineStructure, latestUrl, latestCommit) {
    const result = {
        name: component.name,
        localPath: component.localPath,
        upstreamComponent: component.upstreamComponent,
        comparisonStrategy: component.comparisonStrategy,
        classification: component.classification,
        status: 'ok',
        differences: [],
        upstreamSource: latestUrl,
        upstreamFetched: false,
        commit: latestCommit,
        error: null,
    };

    // Manual strategy: no automated comparison possible.
    if (component.comparisonStrategy === 'manual') {
        result.status = 'manual-review';
        result.differences = [
            'role-equivalent shim; no automated source comparison — requires manual compatibility review',
        ];
        return result;
    }

    let latestSource;
    try {
        latestSource = await fetchWithTimeout(latestUrl);
        result.upstreamFetched = true;
    } catch (error) {
        result.status = 'upstream-error';
        result.error = `failed to retrieve upstream source: ${error.message}`;
        return result;
    }

    const latestStructure = extractComponentStructure(latestSource);

    if (latestStructure.size === 0) {
        result.status = 'upstream-error';
        result.error = `upstream source for ${component.upstreamComponent} at ${latestCommit} contained no parseable component exports`;
        return result;
    }

    const differences = compareStructures(
        baselineStructure || new Map(),
        latestStructure,
    );

    if (differences.length > 0) {
        result.status = 'structural-difference';
        result.differences = differences;
    }

    return result;
}

/**
 * Build a human-readable report from audit results.
 */
export function buildReport(results) {
    const lines = [];

    lines.push('shadcn/ui compatibility audit');
    lines.push('===============================');
    lines.push('');

    let structuralDifferences = 0;
    let manualReview = 0;
    let upstreamErrors = 0;
    let localErrors = 0;

    for (const result of results) {
        switch (result.status) {
            case 'ok':
                lines.push(`[ok] ${result.name}: no structural differences`);
                break;
            case 'manual-review':
                manualReview += 1;
                lines.push(
                    `[manual-review] ${result.name}: ${result.differences.join(' ')}`,
                );
                break;
            case 'structural-difference':
                structuralDifferences += 1;
                lines.push(`[review-required] ${result.name}:`);
                for (const diff of result.differences) {
                    lines.push(`  - ${diff}`);
                }
                break;
            case 'upstream-error':
                upstreamErrors += 1;
                lines.push(`[upstream-error] ${result.name}: ${result.error}`);
                break;
            case 'error':
                localErrors += 1;
                lines.push(`[error] ${result.name}: ${result.error}`);
                break;
            default:
                lines.push(`[error] ${result.name}: ${result.error}`);
                localErrors += 1;
        }
    }

    lines.push('');
    lines.push('Summary:');
    lines.push(`  - ${results.length} component(s) audited`);
    lines.push(
        `  - ${results.length - structuralDifferences - manualReview - upstreamErrors - localErrors} with no structural differences`,
    );
    lines.push(`  - ${manualReview} requiring manual review`);
    lines.push(`  - ${structuralDifferences} with upstream structural differences requiring review`);
    lines.push(`  - ${upstreamErrors} with upstream retrieval errors`);
    lines.push(`  - ${localErrors} with local file errors`);

    if (structuralDifferences > 0 || localErrors > 0) {
        lines.push('');
        lines.push(
            'These are signals for review, not instructions to copy upstream code. '
            + 'Local compatibility shims are intentionally simplified and must not '
            + 'be automatically synchronized with upstream.',
        );
    }

    return lines.join('\n');
}

/**
 * Main entry point.
 *
 * @param {boolean} drift - When true, runs drift detection mode (compares
 *   latest upstream against baseline). When false, runs validation mode
 *   (compares local shims against baseline upstream).
 */
export async function main(drift = false) {
    let manifest;
    try {
        manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
    } catch (error) {
        console.error(
            `error: cannot read manifest ${MANIFEST_PATH}: ${error.message}`,
        );
        process.exit(2);
    }

    // Validate manifest structure.
    const validation = validateManifest(manifest);
    if (!validation.valid) {
        console.error('error: manifest validation failed:');
        for (const error of validation.errors) {
            console.error(`  - ${error}`);
        }
        process.exit(1);
    }

    const components = manifest.components || [];
    const results = [];
    let latestCommit = null;

    if (drift) {
        // Drift mode: discover the latest upstream commit.
        latestCommit = await discoverLatestCommit();
        if (!latestCommit) {
            console.error(
                'error: drift mode failed to discover latest upstream commit',
            );
            process.exit(2);
        }
        console.log(
            `drift detection: baseline=${manifest.upstream.baselineCommit}, latest=${latestCommit}`,
        );

        // If latest equals baseline, there is nothing to drift-check.
        if (latestCommit === manifest.upstream.baselineCommit) {
            console.log(
                'drift detection: latest commit equals baseline — no drift to check',
            );
            console.log(buildReport([]));
            process.exit(0);
        }

        // Fetch baseline structures for all structural components first.
        const baselineStructures = new Map();
        for (const component of components) {
            if (component.comparisonStrategy !== 'structural') continue;
            const baselineUrl = buildUpstreamUrl(
                manifest.upstream,
                component.upstreamComponent,
                manifest.upstream.baselineCommit,
            );
            try {
                const baselineSource = await fetchWithTimeout(baselineUrl);
                const structure = extractComponentStructure(baselineSource);
                if (structure.size > 0) {
                    baselineStructures.set(component.name, structure);
                }
            } catch (error) {
                console.error(
                    `error: failed to fetch baseline for ${component.name}: ${error.message}`,
                );
                process.exit(2);
            }
        }

        // Audit each component at the latest commit.
        for (const component of components) {
            if (component.comparisonStrategy !== 'structural') {
                results.push({
                    name: component.name,
                    localPath: component.localPath,
                    upstreamComponent: component.upstreamComponent,
                    comparisonStrategy: component.comparisonStrategy,
                    classification: component.classification,
                    status: 'manual-review',
                    differences: [
                        'role-equivalent shim; no automated source comparison — requires manual compatibility review',
                    ],
                    upstreamSource: buildUpstreamUrl(
                        manifest.upstream,
                        component.upstreamComponent,
                        latestCommit,
                    ),
                    upstreamFetched: false,
                    commit: latestCommit,
                    error: null,
                });
                continue;
            }

            const latestUrl = buildUpstreamUrl(
                manifest.upstream,
                component.upstreamComponent,
                latestCommit,
            );
            const baselineStructure = baselineStructures.get(component.name);
            const result = await auditComponentDrift(
                component,
                baselineStructure,
                latestUrl,
                latestCommit,
            );
            results.push(result);
        }
    } else {
        // Validation mode: compare local shims against baseline upstream.
        for (const component of components) {
            const result = await auditComponent(component);
            results.push(result);
        }
    }

    const report = buildReport(results);
    console.log(report);

    const hasStructuralDifferences = results.some(
        (r) => r.status === 'structural-difference',
    );
    const hasUpstreamErrors = results.some((r) => r.status === 'upstream-error');
    const hasLocalErrors = results.some((r) => r.status === 'error');

    if (hasUpstreamErrors || hasLocalErrors) {
        process.exit(2);
    }

    if (hasStructuralDifferences) {
        process.exit(1);
    }

    process.exit(0);
}

if (import.meta.main) {
    const drift = process.argv.includes('--drift');
    main(drift).catch((error) => {
        console.error(`error: audit failed: ${error.message}`);
        process.exit(2);
    });
}
