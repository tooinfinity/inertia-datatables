// Type declarations for scripts/ci/shadcn-compatibility-audit.js (runtime is plain JS).

export interface ComponentStructure {
    name: string;
    elements: Set<string>;
}

export interface AuditComponentResult {
    name: string;
    localPath: string;
    upstreamComponent: string;
    comparisonStrategy: string;
    classification: string;
    status: string;
    differences: string[];
    upstreamSource: string;
    upstreamFetched: boolean;
    commit?: string | null;
    error: string | null;
}

export function fetchWithTimeout(url: string, timeoutMs?: number): Promise<string>;
export function fetchJsonWithTimeout(url: string, timeoutMs?: number): Promise<unknown>;
export function discoverLatestCommit(upstream: {
    repository: string;
    branch: string;
}): Promise<string | null>;
export function buildUpstreamUrl(
    upstream: { rawUrlTemplate: string },
    componentName: string,
    commit: string,
): string;
export function extractComponentStructure(source: string): {
    components: Map<string, Set<string>>;
    error: string | null;
};
export function readLocalComponent(localPath: string):
    | { ok: true; source: string; structure: Map<string, Set<string>> }
    | { ok: false; error: string };
export function compareStructures(
    localStructure: Map<string, Set<string>>,
    upstreamStructure: Map<string, Set<string>>,
): string[];
export function validateManifest(manifest: unknown): {
    valid: boolean;
    errors: string[];
};
export function auditComponent(
    component: {
        name: string;
        localPath: string;
        upstreamComponent: string;
        comparisonStrategy: string;
        classification: string;
        upstreamSource: string;
    },
    upstreamUrl: string,
): Promise<AuditComponentResult>;
export function auditComponentDrift(
    component: {
        name: string;
        localPath: string;
        upstreamComponent: string;
        comparisonStrategy: string;
        classification: string;
    },
    baselineStructure: Map<string, Set<string>> | null,
    latestUrl: string,
    latestCommit: string,
): Promise<AuditComponentResult>;
export function buildReport(results: AuditComponentResult[]): string;
export function main(drift?: boolean): Promise<void>;
