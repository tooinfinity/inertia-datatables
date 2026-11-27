/* global console, process */
/**
 * scripts/ci/shadcn-upstream-update.js
 *
 * Automated shadcn/ui upstream-update proposal generation.
 *
 * Detects upstream drift against the pinned baseline (scripts/ci/
 * shadcn-compatibility-manifest.json), classifies each tracked component as
 * unchanged, modified, added, or removed, and builds a reviewable pull-request
 * proposal containing only the changes that can be applied safely.
 *
 * This is a PROPOSAL-GENERATION workflow, not an automatic update:
 *   * Local compatibility shims are never blindly overwritten.
 *   * A component is updated automatically only when it is a `structural`
 *     component AND its local shim still matches the pinned baseline exactly
 *     (no local customizations). Every other component is reported as skipped
 *     or conflicting and is excluded from automatic changes.
 *   * Components with local modifications (including all six manual
 *     role-equivalent shims, whose upstream source diff is not meaningful) are
 *     preserved and reported for manual review.
 *   * No pull request is created when there are no safely applicable changes.
 *
 * Modes:
 *   detect (default): reads the manifest, detects drift, builds a proposal,
 *   and prints a summary to stdout. No files are modified.
 *   apply (CI only, invoked with --apply and CI set): additionally writes the
 *   safe changes to the working tree and bumps the manifest baseline so the
 *   calling workflow can commit, validate, and propose them in a pull request.
 *
 * Exit status:
 *   0 — success, no relevant upstream changes (no pull request).
 *   1 — manifest validation failure or an invalid/incomplete update.
 *   2 — upstream source unavailable or unreachable.
 *   3 — success, safely applicable changes were detected/applied (the caller
 *     decides whether to commit and open a pull request).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
    buildUpstreamUrl,
    compareStructures,
    discoverLatestCommit,
    extractComponentStructure,
    fetchWithTimeout,
    readLocalComponent,
    validateManifest,
} from './shadcn-compatibility-audit.js';

const MANIFEST_PATH = 'scripts/ci/shadcn-compatibility-manifest.json';

const STATUS_UNCHANGED = 'unchanged';
const STATUS_MODIFIED = 'modified';
const STATUS_ADDED = 'added';
const STATUS_REMOVED = 'removed';
const STATUS_UNAVAILABLE = 'unavailable';
const STATUS_MANUAL_REVIEW = 'manual-review';

/**
 * Structural components are the only ones eligible for automated comparison.
 * The six manual role-equivalent shims are never auto-updated.
 */
export function isStructuralComponent(component) {
    return component.comparisonStrategy === 'structural';
}

function normalizeSource(source) {
    return source.replace(/\r\n/g, '\n').trim();
}

/**
 * Compare two component structures (name -> rendered HTML element set) and,
 * when available, their normalized source strings to report whether a local
 * shim has drifted from its pinned baseline.
 *
 * Returns { modified: boolean, detail: string | null }.
 */
export function hasLocalModification(
    localStructure,
    baselineStructure,
    localSource = null,
    baselineSource = null,
) {
    if (!localStructure || !baselineStructure) {
        return { modified: true, detail: 'unable to compare local shim against baseline' };
    }

    const localNames = [...localStructure.keys()].sort();
    const baselineNames = [...baselineStructure.keys()].sort();
    if (JSON.stringify(localNames) !== JSON.stringify(baselineNames)) {
        return {
            modified: true,
            detail: 'exported component names differ from the pinned baseline',
        };
    }

    for (const name of localNames) {
        const localElements = [...(localStructure.get(name) || [])].sort();
        const baselineElements = [...(baselineStructure.get(name) || [])].sort();
        if (JSON.stringify(localElements) !== JSON.stringify(baselineElements)) {
            return {
                modified: true,
                detail: `component "${name}" renders different HTML elements than the pinned baseline`,
            };
        }
    }

    if (typeof localSource === 'string' && typeof baselineSource === 'string') {
        if (normalizeSource(localSource) !== normalizeSource(baselineSource)) {
            return {
                modified: true,
                detail: 'local shim source differs from the pinned baseline',
            };
        }
    }

    return { modified: false, detail: null };
}

