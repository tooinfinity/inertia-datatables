// Type declarations for scripts/ci/protected-paths.js (runtime is plain JS).
export function parseChangedFiles(input: string): string[];
export function isProtectedPath(path: string): boolean;
export function findProtectedChanges(input: string): string[];
export function buildFailureMessage(protectedChanges: string[]): string;
export function buildAuthorizedMessage(
    protectedChanges: string[],
    actor: string,
    timestamp: string,
): string;
export interface ProtectedCheckResult {
    ok: boolean;
    protectedChanges: string[];
    authorized?: boolean;
    message?: string;
}
export function main(
    input: string,
    env?: Record<string, string | undefined>,
): ProtectedCheckResult;
