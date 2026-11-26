import { describe, expect, it } from 'vitest';
import {
    checkAuthorization,
    buildAuditEntry,
} from '../../../../scripts/ci/check-maintenance-authorization.js';

// ---------------------------------------------------------------------------
// checkAuthorization
// ---------------------------------------------------------------------------

describe('check-maintenance-authorization: checkAuthorization', () => {
    // No authorization present (ordinary PR)
    it('returns unauthorized when MAINTENANCE_AUTHORIZED is not set', () => {
        const result = checkAuthorization({});
        expect(result.authorized).toBe(false);
        expect(result.actor).toBeNull();
        expect(result.timestamp).toBeNull();
        expect(result.reason).toMatch(/MAINTENANCE_AUTHORIZED is not set/);
    });

    it('returns unauthorized when MAINTENANCE_AUTHORIZED is an empty string', () => {
        const result = checkAuthorization({ MAINTENANCE_AUTHORIZED: '' });
        expect(result.authorized).toBe(false);
        expect(result.reason).toMatch(/MAINTENANCE_AUTHORIZED is not set/);
    });

    // Routing label present but environment gate not configured (or bypassed)
    it('returns unauthorized when MAINTENANCE_AUTHORIZED is "false"', () => {
        const result = checkAuthorization({ MAINTENANCE_AUTHORIZED: 'false' });
        expect(result.authorized).toBe(false);
        expect(result.reason).toMatch(/expected "true"/);
    });

    it('returns unauthorized when MAINTENANCE_AUTHORIZED is "1" (not exactly "true")', () => {
        const result = checkAuthorization({ MAINTENANCE_AUTHORIZED: '1' });
        expect(result.authorized).toBe(false);
        expect(result.reason).toMatch(/expected "true"/);
    });

    it('returns unauthorized when MAINTENANCE_AUTHORIZED is "TRUE" (case-sensitive check)', () => {
        const result = checkAuthorization({ MAINTENANCE_AUTHORIZED: 'TRUE' });
        expect(result.authorized).toBe(false);
        expect(result.reason).toMatch(/expected "true"/);
    });

    // Authorization present but metadata incomplete
    it('returns unauthorized when MAINTENANCE_AUTHORIZED=true but MAINTENANCE_AUTHORIZED_BY is missing', () => {
        const result = checkAuthorization({
            MAINTENANCE_AUTHORIZED: 'true',
            MAINTENANCE_AUTHORIZED_AT: '2024-01-01T00:00:00Z',
        });
        expect(result.authorized).toBe(false);
        expect(result.reason).toMatch(/MAINTENANCE_AUTHORIZED_BY is missing/);
        expect(result.actor).toBeNull();
    });

    it('returns unauthorized when MAINTENANCE_AUTHORIZED=true but MAINTENANCE_AUTHORIZED_AT is missing', () => {
        const result = checkAuthorization({
            MAINTENANCE_AUTHORIZED: 'true',
            MAINTENANCE_AUTHORIZED_BY: 'tooinfinity',
        });
        expect(result.authorized).toBe(false);
        expect(result.reason).toMatch(/MAINTENANCE_AUTHORIZED_AT is missing/);
        expect(result.actor).toBe('tooinfinity');
        expect(result.timestamp).toBeNull();
    });

    it('returns unauthorized when all three vars missing', () => {
        const result = checkAuthorization({ MAINTENANCE_AUTHORIZED: 'true' });
        expect(result.authorized).toBe(false);
        // actor and timestamp both missing; reason should indicate the first missing field
        expect(result.reason).toMatch(/MAINTENANCE_AUTHORIZED_BY is missing/);
    });

    // Valid authorization
    it('returns authorized when all three vars are present and correct', () => {
        const result = checkAuthorization({
            MAINTENANCE_AUTHORIZED: 'true',
            MAINTENANCE_AUTHORIZED_BY: 'tooinfinity',
            MAINTENANCE_AUTHORIZED_AT: '2024-06-01T12:00:00Z',
        });
        expect(result.authorized).toBe(true);
        expect(result.actor).toBe('tooinfinity');
        expect(result.timestamp).toBe('2024-06-01T12:00:00Z');
        expect(result.reason).toMatch(/tooinfinity/);
        expect(result.reason).toMatch(/2024-06-01T12:00:00Z/);
    });

    it('records the correct actor from the environment', () => {
        const result = checkAuthorization({
            MAINTENANCE_AUTHORIZED: 'true',
            MAINTENANCE_AUTHORIZED_BY: 'trusted-reviewer',
            MAINTENANCE_AUTHORIZED_AT: '2024-11-26T01:00:00Z',
        });
        expect(result.authorized).toBe(true);
        expect(result.actor).toBe('trusted-reviewer');
    });
});

// ---------------------------------------------------------------------------
// buildAuditEntry
// ---------------------------------------------------------------------------

describe('check-maintenance-authorization: buildAuditEntry', () => {
    it('shows AUTHORIZED status for a successful authorization', () => {
        const result = {
            authorized: true,
            actor: 'tooinfinity',
            timestamp: '2024-06-01T12:00:00Z',
            reason: 'Authorized by tooinfinity at 2024-06-01T12:00:00Z via protected-maintenance environment.',
        };
        const entry = buildAuditEntry(result);
        expect(entry).toMatch(/AUTHORIZED/);
        expect(entry).toMatch(/tooinfinity/);
        expect(entry).toMatch(/2024-06-01T12:00:00Z/);
    });

    it('shows NOT AUTHORIZED status for a failed authorization', () => {
        const result = {
            authorized: false,
            actor: null,
            timestamp: null,
            reason: 'MAINTENANCE_AUTHORIZED is not set.',
        };
        const entry = buildAuditEntry(result);
        expect(entry).toMatch(/NOT AUTHORIZED/);
        expect(entry).toMatch(/\(not set\)/);
    });

    it('includes actor and timestamp even for partially-set failed authorization', () => {
        const result = {
            authorized: false,
            actor: 'some-actor',
            timestamp: null,
            reason: 'MAINTENANCE_AUTHORIZED_AT is missing.',
        };
        const entry = buildAuditEntry(result);
        expect(entry).toMatch(/some-actor/);
        expect(entry).toMatch(/\(not set\)/); // timestamp
    });
});
