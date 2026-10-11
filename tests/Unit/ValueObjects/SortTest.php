<?php

declare(strict_types=1);

use TooInfinity\InertiaDataTables\Exceptions\InvalidSortException;
use TooInfinity\InertiaDataTables\Sorting\Sort;

describe('Sort', function (): void {
    it('creates a sort with default ascending direction', function (): void {
        $sort = Sort::make('name');

        expect($sort->column)->toBe('name');
        expect($sort->direction)->toBe('asc');
        expect($sort->isAscending())->toBeTrue();
        expect($sort->isDescending())->toBeFalse();
    });

    it('creates a sort with explicit ascending direction', function (): void {
        $sort = Sort::make('name', 'asc');

        expect($sort->direction)->toBe('asc');
    });

    it('creates a sort with descending direction', function (): void {
        $sort = Sort::make('name', 'desc');

        expect($sort->direction)->toBe('desc');
        expect($sort->isDescending())->toBeTrue();
    });

    it('normalizes direction to lowercase', function (): void {
        $sort = Sort::make('name', 'ASC');

        expect($sort->direction)->toBe('asc');
    });

    it('normalizes DESC to lowercase', function (): void {
        $sort = Sort::make('name', 'DESC');

        expect($sort->direction)->toBe('desc');
    });

    it('throws exception for invalid direction', function (): void {
        expect(fn (): Sort => Sort::make('name', 'ascending'))
            ->toThrow(InvalidSortException::class, 'Invalid sort direction [ascending]. Expected "asc" or "desc".');
    });

    it('throws exception for invalid direction with extra spaces', function (): void {
        expect(fn (): Sort => Sort::make('name', 'asc '))
            ->toThrow(InvalidSortException::class, 'Invalid sort direction [asc ]. Expected "asc" or "desc".');
    });

    it('returns correct array representation', function (): void {
        $sort = Sort::make('name', 'desc');

        expect($sort->toArray())->toBe([
            'column' => 'name',
            'direction' => 'desc',
        ]);
    });

    it('implements JsonSerializable', function (): void {
        $sort = Sort::make('name', 'desc');

        expect(json_encode($sort))->toBe('{"column":"name","direction":"desc"}');
    });
});
