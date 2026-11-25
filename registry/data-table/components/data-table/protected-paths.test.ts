import { describe, expect, it } from 'vitest';
import { findProtectedChanges, isProtectedPath, parseChangedFiles } from '../../../../scripts/ci/protected-paths.js';

describe('protected-paths: parseChangedFiles', () => {
    it('parses a modified file', () => {
        expect(parseChangedFiles('M\tregistry/data-table/components/data-table/data-table.tsx')).toEqual([
            'registry/data-table/components/data-table/data-table.tsx',
        ]);
    });

    it('parses an added file', () => {
        expect(parseChangedFiles('A\tregistry/data-table/components/ui/checkbox.tsx')).toEqual([
            'registry/data-table/components/ui/checkbox.tsx',
        ]);
    });

    it('parses a deleted file', () => {
        expect(parseChangedFiles('D\tregistry/data-table/components/ui/skeleton.tsx')).toEqual([
            'registry/data-table/components/ui/skeleton.tsx',
        ]);
    });

    it('parses a rename as both old and new paths', () => {
        const input = 'R100\tregistry/data-table/components/ui/old.tsx\tregistry/data-table/components/ui/new.tsx';
        expect(parseChangedFiles(input)).toEqual([
            'registry/data-table/components/ui/old.tsx',
            'registry/data-table/components/ui/new.tsx',
        ]);
    });

    it('parses multiple lines', () => {
        const input = [
            'M\tREADME.md',
            'A\tregistry/data-table/components/ui/button.tsx',
            'D\tregistry/data-table/components/data-table/use-data-table.ts',
        ].join('\n');
        expect(parseChangedFiles(input)).toEqual([
            'README.md',
            'registry/data-table/components/ui/button.tsx',
            'registry/data-table/components/data-table/use-data-table.ts',
        ]);
    });

    it('parses NUL-delimited output with a non-ASCII path', () => {
        const input = [
            'A\tregistry/data-table/components/ui/café.tsx',
            'M\tregistry/data-table/components/data-table/data-table.tsx',
        ].join('\0') + '\0';
        expect(parseChangedFiles(input)).toEqual([
            'registry/data-table/components/ui/café.tsx',
            'registry/data-table/components/data-table/data-table.tsx',
        ]);
    });

    it('parses a NUL-delimited rename with non-ASCII paths', () => {
        const input = [
            'R100\tregistry/data-table/components/ui/é.tsx\tregistry/data-table/components/ui/è.tsx',
        ].join('\0') + '\0';
        expect(parseChangedFiles(input)).toEqual([
            'registry/data-table/components/ui/é.tsx',
            'registry/data-table/components/ui/è.tsx',
        ]);
    });

    it('returns an empty set for empty input', () => {
        expect(parseChangedFiles('')).toEqual([]);
        expect(parseChangedFiles('\n\n')).toEqual([]);
    });
});

describe('protected-paths: isProtectedPath', () => {
    it('returns true for files under components/ui/', () => {
        expect(isProtectedPath('registry/data-table/components/ui/table.tsx')).toBe(true);
        expect(isProtectedPath('registry/data-table/components/ui/input.tsx')).toBe(true);
    });

    it('returns false for package-owned DataTable components', () => {
        expect(isProtectedPath('registry/data-table/components/data-table/data-table.tsx')).toBe(false);
    });

    it('returns false for unrelated files', () => {
        expect(isProtectedPath('README.md')).toBe(false);
        expect(isProtectedPath('registry.json')).toBe(false);
    });
});

describe('protected-paths: findProtectedChanges', () => {
    it('allows ordinary DataTable component modification', () => {
        const input = 'M\tregistry/data-table/components/data-table/data-table.tsx';
        expect(findProtectedChanges(input)).toEqual([]);
    });

    it('allows unrelated documentation modification', () => {
        const input = 'M\tREADME.md';
        expect(findProtectedChanges(input)).toEqual([]);
    });

    it('detects a protected compatibility shim modification', () => {
        const input = 'M\tregistry/data-table/components/ui/button.tsx';
        expect(findProtectedChanges(input)).toEqual([
            'registry/data-table/components/ui/button.tsx',
        ]);
    });

    it('detects a protected file addition', () => {
        const input = 'A\tregistry/data-table/components/ui/checkbox.tsx';
        expect(findProtectedChanges(input)).toEqual([
            'registry/data-table/components/ui/checkbox.tsx',
        ]);
    });

    it('detects a protected file deletion', () => {
        const input = 'D\tregistry/data-table/components/ui/skeleton.tsx';
        expect(findProtectedChanges(input)).toEqual([
            'registry/data-table/components/ui/skeleton.tsx',
        ]);
    });

    it('detects a protected file rename', () => {
        const input = 'R100\tregistry/data-table/components/ui/dropdown-menu.tsx\tregistry/data-table/components/ui/dropdown-menu.tsx.bak';
        expect(findProtectedChanges(input)).toEqual([
            'registry/data-table/components/ui/dropdown-menu.tsx',
            'registry/data-table/components/ui/dropdown-menu.tsx.bak',
        ]);
    });

    it('reports only protected paths among mixed changes', () => {
        const input = [
            'M\tregistry/data-table/components/data-table/use-data-table.ts',
            'M\tregistry/data-table/components/ui/select.tsx',
            'M\tCHANGELOG.md',
        ].join('\n');
        expect(findProtectedChanges(input)).toEqual([
            'registry/data-table/components/ui/select.tsx',
        ]);
    });
});
