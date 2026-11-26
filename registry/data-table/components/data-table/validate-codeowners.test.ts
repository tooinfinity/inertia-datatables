import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
    REQUIRED_PATHS as PRODUCTION_REQUIRED_PATHS,
    isValidOwner,
    validateCodeowners,
} from '../../../../scripts/ci/validate-codeowners.js';

const REQUIRED_PATHS = [
    'registry/data-table/components/ui/',
    'public/r/',
    'registry.json',
    '.github/CODEOWNERS',
    'docs/architecture/shadcn-component-ownership.md',
];

const fullCodeowners = [
    '# comment line',
    '',
    'registry/data-table/components/ui/ @tooinfinity',
    'public/r/ @tooinfinity',
    'registry.json @tooinfinity',
    '.github/CODEOWNERS @tooinfinity',
    'docs/architecture/shadcn-component-ownership.md @tooinfinity',
].join('\n');

describe('validate-codeowners', () => {
    it('passes when all required protected paths are covered', () => {
        const result = validateCodeowners(fullCodeowners, REQUIRED_PATHS);
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
        expect(result.rules).toHaveLength(5);
    });

    it('passes with leading-slash patterns', () => {
        const content = [
            '/registry/data-table/components/ui/ @tooinfinity',
            '/public/r/ @tooinfinity',
            '/registry.json @tooinfinity',
            '.github/CODEOWNERS @tooinfinity',
            '/docs/architecture/shadcn-component-ownership.md @tooinfinity',
        ].join('\n');
        const result = validateCodeowners(content, REQUIRED_PATHS);
        expect(result.valid).toBe(true);
    });

    it('ignores comments and blank lines', () => {
        const content = [
            '# only comments and blanks',
            '',
            'registry/data-table/components/ui/ @tooinfinity',
            '',
            'public/r/ @tooinfinity',
            'registry.json @tooinfinity',
            '.github/CODEOWNERS @tooinfinity',
            'docs/architecture/shadcn-component-ownership.md @tooinfinity',
        ].join('\n');
        const result = validateCodeowners(content, REQUIRED_PATHS);
        expect(result.valid).toBe(true);
    });

    it('fails when a required protected path rule is removed', () => {
        const content = fullCodeowners.replace(
            /^registry\/data-table\/components\/ui\/ @tooinfinity$/m,
            '',
        );
        const result = validateCodeowners(content, REQUIRED_PATHS);
        expect(result.valid).toBe(false);
        expect(result.errors.some((error) => error.includes('registry/data-table/components/ui/'))).toBe(true);
    });

    it('fails when a required protected path is missing entirely', () => {
        const content = 'public/r/ @tooinfinity\nregistry.json @tooinfinity\n';
        const result = validateCodeowners(content, REQUIRED_PATHS);
        expect(result.valid).toBe(false);
        expect(result.errors.some((error) => error.includes('registry/data-table/components/ui/'))).toBe(true);
        expect(result.errors.some((error) => error.includes('docs/architecture/shadcn-component-ownership.md'))).toBe(true);
        expect(result.errors.some((error) => error.includes('.github/CODEOWNERS'))).toBe(true);
    });

    it('fails on invalid syntax: rule without an owner', () => {
        const content = 'registry/data-table/components/ui/\n';
        const result = validateCodeowners(content, REQUIRED_PATHS);
        expect(result.valid).toBe(false);
        expect(result.errors.some((error) => error.includes('missing pattern or owner'))).toBe(true);
    });

    it('fails on invalid syntax: owner without a pattern', () => {
        const content = '@tooinfinity\n';
        const result = validateCodeowners(content, REQUIRED_PATHS);
        expect(result.valid).toBe(false);
        expect(result.errors.some((error) => error.includes('missing pattern or owner'))).toBe(true);
    });

    it('fails on blank CODEOWNERS (no required coverage)', () => {
        const result = validateCodeowners('', REQUIRED_PATHS);
        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(REQUIRED_PATHS.length);
    });

    it('passes when rules use inline comments', () => {
        const content = [
            'registry/data-table/components/ui/ @tooinfinity # compatibility shims',
            'public/r/ @tooinfinity # generated artifacts',
            'registry.json @tooinfinity # manifest',
            '.github/CODEOWNERS @tooinfinity # self-ownership',
            'docs/architecture/shadcn-component-ownership.md @tooinfinity # policy',
        ].join('\n');
        const result = validateCodeowners(content, REQUIRED_PATHS);
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
        expect(result.rules).toHaveLength(5);
    });

    it('passes with directory rules that omit the trailing slash', () => {
        const content = [
            'registry/data-table/components/ui @tooinfinity',
            'public/r @tooinfinity',
            'registry.json @tooinfinity',
            '.github/CODEOWNERS @tooinfinity',
            'docs/architecture/shadcn-component-ownership.md @tooinfinity',
        ].join('\n');
        const result = validateCodeowners(content, REQUIRED_PATHS);
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
    });

    it('passes when CODEOWNERS owns itself (self-ownership)', () => {
        const content = fullCodeowners;
        const result = validateCodeowners(content, REQUIRED_PATHS);
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
    });

    it('fails when CODEOWNERS self-ownership rule is removed', () => {
        const content = fullCodeowners.replace(
            /^\.github\/CODEOWNERS @tooinfinity$/m,
            '',
        );
        const result = validateCodeowners(content, REQUIRED_PATHS);
        expect(result.valid).toBe(false);
        expect(
            result.errors.some((error) => error.includes('.github/CODEOWNERS')),
        ).toBe(true);
    });

    it('rejects a bare @ owner token', () => {
        const content = [
            'registry/data-table/components/ui/ @',
            'public/r/ @tooinfinity',
            'registry.json @tooinfinity',
            '.github/CODEOWNERS @tooinfinity',
            'docs/architecture/shadcn-component-ownership.md @tooinfinity',
        ].join('\n');
        const result = validateCodeowners(content, REQUIRED_PATHS);
        expect(result.valid).toBe(false);
        expect(
            result.errors.some((error) => error.includes('malformed owner')),
        ).toBe(true);
    });

    it('rejects an @/ owner token', () => {
        const content = [
            'registry/data-table/components/ui/ @/',
            'public/r/ @tooinfinity',
            'registry.json @tooinfinity',
            '.github/CODEOWNERS @tooinfinity',
            'docs/architecture/shadcn-component-ownership.md @tooinfinity',
        ].join('\n');
        const result = validateCodeowners(content, REQUIRED_PATHS);
        expect(result.valid).toBe(false);
        expect(
            result.errors.some((error) => error.includes('malformed owner')),
        ).toBe(true);
    });

    it('rejects extra separators (@org/team/extra)', () => {
        const content = [
            'registry/data-table/components/ui/ @tooinfinity/maintainers/extra',
            'public/r/ @tooinfinity',
            'registry.json @tooinfinity',
            '.github/CODEOWNERS @tooinfinity',
            'docs/architecture/shadcn-component-ownership.md @tooinfinity',
        ].join('\n');
        const result = validateCodeowners(content, REQUIRED_PATHS);
        expect(result.valid).toBe(false);
        expect(
            result.errors.some((error) => error.includes('malformed owner')),
        ).toBe(true);
    });

    it('rejects empty segments (@/team, @org/)', () => {
        const content = [
            'registry/data-table/components/ui/ @/team',
            'public/r/ @tooinfinity',
            'registry.json @tooinfinity',
            '.github/CODEOWNERS @tooinfinity',
            'docs/architecture/shadcn-component-ownership.md @tooinfinity',
        ].join('\n');
        const result = validateCodeowners(content, REQUIRED_PATHS);
        expect(result.valid).toBe(false);
        expect(
            result.errors.some((error) => error.includes('malformed owner')),
        ).toBe(true);
    });

    it('rejects leading hyphens (-org, -team)', () => {
        const content = [
            'registry/data-table/components/ui/ @-org',
            'public/r/ @tooinfinity',
            'registry.json @tooinfinity',
            '.github/CODEOWNERS @tooinfinity',
            'docs/architecture/shadcn-component-ownership.md @tooinfinity',
        ].join('\n');
        const result = validateCodeowners(content, REQUIRED_PATHS);
        expect(result.valid).toBe(false);
        expect(
            result.errors.some((error) => error.includes('malformed owner')),
        ).toBe(true);
    });

    it('rejects trailing hyphens (org-, team-)', () => {
        const content = [
            'registry/data-table/components/ui/ @org-',
            'public/r/ @tooinfinity',
            'registry.json @tooinfinity',
            '.github/CODEOWNERS @tooinfinity',
            'docs/architecture/shadcn-component-ownership.md @tooinfinity',
        ].join('\n');
        const result = validateCodeowners(content, REQUIRED_PATHS);
        expect(result.valid).toBe(false);
        expect(
            result.errors.some((error) => error.includes('malformed owner')),
        ).toBe(true);
    });

    it('rejects invalid characters', () => {
        const content = [
            'registry/data-table/components/ui/ @org!name',
            'public/r/ @tooinfinity',
            'registry.json @tooinfinity',
            '.github/CODEOWNERS @tooinfinity',
            'docs/architecture/shadcn-component-ownership.md @tooinfinity',
        ].join('\n');
        const result = validateCodeowners(content, REQUIRED_PATHS);
        expect(result.valid).toBe(false);
        expect(
            result.errors.some((error) => error.includes('malformed owner')),
        ).toBe(true);
    });
});

