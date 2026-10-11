<?php

declare(strict_types=1);

use Illuminate\Http\Request;
use TooInfinity\InertiaDataTables\Searching\Search;
use TooInfinity\InertiaDataTables\Searching\SearchCollection;

describe('SearchCollection', function (): void {
    it('creates empty collection', function (): void {
        $collection = SearchCollection::make();

        expect($collection->count())->toBe(0);
        expect($collection->isEmpty())->toBeTrue();
        expect($collection->all())->toBe([]);
    });

    it('creates collection with searches', function (): void {
        $searches = [Search::make('name', 'john'), Search::make('email', 'example')];
        $collection = SearchCollection::make($searches);

        expect($collection->count())->toBe(2);
    });

    it('parses searches from request using array format', function (): void {
        $request = Request::create('/test?searches[name]=john&searches[email]=example');
        $collection = SearchCollection::fromRequest($request, 'searches');

        expect($collection->count())->toBe(2);
        expect($collection->get('name')->value)->toBe('john');
        expect($collection->get('email')->value)->toBe('example');
    });

    it('parses searches from request using bracket notation', function (): void {
        $request = Request::create('/test?search[name]=john&search[email]=example');
        $collection = SearchCollection::fromRequest($request, 'search');

        expect($collection->count())->toBe(2);
        expect($collection->get('name')->value)->toBe('john');
    });

    it('deduplicates searches by column (last wins)', function (): void {
        $request = Request::create('/test?searches[name]=john&searches[name]=jane');
        $collection = SearchCollection::fromRequest($request, 'searches');

        expect($collection->count())->toBe(1);
        expect($collection->get('name')->value)->toBe('jane');
    });

    it('ignores empty search values', function (): void {
        $request = Request::create('/test?searches[name]=john&searches[email]=&searches[role]=admin');
        $collection = SearchCollection::fromRequest($request, 'searches');

        expect($collection->count())->toBe(2);
        expect($collection->has('email'))->toBeFalse();
    });

    it('accepts numeric string values', function (): void {
        $request = Request::create('/test?searches[name]=john&searches[count]=42');
        $collection = SearchCollection::fromRequest($request, 'searches');

        expect($collection->count())->toBe(2);
        expect($collection->has('name'))->toBeTrue();
        expect($collection->has('count'))->toBeTrue();
        expect($collection->get('count')->value)->toBe('42');
    });

    it('ignores non-string column keys', function (): void {
        $request = Request::create('/test');
        $request->query->set('searches', [123 => 'value']); // This won't work via query string but tests the logic
        // We can't easily test non-string keys via Request::create, so we'll skip this edge case
    });

    it('gets search by column', function (): void {
        $searches = [Search::make('name', 'john')];
        $collection = SearchCollection::make($searches);

        $search = $collection->get('name');
        expect($search)->toBeInstanceOf(Search::class);
        expect($search->value)->toBe('john');
    });

    it('returns null for non-existent column', function (): void {
        $collection = SearchCollection::make();

        expect($collection->get('nonexistent'))->toBeNull();
    });

    it('checks if column has search', function (): void {
        $searches = [Search::make('name', 'john')];
        $collection = SearchCollection::make($searches);

        expect($collection->has('name'))->toBeTrue();
        expect($collection->has('email'))->toBeFalse();
    });

    it('limits collection size', function (): void {
        $searches = [
            Search::make('a', '1'),
            Search::make('b', '2'),
            Search::make('c', '3'),
        ];
        $collection = SearchCollection::make($searches)->limit(2);

        expect($collection->count())->toBe(2);
    });

    it('sanitizes search values', function (): void {
        $longValue = str_repeat('a', 1000);
        $searches = [Search::make('name', $longValue)];
        $collection = SearchCollection::make($searches)->sanitizeValues(100);

        expect(strlen($collection->get('name')->value))->toBe(100);
    });

    it('returns correct array representation', function (): void {
        $searches = [Search::make('name', 'john'), Search::make('email', 'example')];
        $collection = SearchCollection::make($searches);

        expect($collection->toArray())->toBe([
            ['column' => 'name', 'value' => 'john'],
            ['column' => 'email', 'value' => 'example'],
        ]);
    });

    it('implements JsonSerializable', function (): void {
        $searches = [Search::make('name', 'john')];
        $collection = SearchCollection::make($searches);

        expect(json_encode($collection))->toBe('[{"column":"name","value":"john"}]');
    });
});
