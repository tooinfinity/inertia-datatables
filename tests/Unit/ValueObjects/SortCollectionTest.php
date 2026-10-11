<?php

declare(strict_types=1);

use TooInfinity\InertiaDataTables\Sorting\Sort;
use TooInfinity\InertiaDataTables\Sorting\SortCollection;

describe('SortCollection', function (): void {
    it('creates empty collection', function (): void {
        $collection = SortCollection::make();

        expect($collection->count())->toBe(0);
        expect($collection->isEmpty())->toBeTrue();
        expect($collection->all())->toBe([]);
    });

    it('creates collection with sorts', function (): void {
        $sorts = [Sort::make('name'), Sort::make('email', 'desc')];
        $collection = SortCollection::make($sorts);

        expect($collection->count())->toBe(2);
        expect($collection->isEmpty())->toBeFalse();
    });

    it('parses query string with single sort', function (): void {
        $collection = SortCollection::fromQueryString('name');

        expect($collection->count())->toBe(1);
        expect($collection->first()->column)->toBe('name');
        expect($collection->first()->direction)->toBe('asc');
    });

    it('parses query string with descending sort', function (): void {
        $collection = SortCollection::fromQueryString('-name');

        expect($collection->count())->toBe(1);
        expect($collection->first()->column)->toBe('name');
        expect($collection->first()->direction)->toBe('desc');
    });

    it('parses query string with explicit ascending sort', function (): void {
        $collection = SortCollection::fromQueryString('+name');

        expect($collection->count())->toBe(1);
        expect($collection->first()->column)->toBe('name');
        expect($collection->first()->direction)->toBe('asc');
    });

    it('parses query string with multiple sorts', function (): void {
        $collection = SortCollection::fromQueryString('name,-email,+created_at');

        expect($collection->count())->toBe(3);
        expect($collection->all()[0]->column)->toBe('name');
        expect($collection->all()[0]->direction)->toBe('asc');
        expect($collection->all()[1]->column)->toBe('email');
        expect($collection->all()[1]->direction)->toBe('desc');
        expect($collection->all()[2]->column)->toBe('created_at');
        expect($collection->all()[2]->direction)->toBe('asc');
    });

    it('handles empty query string', function (): void {
        $collection = SortCollection::fromQueryString('');

        expect($collection->count())->toBe(0);
    });

    it('handles whitespace in query string', function (): void {
        $collection = SortCollection::fromQueryString(' name , -email ');

        expect($collection->count())->toBe(2);
    });

    it('skips empty parts in query string', function (): void {
        $collection = SortCollection::fromQueryString('name,,email');

        expect($collection->count())->toBe(2);
    });

    it('skips parts with only direction prefix', function (): void {
        $collection = SortCollection::fromQueryString('-,+name');

        expect($collection->count())->toBe(1);
        expect($collection->first()->column)->toBe('name');
    });

    it('limits collection size', function (): void {
        $sorts = [Sort::make('a'), Sort::make('b'), Sort::make('c'), Sort::make('d')];
        $collection = SortCollection::make($sorts)->limit(2);

        expect($collection->count())->toBe(2);
        expect($collection->all()[0]->column)->toBe('a');
        expect($collection->all()[1]->column)->toBe('b');
    });

    it('returns original collection when limit not exceeded', function (): void {
        $sorts = [Sort::make('a'), Sort::make('b')];
        $collection = SortCollection::make($sorts)->limit(5);

        expect($collection->count())->toBe(2);
    });

    it('converts to query string', function (): void {
        $sorts = [Sort::make('name'), Sort::make('email', 'desc')];
        $collection = SortCollection::make($sorts);

        expect($collection->toQueryString())->toBe('name,-email');
    });

    it('returns correct array representation', function (): void {
        $sorts = [Sort::make('name'), Sort::make('email', 'desc')];
        $collection = SortCollection::make($sorts);

        expect($collection->toArray())->toBe([
            ['column' => 'name', 'direction' => 'asc'],
            ['column' => 'email', 'direction' => 'desc'],
        ]);
    });

    it('implements JsonSerializable', function (): void {
        $sorts = [Sort::make('name')];
        $collection = SortCollection::make($sorts);

        expect(json_encode($collection))->toBe('[{"column":"name","direction":"asc"}]');
    });

    it('implements IteratorAggregate', function (): void {
        $sorts = [Sort::make('name'), Sort::make('email')];
        $collection = SortCollection::make($sorts);

        $iterated = [];
        foreach ($collection as $sort) {
            $iterated[] = $sort->column;
        }

        expect($iterated)->toBe(['name', 'email']);
    });
});