/**
 * Return true when a component may be updated automatically without risking
 * the loss of local customizations.
 */
export function isSafeToApply(component, result) {
    if (!isStructuralComponent(component)) return false;
    if (result.status !== STATUS_MODIFIED && result.status !== STATUS_ADDED) return false;
    if (result.localModification) return false;
    if (result.error) return false;
    return true;
}

/**
 * Build a pull-request title for a proposal.
 */
export function buildPrTitle(proposal) {
    const count = proposal.summary.safeToApply || 0;
    const componentWord = count === 1 ? 'component' : 'components';
    return `chore: automated shadcn/ui upstream update (${count} ${componentWord})`;
}

/**
 * Build a pull-request body for a proposal.
 */
export function buildPrBody(proposal) {
    const { upstream, summary, components, checkedAt } = proposal;
    const lines = [];

    lines.push('## Automated shadcn/ui upstream update proposal');
    lines.push('');
    lines.push(
        'This pull request was generated automatically by the shadcn/ui upstream-update '
        + 'workflow. It is a **proposal only**: it is not authorized to modify protected '
        + 'components, it will not be auto-merged, and it still requires the normal human '
        + 'review and protected-maintenance approval process before anything can change.',
    );
    lines.push('');
    lines.push('### Upstream source');
    lines.push(`- Repository: ${upstream.repository}`);
    lines.push(`- Branch: ${upstream.branch}`);
    lines.push(`- Pinned baseline: ${upstream.baselineCommit}`);
    lines.push(`- Latest upstream: ${upstream.latestCommit}`);
    lines.push(`- Style: ${upstream.style}`);
    lines.push(`- Checked at: ${checkedAt}`);
    lines.push('');
    lines.push('### Change summary');
    lines.push(`- Components audited: ${summary.total}`);
    lines.push(`- Unchanged: ${summary.unchanged}`);
    lines.push(`- Modified upstream: ${summary.modified}`);
    lines.push(`- Added upstream: ${summary.added}`);
    lines.push(`- Removed upstream: ${summary.removed}`);
    lines.push(`- Unavailable (fetch/parse failure): ${summary.unavailable}`);
    lines.push(`- Manual review only: ${summary.manualReview}`);
    lines.push(`- Safely applicable (no local customizations): ${summary.safeToApply}`);
    lines.push(`- Conflicts / skipped (local customizations preserved): ${summary.conflicts}`);
    lines.push('');
    lines.push('### Affected components');

    for (const component of components) {
        lines.push(`- **${component.name}** (\`${component.upstreamComponent}\`) — ${component.status}`);
        if (component.latestCommit) {
            lines.push(`  - Latest commit: ${component.latestCommit}`);
        }
        if (component.differences && component.differences.length) {
            lines.push('  - Detected upstream differences:');
            for (const difference of component.differences) {
                lines.push(`    - ${difference}`);
            }
        }
        if (component.localModification) {
            lines.push(`  - Local customizations preserved: yes`);
            lines.push(`  - Reason: ${component.localModificationDetail || 'local shim differs from pinned baseline'}`);
        }
        if (component.skipReason) {
            lines.push(`  - Skipped: ${component.skipReason}`);
        }
        if (component.error) {
            lines.push(`  - Error: ${component.error}`);
        }
        lines.push('');
    }

    const conflicts = components.filter(
        (c) => c.localModification || c.skipReason || c.error,
    );
    if (conflicts.length) {
        lines.push('### Conflicts and skipped components');
        lines.push(
            'The following components were intentionally left unchanged because they carry local '
            + 'customizations, are manual role-equivalent shims, or could not be validated. They '
            + 'require a dedicated maintenance PR with explicit maintainer authorization.',
        );
        lines.push('');
        for (const component of conflicts) {
            lines.push(
                `- ${component.name}: ${component.skipReason || component.localModificationDetail || component.error || 'not safely applicable'}`,
            );
        }
        lines.push('');
    }

    lines.push('### Validation');
    lines.push(
        'The generated changes are validated by `npm run registry:validate`, `npm run registry:build`, '
        + 'the compatibility audit (validation mode), and the shadcn CLI version consistency check '
        + 'before the pull request is proposed. Generated `public/r` registry artifacts are rebuilt '
        + 'and included in this pull request.',
    );
    lines.push('');
    lines.push('### What happens next');
    lines.push(
        'A maintainer reviews this proposal. If the changes are accepted, the pull request must pass '
        + 'through the `protected-maintenance` GitHub Environment (human reviewer approval) and satisfy '
        + 'CODEOWNER review and all required status checks before it can be merged. This workflow never '
        + 'approves, merges, or closes its own pull requests.',
    );
    lines.push('');
    lines.push('---');
    lines.push('Generated by the automated shadcn/ui upstream-update workflow.');

    return lines.join('\n');
}

