// Type declarations for scripts/ci/protected-paths.js (runtime is plain JS).
export function parseChangedFiles(input: string): string[];
export function isProtectedPath(path: string): boolean;
export function findProtectedChanges(input: string): string[];
export function buildFailureMessage(protectedChanges: string[]): string;
export interface ProtectedCheckResult {
    ok: boolean;
    protectedChanges: string[];
    message?: string;
}
export function main(input: string): ProtectedCheckResult;
