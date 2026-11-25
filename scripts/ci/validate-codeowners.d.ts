// Type declarations for scripts/ci/validate-codeowners.js (runtime is plain JS).
export const REQUIRED_PATHS: readonly string[];

export interface CodeownersRule {
    pattern: string;
    owners: string[];
    raw: string;
}

export interface CodeownersValidationResult {
    valid: boolean;
    errors: string[];
    rules: CodeownersRule[];
}

export function parseRule(line: string): CodeownersRule | null;
export function patternMatches(path: string, pattern: string): boolean;
export function validateCodeowners(
    content: string,
    requiredPaths?: readonly string[],
): CodeownersValidationResult;
export function main(): void;