function emptySummary() {
    return {
        total: 0,
        unchanged: 0,
        modified: 0,
        added: 0,
        removed: 0,
        unavailable: 0,
        manualReview: 0,
        safeToApply: 0,
        conflicts: 0,
        skipped: 0,
    };
}

function emptyProposal(manifest) {
    const upstream = manifest.upstream;
    const baselineCommit = upstream.baselineCommit;
    const components = manifest.components.map((component) => ({
        ...component,
        status: STATUS_UNCHANGED,
        baselineCommit,
        latestCommit: baselineCommit,
        differences: [],
        localModification: false,
        localModificationDetail: null,
        safeToApply: false,
        skipReason: null,
        upstreamFetched: false,
        error: null,
    }));
    const summary = emptySummary();
    summary.total = components.length;
    summary.unchanged = components.length;

    return {
        upstream: {
            repository: upstream.repository,
            branch: upstream.branch,
            baselineCommit,
            latestCommit: baselineCommit,
            style: upstream.style,
        },
        checkedAt: new Date().toISOString(),
        components,
        summary,
        shouldCreatePr: false,
        error: null,
        exitCode: 0,
    };
}

/**
 * Build a proposal object from detection results (pre-apply view).
 */
function buildProposal(manifest, results, latestCommit) {
    const upstream = manifest.upstream;
    const summary = emptySummary();
    summary.total = results.length;

    for (const result of results) {
        switch (result.status) {
            case STATUS_UNCHANGED:
                summary.unchanged++;
                break;
            case STATUS_MODIFIED:
                summary.modified++;
                break;
            case STATUS_ADDED:
                summary.added++;
                break;
            case STATUS_REMOVED:
                summary.removed++;
                break;
            case STATUS_UNAVAILABLE:
                summary.unavailable++;
                break;
            case STATUS_MANUAL_REVIEW:
                summary.manualReview++;
                break;
        }
        if (result.safeToApply) summary.safeToApply++;
        if (result.localModification || result.skipReason || result.error) summary.conflicts++;
        if (result.skipReason || result.status === STATUS_MANUAL_REVIEW || result.status === STATUS_UNAVAILABLE) summary.skipped++;
    }

    return {
        upstream: {
            repository: upstream.repository,
            branch: upstream.branch,
            baselineCommit: upstream.baselineCommit,
            latestCommit,
            style: upstream.style,
        },
        checkedAt: new Date().toISOString(),
        components: results,
        summary,
        shouldCreatePr: summary.safeToApply > 0,
        error: null,
        exitCode: 0,
    };
}

/**
 * Detect upstream drift for every tracked component.
 *
 * Returns { latestCommit, results, error, exitCode }. Each result carries the
 * baseline/latest comparison, local-modification status, and whether the
 * component may be updated automatically.
 */
