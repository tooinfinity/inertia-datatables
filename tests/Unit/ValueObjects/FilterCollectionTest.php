<?php

declare(strict_types=1);

use Illuminate\Http\Request;
use TooInfinity\InertiaDataTables\Filtering\Filter;
use TooInfinity\InertiaDataTables\Filtering\FilterCollection;

describe('FilterCollection', function (): void {
    it('creates empty collection', function (): void {
        $collection = FilterCollection::make();

        expect($collection->count())->toBe(0);
        expect($collection->isEmpty())->toBeTrue();
        expect($collection->all())->toBe([]);
    });

    it('creates collection with filters', function (): void {
        $filters = [Filter::make('status', 'active'), Filter::make('role', 'admin')];
        $collection = FilterCollection::make($filters);

        expect($collection->count())->toBe(2);
    });

    it('parses filters from request', function (): void {
        $request = Request::create('/test?filters[status]=active&filters[role]=admin');
        $collection = FilterCollection::fromRequest($request, 'filters');

        expect($collection->count())->toBe(2);
        expect($collection->get('status')->value)->toBe('active');
        expect($collection->get('role')->value)->toBe('admin');
    });

    it('ignores empty filter values', function (): void {
        $request = Request::create('/test?filters[status]=active&filters[role]=&filters[type]=');
        $collection = FilterCollection::fromRequest($request, 'filters');

        expect($collection->count())->toBe(1);
        expect($collection->has('status'))->toBeTrue();
        expect($collection->has('role'))->toBeFalse();
    });

    it('ignores null filter values', function (): void {
        $request = Request::create('/test?filters[status]=active&filters[role]=null');
        // Note: 'null' as string is not null, so it will be included
        $collection = FilterCollection::fromRequest($request, 'filters');

        expect($collection->count())->toBe(2);
    });

    it('returns empty collection for non-array filters input', function (): void {
        $request = Request::create('/test?filters=notanarray');
        $collection = FilterCollection::fromRequest($request, 'filters');

        expect($collection->count())->toBe(0);
    });

    it('gets filter by column', function (): void {
        $filters = [Filter::make('status', 'active')];
        $collection = FilterCollection::make($filters);

        $filter = $collection->get('status');
        expect($filter)->toBeInstanceOf(Filter::class);
        expect($filter->value)->toBe('active');
    });

    it('returns null for non-existent column', function (): void {
        $collection = FilterCollection::make();

        expect($collection->get('nonexistent'))->toBeNull();
    });

    it('checks if column has filter', function (): void {
        $filters = [Filter::make('status', 'active')];
        $collection = FilterCollection::make($filters);

        expect($collection->has('status'))->toBeTrue();
        expect($collection->has('role'))->toBeFalse();
    });

    it('gets filter value', function (): void {
        $filters = [Filter::make('status', 'active')];
        $collection = FilterCollection::make($filters);

        expect($collection->getValue('status'))->toBe('active');
        expect($collection->getValue('role'))->toBeNull();
    });

    it('limits collection size', function (): void {
        $filters = [
            Filter::make('a', '1'),
            Filter::make('b', '2'),
            Filter::make('c', '3'),
        ];
        $collection = FilterCollection::make($filters)->limit(2);

        expect($collection->count())->toBe(2);
    });

    it('sanitizes filter values', function (): void {
        $longValue = str_repeat('a', 1000);
        $filters = [Filter::make('status', $longValue)];
        $collection = FilterCollection::make($filters)->sanitizeValues(100);

        expect(strlen($collection->get('status')->value))->toBe(100);
    });

    it('does not sanitize non-string values', function (): void {
        $filters = [Filter::make('count', 42)];
        $collection = FilterCollection::make($filters)->sanitizeValues(10);

        expect($collection->get('count')->value)->toBe(42);
    });

    it('does not sanitize values under limit', function (): void {
        $filters = [Filter::make('status', 'active')];
        $collection = FilterCollection::make($filters)->sanitizeValues(100);

        expect($collection->get('status')->value)->toBe('active');
    });

    it('returns correct array representation', function (): void {
        $filters = [Filter::make('status', 'active'), Filter::make('role', 'admin')];
        $collection = FilterCollection::make($filters);

        expect($collection->toArray())->toBe([
            ['column' => 'status', 'value' => 'active'],
            ['column' => 'role', 'value' => 'admin'],
        ]);
    });

    it('implements JsonSerializable', function (): void {
        $filters = [Filter::make('status', 'active')];
        $collection = FilterCollection::make($filters);

        expect(json_encode($collection))->toBe('[{"column":"status","value":"active"}]');
    });
});
