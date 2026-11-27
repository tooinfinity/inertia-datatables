// Type declarations for scripts/ci/shadcn-upstream-update.js (runtime is plain JS).

export interface ComponentResult {
    name: string;
    localPath: string;
    upstreamComponent: string;
    comparisonStrategy: string;
    classification: string;
    status: string;
    baselineCommit: string;
    latestCommit: string;
    baselineUrl: string;
    latestUrl: string;
    differences: string[];
    localModification: boolean;
    localModificationDetail: string | null;
    safeToApply: boolean;
    skipReason: string | null;
    upstreamFetched: boolean;
    error: string | null;
}

export interface Proposal {
    upstream: {
        repository: string;
        branch: string;
        baselineCommit: string;
        latestCommit: string;
        style: string;
    };
    checkedAt: string;
    components: ComponentResult[];
    summary: {
        total: number;
        unchanged: number;
        modified: number;
        added: number;
        removed: number;
        unavailable: number;
        manualReview: number;
        safeToApply: number;
        conflicts: number;
        skipped: number;
    };
    shouldCreatePr: boolean;
    error: string | null;
    exitCode: number;
}

export function isStructuralComponent(component: { comparisonStrategy: string }): boolean;
export function hasLocalModification(
    localStructure: Map<string, Set<string>> | null,
    baselineStructure: Map<string, Set<string>> | null,
): { modified: boolean; detail: string | null };
export function isSafeToApply(
    component: { comparisonStrategy: string },
    result: { status: string; localModification: boolean; error: string | null },
): boolean;
export function buildPrTitle(proposal: Proposal): string;
export function buildPrBody(proposal: Proposal): string;
export function detectComponents(
    manifest: unknown,
    localBaseDir?: string,
): Promise<{
    latestCommit: string | null;
    results: ComponentResult[];
    error: string | null;
    exitCode: number;
}>;
export function detectAndPropose(manifest: unknown, options?: { localBaseDir?: string }): Promise<Proposal>;
export function applyChanges(
    manifestPath?: string,
    options?: { localBaseDir?: string },
): Promise<{
    changedFiles: string[];
    shouldApply: boolean;
    proposal: Proposal;
}>;
export function main(argv: string[]): Promise<number>;
