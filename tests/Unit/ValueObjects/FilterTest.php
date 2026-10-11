<?php

declare(strict_types=1);

use TooInfinity\InertiaDataTables\Filtering\Filter;

describe('Filter', function (): void {
    it('creates a filter with column and value', function (): void {
        $filter = Filter::make('status', 'active');

        expect($filter->column)->toBe('status');
        expect($filter->value)->toBe('active');
    });

    it('accepts various value types', function (): void {
        $filter = Filter::make('count', 42);

        expect($filter->value)->toBe(42);
    });

    it('accepts boolean value', function (): void {
        $filter = Filter::make('is_admin', true);

        expect($filter->value)->toBeTrue();
    });

    it('accepts null value', function (): void {
        $filter = Filter::make('deleted_at', null);

        expect($filter->value)->toBeNull();
    });

    it('returns correct array representation', function (): void {
        $filter = Filter::make('status', 'active');

        expect($filter->toArray())->toBe([
            'column' => 'status',
            'value' => 'active',
        ]);
    });

    it('implements JsonSerializable', function (): void {
        $filter = Filter::make('status', 'active');

        expect(json_encode($filter))->toBe('{"column":"status","value":"active"}');
    });

    it('is immutable', function (): void {
        $filter = Filter::make('status', 'active');

        // Properties are public readonly, so they can't be modified
        expect($filter->column)->toBe('status');
    });
});