export async function detectComponents(manifest, localBaseDir = process.cwd()) {
    const upstream = manifest.upstream;
    const baselineCommit = upstream.baselineCommit;
    const results = [];

    const latestCommit = await discoverLatestCommit(upstream);
    if (!latestCommit) {
        return {
            latestCommit: null,
            results: [],
            error: 'failed to discover the latest upstream commit from the GitHub API',
            exitCode: 2,
        };
    }

    // No drift at all: latest equals the pinned baseline.
    if (latestCommit === baselineCommit) {
        for (const component of manifest.components) {
            results.push({
                ...component,
                status: STATUS_UNCHANGED,
                baselineCommit,
                latestCommit,
                differences: [],
                localModification: false,
                localModificationDetail: null,
                safeToApply: false,
                skipReason: null,
                upstreamFetched: false,
                error: null,
            });
        }
        return { latestCommit, results, error: null, exitCode: 0 };
    }

    for (const component of manifest.components) {
        const result = {
            ...component,
            baselineCommit,
            latestCommit,
            baselineUrl: buildUpstreamUrl(upstream, component.upstreamComponent, baselineCommit),
            latestUrl: buildUpstreamUrl(upstream, component.upstreamComponent, latestCommit),
            differences: [],
            localModification: false,
            localModificationDetail: null,
            safeToApply: false,
            skipReason: null,
            upstreamFetched: false,
            error: null,
        };

        // Manual role-equivalent shims are never automatically compared.
        if (!isStructuralComponent(component)) {
            result.status = STATUS_MANUAL_REVIEW;
            result.skipReason =
                'role-equivalent shim; upstream source diff is not meaningful — requires manual compatibility review';
            results.push(result);
            continue;
        }

        let baselineSource;
        let baselineStructure;
        try {
            baselineSource = await fetchWithTimeout(result.baselineUrl);
            result.upstreamFetched = true;
            const parsed = extractComponentStructure(baselineSource);
            if (parsed.error) {
                throw new Error(parsed.error);
            }
            baselineStructure = parsed.components;
        } catch (error) {
            result.status = STATUS_UNAVAILABLE;
            result.error = `failed to retrieve or parse baseline upstream source: ${error.message}`;
            results.push(result);
            continue;
        }

        let latestStructure;
        try {
            const latestSource = await fetchWithTimeout(result.latestUrl);
            const parsed = extractComponentStructure(latestSource);
            if (parsed.error) {
                throw new Error(parsed.error);
            }
            latestStructure = parsed.components;
        } catch (error) {
            result.status = STATUS_UNAVAILABLE;
            result.error = `failed to retrieve or parse latest upstream source: ${error.message}`;
            results.push(result);
            continue;
        }

        // Classify added / removed / modified / unchanged.
        if (baselineStructure.size === 0 && latestStructure.size > 0) {
            result.status = STATUS_ADDED;
        } else if (baselineStructure.size > 0 && latestStructure.size === 0) {
            result.status = STATUS_REMOVED;
        } else {
            result.differences = compareStructures(baselineStructure, latestStructure);
            result.status = result.differences.length
                ? STATUS_MODIFIED
                : STATUS_UNCHANGED;
        }

        // Detect local customizations by comparing the local shim against the
        // pinned baseline structure. Any difference means the local shim carries
        // customizations that must not be silently discarded.
        const localPath = join(localBaseDir, component.localPath);
        const local = readLocalComponent(localPath);
        if (!local.ok) {
            // No local shim to protect: this is an addition, not an overwrite.
            result.localModification = result.status === STATUS_ADDED ? false : true;
            result.localModificationDetail = result.status === STATUS_ADDED
                ? null
                : `cannot read local shim: ${local.error}`;
        } else {
            const modification = hasLocalModification(
                local.structure,
                baselineStructure,
                local.source,
                baselineSource,
            );
            result.localModification = modification.modified;
            result.localModificationDetail = modification.detail;
        }

        result.safeToApply = isSafeToApply(component, result);

        if (result.status === STATUS_REMOVED) {
            result.safeToApply = false;
            result.skipReason = 'upstream removed this component — requires manual review';
        } else if (!result.safeToApply && result.status !== STATUS_MANUAL_REVIEW) {
            result.skipReason = result.localModification
                ? 'local customizations preserved — not safe to overwrite automatically'
                : result.error || 'not safe to apply automatically';
        }

        results.push(result);
    }

    return { latestCommit, results, error: null, exitCode: 0 };
}

/**
 * Read the manifest, detect drift, and build a proposal. No files are modified.
 */