describe('isValidOwner', () => {
    it('accepts a username owner', () => {
        expect(isValidOwner('@tooinfinity')).toBe(true);
    });

    it('accepts a single-character username', () => {
        expect(isValidOwner('@t')).toBe(true);
    });

    it('accepts an org/team owner', () => {
        expect(isValidOwner('@tooinfinity/maintainers')).toBe(true);
    });

    it('rejects a bare @ token', () => {
        expect(isValidOwner('@')).toBe(false);
    });

    it('rejects an @/ token', () => {
        expect(isValidOwner('@/')).toBe(false);
    });

    it('rejects extra separators (@org/team/extra)', () => {
        expect(isValidOwner('@tooinfinity/maintainers/extra')).toBe(false);
    });

    it('rejects empty segments (@/team, @org/)', () => {
        expect(isValidOwner('@/team')).toBe(false);
        expect(isValidOwner('@org/')).toBe(false);
    });

    it('rejects leading hyphens (-org, -team)', () => {
        expect(isValidOwner('@-org')).toBe(false);
        expect(isValidOwner('@org/-team')).toBe(false);
    });

    it('rejects trailing hyphens (org-, team-)', () => {
        expect(isValidOwner('@org-')).toBe(false);
        expect(isValidOwner('@org/team-')).toBe(false);
    });

    it('rejects invalid characters', () => {
        expect(isValidOwner('@org!name')).toBe(false);
        expect(isValidOwner('@org/team!')).toBe(false);
        expect(isValidOwner('@org.name')).toBe(false);
    });

    it('rejects consecutive hyphens in username', () => {
        expect(isValidOwner('@foo--bar')).toBe(false);
    });

    it('rejects consecutive hyphens in team slug', () => {
        expect(isValidOwner('@org/foo--bar')).toBe(false);
    });

    it('rejects a non-owner token', () => {
        expect(isValidOwner('registry.json')).toBe(false);
        expect(isValidOwner('')).toBe(false);
    });
});

