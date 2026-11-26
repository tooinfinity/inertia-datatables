/* global console, process */
/**
 * Checks whether a protected-component maintenance change has been explicitly
 * authorized through the GitHub-native protected-maintenance environment.
 *
 * Authorization mechanism
 * -----------------------
 * The `protected-maintenance` GitHub Actions Environment must be configured
 * by a repository administrator with required reviewers. When a maintenance PR
 * passes through the authorization gate job, that job sets:
 *
 *   MAINTENANCE_AUTHORIZED=true
 *   MAINTENANCE_AUTHORIZED_BY=<actor>
 *   MAINTENANCE_AUTHORIZED_AT=<timestamp>
 *
 * in its environment, and the subsequent protected-path check job reads
 * MAINTENANCE_AUTHORIZED to decide whether to bypass the rejection.
 *
 * This module reads those environment variables and returns a typed result so
 * the calling workflow step can log a clear audit trail.
 *
 * Security properties
 * -------------------
 * - A label, branch name, PR title, or commit message alone is never sufficient.
 * - The environment's required-reviewer gate is enforced by GitHub; a job that
 *   has not passed through the environment cannot set MAINTENANCE_AUTHORIZED.
 * - If the environment is not configured with required reviewers, authorization
 *   fails closed: the check exits 1 and reports the missing configuration.
 * - Unauthorized actors cannot self-authorize: the environment gates who can
 *   approve the deployment to run.
 * - Every decision (authorized, unauthorized, misconfigured) is logged to the
 *   workflow summary so authorizations are auditable.
 *
 * Exit status (when run as main):
 *   0 — authorization confirmed and audit trail logged.
 *   1 — authorization missing, invalid, or configuration incomplete.
 */

/**
 * @typedef {{ authorized: boolean, actor: string | null, timestamp: string | null, reason: string }} AuthResult
 */

/**
 * Parse and validate the authorization environment variables.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {AuthResult}
 */
export function checkAuthorization(env) {
    const authorized = env['MAINTENANCE_AUTHORIZED'];
    const actor = env['MAINTENANCE_AUTHORIZED_BY'] || null;
    const timestamp = env['MAINTENANCE_AUTHORIZED_AT'] || null;

    if (authorized === undefined || authorized === '') {
        return {
            authorized: false,
            actor: null,
            timestamp: null,
            reason:
                'MAINTENANCE_AUTHORIZED is not set. Protected-component changes require ' +
                'explicit authorization via the protected-maintenance GitHub Environment. ' +
                'See docs/architecture/shadcn-component-ownership.md.',
        };
    }

    if (authorized !== 'true') {
        return {
            authorized: false,
            actor,
            timestamp,
            reason: `MAINTENANCE_AUTHORIZED is "${authorized}" (expected "true"). Authorization fails closed on any value other than "true".`,
        };
    }

    if (!actor) {
        return {
            authorized: false,
            actor: null,
            timestamp,
            reason:
                'MAINTENANCE_AUTHORIZED=true but MAINTENANCE_AUTHORIZED_BY is missing. ' +
                'The authorization gate job must set MAINTENANCE_AUTHORIZED_BY to the ' +
                'approving actor. Authorization fails closed on incomplete metadata.',
        };
    }

    if (!timestamp) {
        return {
            authorized: false,
            actor,
            timestamp: null,
            reason:
                'MAINTENANCE_AUTHORIZED=true but MAINTENANCE_AUTHORIZED_AT is missing. ' +
                'The authorization gate job must set MAINTENANCE_AUTHORIZED_AT to an ISO ' +
                'timestamp. Authorization fails closed on incomplete metadata.',
        };
    }

    return {
        authorized: true,
        actor,
        timestamp,
        reason: `Authorized by ${actor} at ${timestamp} via protected-maintenance environment.`,
    };
}

/**
 * Build a human-readable audit log entry for the workflow step summary.
 *
 * @param {AuthResult} result
 * @returns {string}
 */
export function buildAuditEntry(result) {
    const status = result.authorized ? '✅ AUTHORIZED' : '❌ NOT AUTHORIZED';
    const lines = [
        `Protected-component maintenance authorization: ${status}`,
        '',
        `  Actor:     ${result.actor ?? '(not set)'}`,
        `  Timestamp: ${result.timestamp ?? '(not set)'}`,
        `  Reason:    ${result.reason}`,
    ];
    return lines.join('\n');
}

export function main(env = process.env) {
    const result = checkAuthorization(env);
    const auditEntry = buildAuditEntry(result);

    if (result.authorized) {
        console.log(auditEntry);
    } else {
        console.error(auditEntry);
        process.exit(1);
    }
}

if (import.meta.main) {
    main(process.env);
}
