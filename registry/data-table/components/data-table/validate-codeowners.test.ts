import { describe, expect, it } from 'vitest';
import { validateCodeowners } from '../../../../scripts/ci/validate-codeowners.js';

const REQUIRED_PATHS = [
    'registry/data-table/components/ui/',
    'public/r/',
    'registry.json',
    'docs/architecture/shadcn-component-ownership.md',
];

const fullCodeowners = [
    '# comment line',
    '',
    'registry/data-table/components/ui/ @tooinfinity',
    'public/r/ @tooinfinity',
    'registry.json @tooinfinity',
    'docs/architecture/shadcn-component-ownership.md @tooinfinity',
].join('\n');

describe('validate-codeowners', () => {
    it('passes when all required protected paths are covered', () => {
        const result = validateCodeowners(fullCodeowners, REQUIRED_PATHS);
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
        expect(result.rules).toHaveLength(4);
    });

    it('passes with leading-slash patterns', () => {
        const content = [
            '/registry/data-table/components/ui/ @tooinfinity',
            '/public/r/ @tooinfinity',
            '/registry.json @tooinfinity',
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
});
