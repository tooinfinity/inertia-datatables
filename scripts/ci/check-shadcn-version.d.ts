// Type declarations for scripts/ci/check-shadcn-version.js (runtime is plain JS).

export function readPinnedVersion(): string;
export function findWorkflowVersions(content: string): Array<{ version: string; line: number }>;
export function checkVersionConsistency(
    pinnedVersion: string,
    workflowVersions: Array<{ version: string; line: number }>,
): { ok: boolean; mismatches: Array<{ version: string; line: number }> };
export function buildDriftMessage(
    pinnedVersion: string,
    mismatches: Array<{ version: string; line: number }>,
    workflowPath: string,
): string;
export function main(): void;
