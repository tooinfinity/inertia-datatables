// Type declarations for scripts/ci/check-maintenance-authorization.js (runtime is plain JS).

export interface AuthResult {
    authorized: boolean;
    actor: string | null;
    timestamp: string | null;
    reason: string;
}

export function checkAuthorization(env: Record<string, string | undefined>): AuthResult;
export function buildAuditEntry(result: AuthResult): string;
export function main(env?: Record<string, string | undefined>): void;