export async function detectAndPropose(manifest, options = {}) {
    const upstream = manifest.upstream;

    const validation = validateManifest(manifest);
    if (!validation.valid) {
        return {
            upstream: {
                repository: upstream?.repository,
                branch: upstream?.branch,
                baselineCommit: upstream?.baselineCommit,
                latestCommit: upstream?.baselineCommit,
                style: upstream?.style,
            },
            checkedAt: new Date().toISOString(),
            components: [],
            summary: emptySummary(),
            shouldCreatePr: false,
            error: 'manifest validation failed: ' + validation.errors.join('; '),
            exitCode: 1,
        };
    }

    const { latestCommit, results, error, exitCode } = await detectComponents(manifest, options.localBaseDir);

    if (error) {
        return {
            upstream: {
                repository: upstream.repository,
                branch: upstream.branch,
                baselineCommit: upstream.baselineCommit,
                latestCommit: upstream.baselineCommit,
                style: upstream.style,
            },
            checkedAt: new Date().toISOString(),
            components: [],
            summary: emptySummary(),
            shouldCreatePr: false,
            error,
            exitCode,
        };
    }

    // No drift since the baseline: nothing to propose.
    if (latestCommit === upstream.baselineCommit) {
        return emptyProposal(manifest);
    }

    return buildProposal(manifest, results, latestCommit);
}

/**
 * Write the safely applicable changes to the working tree and bump the pinned
 * baseline to the latest upstream commit. Returns the set of changed file
 * paths so the caller can commit them.
 *
 * This is intentionally side-effecting and is only invoked by the CI workflow
 * in apply mode. The returned proposal is the pre-apply view, suitable for
 * rendering the pull-request title and body.
 */
export async function applyChanges(manifestPath = MANIFEST_PATH, options = {}) {
    const localBaseDir = options.localBaseDir || process.cwd();

    let manifest;
    try {
        manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    } catch (error) {
        throw new Error(`cannot read manifest ${manifestPath}: ${error.message}`);
    }

    const validation = validateManifest(manifest);
    if (!validation.valid) {
        throw new Error('manifest validation failed: ' + validation.errors.join('; '));
    }

    const { latestCommit, results, error } = await detectComponents(manifest, localBaseDir);
    if (error) {
        throw new Error(error);
    }

    // No drift: nothing to apply.
    if (latestCommit === manifest.upstream.baselineCommit) {
        return { changedFiles: [], shouldApply: false, proposal: emptyProposal(manifest) };
    }

    // Pre-apply proposal describes what will be proposed in the pull request.
    const proposal = buildProposal(manifest, results, latestCommit);

    const changedFiles = [];

    for (const result of results) {
        if (!result.safeToApply) continue;

        const latestSource = await fetchWithTimeout(result.latestUrl);
        const targetPath = join(localBaseDir, result.localPath);
        writeFileSync(targetPath, latestSource, 'utf-8');
        changedFiles.push(result.localPath);
    }

    // Nothing safe to apply: leave the manifest untouched so the baseline is
    // not advanced without accepted changes, while preserving the proposal's
    // upstream-change and conflict details for review.
    if (changedFiles.length === 0) {
        return { changedFiles: [], shouldApply: false, proposal };
    }

    // Bump the pinned baseline so the next audit compares the now-updated
    // local shims against the accepted upstream revision. Without this the
    // workflow would re-detect the same drift on every run.
    const upstream = manifest.upstream;
    upstream.baselineCommit = latestCommit;
    upstream.currentCommit = latestCommit;
    for (const component of manifest.components) {
        component.upstreamSource = buildUpstreamUrl(upstream, component.upstreamComponent, latestCommit);
    }
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
    changedFiles.push(manifestPath);

    return { changedFiles, shouldApply: changedFiles.length > 0, proposal };
}

/**
 * Command-line entry point.
 *
 *   node scripts/ci/shadcn-upstream-update.js           # detect mode (no file changes)
 *   node scripts/ci/shadcn-upstream-update.js --apply   # CI apply mode
 *
 * The PROPOSAL_OUTPUT_FILE, PR_TITLE_FILE and PR_BODY_FILE environment
 * variables, when set, receive the proposal JSON and rendered title/body so a
 * CI workflow can open the pull request.
 */