describe('validate-codeowners: enforcement self-protection', () => {
    const enforcementCodeowners = [
        'registry/data-table/components/ui/ @tooinfinity',
        'public/r/ @tooinfinity',
        'registry.json @tooinfinity',
        '.github/CODEOWNERS @tooinfinity',
        '.github/workflows/ @tooinfinity',
        'scripts/ci/ @tooinfinity',
        'docs/architecture/shadcn-component-ownership.md @tooinfinity',
    ].join('\n');

    it('requires ownership coverage for ownership workflow and CI scripts in production REQUIRED_PATHS', () => {
        expect(PRODUCTION_REQUIRED_PATHS).toContain('.github/workflows/ownership.yml');
        expect(PRODUCTION_REQUIRED_PATHS).toContain('scripts/ci/');
    });

    it('passes when all production required paths including workflows and scripts/ci are covered', () => {
        const result = validateCodeowners(enforcementCodeowners, PRODUCTION_REQUIRED_PATHS);
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
    });

    it('fails when the .github/workflows/ ownership rule is removed', () => {
        const content = enforcementCodeowners.replace(
            /^\.github\/workflows\/ @tooinfinity$/m,
            '',
        );
        const result = validateCodeowners(content, PRODUCTION_REQUIRED_PATHS);
        expect(result.valid).toBe(false);
        expect(
            result.errors.some((error) => error.includes('.github/workflows/ownership.yml')),
        ).toBe(true);
    });

    it('fails when the scripts/ci/ ownership rule is removed', () => {
        const content = enforcementCodeowners.replace(
            /^scripts\/ci\/ @tooinfinity$/m,
            '',
        );
        const result = validateCodeowners(content, PRODUCTION_REQUIRED_PATHS);
        expect(result.valid).toBe(false);
        expect(
            result.errors.some((error) => error.includes('scripts/ci/')),
        ).toBe(true);
    });

    it('validates the repository .github/CODEOWNERS file against production REQUIRED_PATHS', () => {
        const content = readFileSync('.github/CODEOWNERS', 'utf-8');
        const result = validateCodeowners(content, PRODUCTION_REQUIRED_PATHS);
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
    });
});