export async function main(argv) {
    const apply = argv.includes('--apply');
    const help = argv.includes('--help') || argv.includes('-h');

    if (help) {
        console.log('Usage: node scripts/ci/shadcn-upstream-update.js [--apply]');
        console.log('');
        console.log('  (no args)   Detect upstream drift and print a proposal summary (no file changes).');
        console.log('  --apply     CI mode: write safely applicable changes to the working tree.');
        console.log('');
        console.log('Environment:');
        console.log('  PROPOSAL_OUTPUT_FILE  path to write the full proposal JSON (CI apply mode).');
        console.log('  PR_TITLE_FILE         path to write the rendered pull-request title (CI apply mode).');
        console.log('  PR_BODY_FILE          path to write the rendered pull-request body (CI apply mode).');
        return 0;
    }

    let manifest;
    try {
        manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
    } catch (error) {
        console.error(`error: cannot read manifest ${MANIFEST_PATH}: ${error.message}`);
        return 1;
    }

    if (apply) {
        const { changedFiles, shouldApply, proposal } = await applyChanges(MANIFEST_PATH);
        if (proposal.error) {
            console.error(`error: ${proposal.error}`);
            return proposal.exitCode;
        }

        console.log(buildHumanSummary(proposal));

        if (!shouldApply) {
            console.log('No safely applicable upstream changes — no pull request will be created.');
            return 0;
        }

        const outputFile = process.env.PROPOSAL_OUTPUT_FILE;
        if (outputFile) {
            writeFileSync(outputFile, JSON.stringify(proposal, null, 2) + '\n', 'utf-8');
        }
        const titleFile = process.env.PR_TITLE_FILE;
        if (titleFile) {
            writeFileSync(titleFile, buildPrTitle(proposal) + '\n', 'utf-8');
        }
        const bodyFile = process.env.PR_BODY_FILE;
        if (bodyFile) {
            writeFileSync(bodyFile, buildPrBody(proposal) + '\n', 'utf-8');
        }
        console.log(`Safely applicable changes detected (${changedFiles.length} file(s) updated) — ready to propose a pull request.`);
        return 3;
    }

    // Detect-only mode: no file changes.
    const proposal = await detectAndPropose(manifest);

    if (proposal.error) {
        console.error(`error: ${proposal.error}`);
        return proposal.exitCode;
    }

    console.log(buildHumanSummary(proposal));

    if (proposal.shouldCreatePr) {
        console.log('');
        console.log('Safely applicable changes detected. Re-run with --apply in CI to commit and propose them.');
        return 3;
    }

    return 0;
}

function buildHumanSummary(proposal) {
    const { summary, upstream } = proposal;
    const lines = [];
    lines.push('shadcn/ui upstream update detection');
    lines.push('==================================');
    lines.push(`Upstream: ${upstream.repository} @ ${upstream.branch}`);
    lines.push(`Baseline: ${upstream.baselineCommit} -> Latest: ${upstream.latestCommit}`);
    lines.push('');
    lines.push(`Audited ${summary.total} component(s):`);
    lines.push(`  - unchanged: ${summary.unchanged}`);
    lines.push(`  - modified upstream: ${summary.modified}`);
    lines.push(`  - added upstream: ${summary.added}`);
    lines.push(`  - removed upstream: ${summary.removed}`);
    lines.push(`  - unavailable: ${summary.unavailable}`);
    lines.push(`  - manual review: ${summary.manualReview}`);
    lines.push(`  - safely applicable: ${summary.safeToApply}`);
    lines.push(`  - conflicts/skipped: ${summary.conflicts}`);
    lines.push('');

    for (const component of proposal.components) {
        const marker = component.safeToApply ? '[safe]' :
            component.localModification ? '[conflict]' :
            component.skipReason ? '[skipped]' : ' ';
        lines.push(`  ${marker} ${component.name} (${component.status})`);
        if (component.differences.length) {
            for (const difference of component.differences) {
                lines.push(`      - ${difference}`);
            }
        }
        if (component.skipReason) {
            lines.push(`      skipped: ${component.skipReason}`);
        }
        if (component.error) {
            lines.push(`      error: ${component.error}`);
        }
    }

    lines.push('');
    if (proposal.shouldCreatePr) {
        lines.push('Proposal: safely applicable changes detected — a pull request may be created.');
    } else {
        lines.push('Proposal: no safely applicable changes — no pull request will be created.');
    }

    return lines.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main(process.argv.slice(2)).then((exitCode) => {
        process.exit(exitCode);
    }).catch((error) => {
        console.error(`error: upstream update failed: ${error.message}`);
        process.exit(1);
    });
}
